// run.js — daily pipeline: build 3 videos (3 topics x 3 rotating styles) and deliver them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Parser from "rss-parser";
import { generateContent } from "./gemini.js";
import { makeVideo, STYLES } from "./video.js";
import { getAccessToken, getPersonUrn, postVideoToLinkedIn } from "./linkedin.js";
import { sendMessage, sendVideo } from "./telegram.js";

const ANGLES = ["Model release", "Framework", "Quick tip", "AI tool", "Research paper", "X vs Y", "Weekly roundup"];
const FEEDS = [
  "https://www.marktechpost.com/feed/",
  "https://huggingface.co/blog/feed.xml",
  "https://venturebeat.com/category/ai/feed/",
  "https://bair.berkeley.edu/blog/feed.xml",
];

const env = process.env;
const TG = { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
const POST_MODE = (env.POST_MODE || "auto").toLowerCase();
const COUNT = Math.max(1, parseInt(env.VIDEOS_PER_RUN || "3", 10) || 3);
const TOPIC = (env.TOPIC || "").trim(); // set by the Telegram bot for a one-off topic video

async function pickSources(n) {
  const parser = new Parser({ timeout: 20000 });
  const items = [];
  for (const url of FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      for (const it of (feed.items || []).slice(0, 4)) {
        items.push({ title: it.title || "AI news", summary: (it.contentSnippet || it.content || "").slice(0, 800), link: it.link || "" });
      }
    } catch { /* try next feed */ }
    if (items.length >= n * 3) break;
  }
  const seen = new Set(), out = [];
  for (const it of items) {
    const k = (it.title || "").toLowerCase().slice(0, 60);
    if (k && !seen.has(k)) { seen.add(k); out.push(it); }
    if (out.length >= n) break;
  }
  while (out.length < n) out.push({ title: "The latest in AI models and tools", summary: "", link: "" });
  return out;
}

async function main() {
  const count = TOPIC ? 1 : COUNT;
  const sources = TOPIC ? [{ title: TOPIC, summary: "", link: "" }] : await pickSources(COUNT);

  let token = null, personUrn = null;
  if (POST_MODE === "auto") {
    try {
      token = await getAccessToken({
        accessToken: env.LINKEDIN_ACCESS_TOKEN, refreshToken: env.LINKEDIN_REFRESH_TOKEN,
        clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET,
      });
      personUrn = await getPersonUrn({ token, personUrn: env.LINKEDIN_PERSON_URN });
    } catch (e) {
      await sendMessage({ ...TG, text: `⚠️ LinkedIn auth failed: ${e.message}\nVideos will be sent to Telegram only.` });
    }
  }

  const results = [];
  for (let i = 0; i < count; i++) {
    const style = STYLES[i % STYLES.length];
    try {
      const angle = ANGLES[(new Date().getDay() + i) % ANGLES.length];
      const content = await generateContent({ angle, source: sources[i], apiKey: env.GEMINI_API_KEY });
      content.tagLabel = angle;
      content.handle = env.BRAND_HANDLE || "";
      const postText = `${content.post}\n\n${(content.hashtags || []).join(" ")}`.trim();

      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `hf${i}-`));
      const videoFile = await makeVideo({ content, workdir, voice: env.TTS_VOICE || "af_heart", style: i });
      try { fs.copyFileSync(videoFile, `video${i + 1}.mp4`); } catch {}

      await sendVideo({ ...TG, file: videoFile, caption: `🎬 ${i + 1}/${count} · style: ${style.id}\n\n${postText}`.slice(0, 1024) });

      if (POST_MODE === "auto" && token && personUrn) {
        const id = await postVideoToLinkedIn({ token, personUrn, file: videoFile, text: postText, title: content.title });
        results.push(`✅ ${i + 1} (${style.id}): posted to LinkedIn`);
      } else {
        results.push(`📝 ${i + 1} (${style.id}): sent to Telegram — post manually`);
      }
    } catch (e) {
      console.error(`video ${i + 1} (${style.id}) failed:`, e);
      results.push(`❌ ${i + 1} (${style.id}): ${e.message}`);
      await sendMessage({ ...TG, text: `⚠️ Video ${i + 1} (${style.id}) failed: ${e.message}` });
    }
  }

  await sendMessage({ ...TG, text: `📦 Daily batch done (mode: ${POST_MODE})\n` + results.join("\n") });
}

main().catch(async (e) => {
  console.error(e);
  await sendMessage({ ...TG, text: `❌ Pipeline error: ${e.message}` });
  process.exit(1);
});
