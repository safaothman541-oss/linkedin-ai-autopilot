// run-email.js — AI-judged email monitor. Checks Gmail (IMAP) for new emails,
// lets Gemini rate each one's importance, and sends only the important ones to
// Telegram (sender + subject + AI summary + why it matters).
// Send-only. Run on a schedule or on demand: `npm run email`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { sendMessage } from "../telegram.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(HERE, "..", "..", "email-state.json");
const env = process.env;
// destination: Email topic in the group; falls back to private chat
const TG = env.TELEGRAM_TOPIC_CHAT_ID
  ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_TOPIC_CHAT_ID, threadId: env.TELEGRAM_TOPIC_EMAIL }
  : { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
const MAX_PER_RUN = 25;      // cap classifications per run (cost / spam guard)

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

async function classify(mail) {
  const prompt = `You are an email triage assistant. Decide if this email is IMPORTANT for the user to see promptly.
IMPORTANT = urgent, financial, legal, security/account alerts, deadlines, invoices/payments, or a real person who needs a reply.
NOT important = newsletters, marketing/promotions, social-media notifications, automated digests, "no-reply" noise, spam.
Return STRICT JSON only: {"important": true|false, "level": "high"|"medium"|"low", "summary": "<=16 word summary", "reason": "<=12 word why"}.

FROM: ${mail.from}
SUBJECT: ${mail.subject}
BODY: ${mail.text}`;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
    });
    const o = JSON.parse(((await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
    return { important: !!o.important, level: o.level || "low", summary: o.summary || "", reason: o.reason || "" };
  } catch { return { important: false, level: "low", summary: "", reason: "" }; }
}

async function notify(mail, v) {
  const emoji = v.level === "high" ? "🔴" : v.level === "medium" ? "🟡" : "🟢";
  const text =
    `📧 ${emoji} Important email · ${v.level}\n\n` +
    `👤 ${mail.from}\n` +
    `📌 ${mail.subject || "(no subject)"}\n` +
    (mail.date ? `🕐 ${new Date(mail.date).toLocaleString("en-US")}\n` : "") +
    `\n📝 ${v.summary}\n💡 ${v.reason}`;
  await sendMessage({ ...TG, text: text.slice(0, 4000) });
}

async function toMail(source) {
  const p = await simpleParser(source);
  return {
    from: p.from?.text || "",
    subject: p.subject || "",
    date: p.date || null,
    text: (p.text || p.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500),
  };
}

async function main() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not set");
  if (!TG.token || !TG.chatId) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD }, logger: false });
  await client.connect();
  const state = loadState();
  let notified = 0, judged = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uidNext = client.mailbox.uidNext;
    if (!state.lastUid) {
      // FIRST RUN: set the baseline only — never judge/send the existing backlog.
      // This way, if the state is ever lost, we silently re-baseline instead of
      // re-sending old emails. Only emails that arrive AFTER now are considered.
      state.lastUid = uidNext - 1;
      saveState(state);
      await sendMessage({ ...TG, text: `📧 Email monitor is ON for ${env.GMAIL_USER}.\nFrom now on, Gemini judges only NEW emails and pings you about important ones.` });
    } else {
      const start = state.lastUid + 1;
      if (start >= uidNext) { console.log("nothing new"); }
      else {
        const msgs = [];
        for await (const m of client.fetch(`${start}:*`, { uid: true, source: true }, { uid: true })) msgs.push(m);
        msgs.sort((a, b) => a.uid - b.uid);
        // advance the baseline past EVERY new uid (even any beyond the per-run cap)
        // so nothing is ever judged or sent twice.
        const maxUid = Math.max(state.lastUid, ...msgs.map((m) => m.uid));
        const batch = msgs.slice(-MAX_PER_RUN);
        for (const m of batch) {
          const mail = await toMail(m.source);
          const v = await classify(mail); judged++;
          if (v.important) { await notify(mail, v); notified++; }
        }
        state.lastUid = maxUid;
        saveState(state);
      }
    }
  } finally { lock.release(); }
  await client.logout();
  console.log(`email: judged ${judged}, important ${notified}`);
}

main().catch(async (e) => { console.error(e); await sendMessage({ ...TG, text: `❌ Email monitor error: ${e.message}` }); process.exit(1); });
