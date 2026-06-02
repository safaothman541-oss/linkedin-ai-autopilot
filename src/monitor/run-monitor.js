// run-monitor.js — watch LinkedIn accounts via Apify; when they post something
// new, send the full content + image + a ready-to-use image prompt + the link to
// Telegram, so you can repost your own version.
// Sends only (no webhook needed). Run on a schedule or on demand: `npm run monitor`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendMessage } from "../telegram.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(HERE, "..", "..", "monitor-state.json");

const env = process.env;
// destination: Monitor topic in the group; falls back to private chat
const TG = env.TELEGRAM_TOPIC_CHAT_ID
  ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_TOPIC_CHAT_ID, threadId: env.TELEGRAM_TOPIC_MONITOR }
  : { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
const STATUS = env.TELEGRAM_TOPIC_CHAT_ID
  ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_TOPIC_CHAT_ID, threadId: env.TELEGRAM_TOPIC_STATUS }
  : TG;
// Must match the worker's marker so a reply to a monitored post triggers the same buttons.
const CAPTION_MARK = "📝 CAPTION (posted with your image):";
const ACTOR = "apimaestro~linkedin-profile-posts";
const PER_CHECK = Math.max(2, parseInt(env.MONITOR_POSTS_PER_CHECK || "5", 10) || 5);

// accounts: comma-separated usernames or profile URLs (MONITOR_ACCOUNTS), default one.
function accounts() {
  return (env.MONITOR_ACCOUNTS || "endritrestelica")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => s.replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\?.*$/, ""));
}

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { seen: {}, started: {} }; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

// find the first image-like URL anywhere inside the post's media object
function firstImageUrl(media) {
  const out = [];
  const walk = (x) => {
    if (!x) return;
    if (typeof x === "string") { if (/^https?:\/\/[^ ]*(licdn|\.jpg|\.jpeg|\.png|\.webp)/i.test(x)) out.push(x); return; }
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x === "object") return Object.values(x).forEach(walk);
  };
  walk(media);
  return out[0] || null;
}

async function fetchPosts(account) {
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: account, total_posts: PER_CHECK }),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const items = await r.json();
  const arr = Array.isArray(items) ? items : (items.items || []);
  return arr.map((p) => ({
    urn: p.full_urn || p.urn?.activity_urn || p.url,
    text: (p.text || "").trim(),
    url: p.url || "",
    image: firstImageUrl(p.media),
    author: p.author?.name || p.author?.full_name || account,
    date: p.posted_at?.date || "",
  })).filter((p) => p.urn);
}

async function genImagePrompt(text) {
  if (!env.GEMINI_API_KEY || !text) return null;
  const prompt = `Read this LinkedIn post and write ONE vivid, art-directed image-generation prompt (for a premium, professional graphic with NO text in it) that captures its core idea so I can create my own matching visual. Return ONLY the prompt, one paragraph.\n\nPOST:\n${text.slice(0, 1200)}`;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8 } }),
    });
    return (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch { return null; }
}

// translate the post into Arabic + Kurdish Sorani (for the public channel)
async function translate(text) {
  if (!env.GEMINI_API_KEY || !text) return { ar: "", ckb: "" };
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  const body = JSON.stringify({ contents: [{ parts: [{ text: `Translate this LinkedIn post into (1) Modern Standard Arabic and (2) Kurdish Sorani. Natural, professional. Return STRICT JSON only: {"ar":"...","ckb":"..."}.\n\nPOST:\n${text.slice(0, 1500)}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } });
  for (const m of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" }, body });
      if (!r.ok) continue;
      const o = JSON.parse(((await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      if (o.ar || o.ckb) return { ar: o.ar || "", ckb: o.ckb || "" };
    } catch { /* next model */ }
  }
  return { ar: "", ckb: "" };
}


async function sendPhotoUrl(chatId, photo, caption, threadId) {
  try {
    const body = { chat_id: chatId, photo, caption: (caption || "").slice(0, 1024) };
    if (threadId) body.message_thread_id = Number(threadId);
    const r = await fetch(`https://api.telegram.org/bot${TG.token}/sendPhoto`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

async function deliverTo(chatId, post, imgPrompt, threadId) {
  const header = `📥 ${post.author}${post.date ? ` · ${post.date}` : ""}`;
  if (post.image) await sendPhotoUrl(chatId, post.image, header, threadId);
  const body =
    `${post.image ? "" : header + "\n\n"}` +
    (imgPrompt ? `🎨 IMAGE PROMPT (make your own visual):\n${imgPrompt}\n\n` : "") +
    `🔗 Original: ${post.url}\n\n` +
    `↩️ Reply to THIS message with YOUR image to post it.\n\n` +
    `${CAPTION_MARK}\n${post.text}`;
  await sendMessage({ token: TG.token, chatId, text: body.slice(0, 4000), threadId });
}

// public channel: clean repost (NO prompt, NO raw image link) + AR + CKB translations
async function deliverToChannel(chatId, post) {
  const header = `📥 ${post.author}${post.date ? ` · ${post.date}` : ""}`;
  if (post.image) await sendPhotoUrl(chatId, post.image, header);
  await sendMessage({ token: TG.token, chatId, text: `${post.image ? "" : header + "\n\n"}${post.text}\n\n🔗 ${post.url}`.slice(0, 4000) });
  const tr = await translate(post.text);
  const tmsg = [tr.ar ? `🇸🇦 العربية:\n${tr.ar}` : "", tr.ckb ? `🟢 کوردی (سۆرانی):\n${tr.ckb}` : ""].filter(Boolean).join("\n\n———\n\n");
  if (tmsg) await sendMessage({ token: TG.token, chatId, text: tmsg.slice(0, 4000) });
}

async function deliver(post) {
  const imgPrompt = await genImagePrompt(post.text);
  // Deliver to YOUR Telegram only. Posting to the public channel / LinkedIn is
  // YOUR call — reply to this message with your image and tap a button.
  await deliverTo(TG.chatId, post, imgPrompt, TG.threadId);
}

async function main() {
  if (!env.APIFY_TOKEN) throw new Error("APIFY_TOKEN not set");
  if (!TG.token || !TG.chatId) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
  const state = loadState();
  let delivered = 0, checked = 0;

  for (const acc of accounts()) {
    let posts;
    try { posts = await fetchPosts(acc); } catch (e) { await sendMessage({ ...STATUS, text: `⚠️ Monitor ${acc} failed: ${e.message}` }); continue; }
    checked++;
    const firstTime = !state.started[acc];
    const fresh = posts.filter((p) => !state.seen[p.urn]);
    // FIRST run for an account: baseline only — send NOTHING (so a lost state can
    // never re-send old posts). After that, send only genuinely-new posts.
    if (!firstTime) {
      for (const p of fresh.slice().reverse()) { await deliver(p); delivered++; }
    }
    for (const p of posts) state.seen[p.urn] = true; // mark everything seen either way
    state.started[acc] = true;
  }

  saveState(state);
  const msg = delivered ? `✅ Monitor: sent ${delivered} new post(s) from ${checked} account(s).` : `🔁 Monitor: checked ${checked} account(s), nothing new.`;
  await sendMessage({ ...STATUS, text: msg });
  console.log(msg);
}

main().catch(async (e) => { console.error(e); await sendMessage({ ...STATUS, text: `❌ Monitor error: ${e.message}` }); process.exit(1); });
