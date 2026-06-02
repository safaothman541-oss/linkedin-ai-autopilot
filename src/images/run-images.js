// run-images.js — daily image pipeline. For each requested pillar:
//   pick today's topic → write English content → make AI background →
//   render the precise card → send to Telegram → post the image to LinkedIn.
// Pillars: "claude" (Claude skill), "models" (3-model face-off), "erp" (ERPIQ).
// PILLAR env selects one ("claude"|"models"|"erp") or "all" (default).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pick, PILLARS } from "./topics.js";
import { generatePostContent } from "./content.js";
import { makeBackground } from "./background.js";
import { renderCard } from "./card.js";
import { getAccessToken, getPersonUrn, postImageToLinkedIn } from "../linkedin.js";
import { sendMessage, sendPhoto } from "../telegram.js";

const env = process.env;
// Default destination: the topic-group's Drafts topic if configured; else the private chat.
const TG = env.TELEGRAM_TOPIC_CHAT_ID
  ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_TOPIC_CHAT_ID, threadId: env.TELEGRAM_TOPIC_DRAFTS }
  : { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
const STATUS = env.TELEGRAM_TOPIC_CHAT_ID
  ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_TOPIC_CHAT_ID, threadId: env.TELEGRAM_TOPIC_STATUS }
  : TG;
const POST_MODE = (env.IMAGES_POST_MODE || "auto").toLowerCase();
const BG_MODE = (env.IMAGE_BG_MODE || "hybrid").toLowerCase();
const OFFSET = parseInt(env.IMAGE_OFFSET || "0", 10) || 0;
const BRAND = { handle: env.BRAND_HANDLE || "", tagline: env.BRAND_TAGLINE || "AI · Engineering · ERPIQ" };

const ORDER = ["claude", "models", "erp"];
function selectedPillars() {
  const p = (env.PILLAR || "all").toLowerCase();
  if (p === "all") return ORDER;
  return p.split(",").map((s) => s.trim()).filter((s) => PILLARS[s]);
}

async function getLinkedIn() {
  if (POST_MODE !== "auto") return {};
  try {
    const token = await getAccessToken({
      accessToken: env.LINKEDIN_ACCESS_TOKEN, refreshToken: env.LINKEDIN_REFRESH_TOKEN,
      clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET,
    });
    const personUrn = await getPersonUrn({ token, personUrn: env.LINKEDIN_PERSON_URN });
    return { token, personUrn };
  } catch (e) {
    await sendMessage({ ...TG, text: `⚠️ LinkedIn auth failed: ${e.message}\nImages will go to Telegram only.` });
    return {};
  }
}

async function runOne(pillar, li, results) {
  const meta = PILLARS[pillar];
  const topic = pick(meta.list, OFFSET);
  const name = topic.title || topic.category;
  try {
    const content = await generatePostContent({ pillar, topic, apiKey: env.GEMINI_API_KEY });
    const bg = await makeBackground({
      apiKey: env.GEMINI_API_KEY, prompt: content.imagePrompt, mode: BG_MODE,
      cfAccountId: env.CF_ACCOUNT_ID, cfApiToken: env.CF_API_TOKEN,
    });

    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `img-${pillar}-`));
    const file = path.join(workdir, `${pillar}.png`);
    await renderCard({ pillar, content, bg, brand: BRAND, file });
    try { fs.copyFileSync(file, `image-${pillar}.png`); } catch {}

    const postText = `${content.post}\n\n${(content.hashtags || []).join(" ")}`.trim();
    const tag = `${meta.label} · ${topic._index + 1}/${topic._total}`;
    await sendPhoto({ ...TG, file, caption: `🖼️ ${tag} — ${name}\n\n${postText}`.slice(0, 1024) });

    if (POST_MODE === "auto" && li.token && li.personUrn) {
      await postImageToLinkedIn({ token: li.token, personUrn: li.personUrn, file, text: postText, altText: content.altText });
      results.push(`✅ ${pillar} (${name}): posted to LinkedIn`);
    } else {
      results.push(`📝 ${pillar} (${name}): sent to Telegram — post manually`);
    }
  } catch (e) {
    console.error(`pillar ${pillar} failed:`, e);
    results.push(`❌ ${pillar} (${name}): ${e.message}`);
    await sendMessage({ ...TG, text: `⚠️ Image ${pillar} failed: ${e.message}` });
  }
}

async function main() {
  const pillars = selectedPillars();
  if (!pillars.length) throw new Error(`no valid pillar in PILLAR="${env.PILLAR}"`);
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  if (!TG.token || !TG.chatId) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — nothing will be sent to Telegram.");
  }

  const li = await getLinkedIn();
  const results = [];
  for (const pillar of pillars) await runOne(pillar, li, results);

  await sendMessage({ ...STATUS, text: `🖼️ Image batch done (mode: ${POST_MODE})\n` + results.join("\n") });
}

main().catch(async (e) => {
  console.error(e);
  await sendMessage({ ...STATUS, text: `❌ Image pipeline error: ${e.message}` });
  process.exit(1);
});
