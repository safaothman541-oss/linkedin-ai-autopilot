// run.js — the daily pipeline orchestrator (runs on GitHub Actions).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Parser from "rss-parser";
import { generateContent } from "./gemini.js";
import { makeVideo } from "./video.js";
import { getAccessToken, getPersonUrn, postVideoToLinkedIn } from "./linkedin.js";
import { sendMessage, sendVideo } from "./telegram.js";

const ANGLES = ["Model release", "Framework", "Quick tip", "AI tool", "Research paper", "X vs Y", "Weekly roundup"];
const FEEDS = [
  "https://www.marktechpost.com/feed/",
  "https://huggingface.co/blog/feed.xml",
  "https://bair.berkeley.edu/blog/feed.xml",
];

const env = process.env;
const TG = { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
const POST_MODE = (env.POST_MODE || "auto").toLowerCase(); // auto | approve | off

async function pickSource() {
  const parser = new Parser({ timeout: 20000 });
  for (const url of FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      if (feed?.items?.length) {
        const it = feed.items[0];
        return { title: it.title || "AI news", summary: (it.contentSnippet || it.content || "").slice(0, 800), link: it.link || "" };
      }
    } catch { /* try next feed */ }
  }
  return { title: "The latest in AI models and frameworks", summary: "", link: "" };
}

async function main() {
  const angle = ANGLES[new Date().getDay()];
  const source = await pickSource();

  // 1) Content
  const content = await generateContent({ angle, source, apiKey: env.GEMINI_API_KEY });
  content.tagLabel = angle;
  content.handle = env.BRAND_HANDLE || "";
  const postText = `${content.post}\n\n${(content.hashtags || []).join(" ")}`.trim();

  // 2) Video (HyperFrames)
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-"));
  const videoFile = await makeVideo({ content, workdir, voice: env.TTS_VOICE || "af_heart" });

  // 3) Always deliver the asset + caption to Telegram (your safety net / approval copy)
  await sendVideo({ ...TG, file: videoFile, caption: postText });

  // 4) Publish to LinkedIn (unless approval/off mode)
  if (POST_MODE === "auto") {
    try {
      const token = await getAccessToken({
        accessToken: env.LINKEDIN_ACCESS_TOKEN,
        refreshToken: env.LINKEDIN_REFRESH_TOKEN,
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
      });
      const personUrn = await getPersonUrn({ token, personUrn: env.LINKEDIN_PERSON_URN });
      const id = await postVideoToLinkedIn({ token, personUrn, file: videoFile, text: postText, title: content.title });
      await sendMessage({ ...TG, text: `✅ Posted to LinkedIn (${angle}). id: ${id}` });
    } catch (e) {
      await sendMessage({ ...TG, text: `⚠️ LinkedIn post failed (${angle}): ${e.message}\nThe video is above — you can post it manually.` });
      throw e; // mark the run as failed in the Actions log
    }
  } else {
    await sendMessage({ ...TG, text: `📝 Draft ready (${angle}). POST_MODE=${POST_MODE}. Post the video above manually if it looks good.` });
  }
}

main().catch(async (e) => {
  console.error(e);
  await sendMessage({ ...TG, text: `❌ Pipeline error: ${e.message}` });
  process.exit(1);
});
