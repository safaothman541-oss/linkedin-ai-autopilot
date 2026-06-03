// make-clips.mjs — turn a long video/podcast into several polished vertical
// Shorts, fully free:
//   yt-dlp (or local file) → faster-whisper word timing → Gemini picks the best
//   moments → FFmpeg cut → smart speaker-tracking 9:16 reframe → build-up gold
//   captions → quiet background music → Telegram (review).
// Run: npm run clips -- "<youtube-url-or-file>"
//   or: CLIP_URL=... npm run clips   /   CLIP_FILE=... npm run clips
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sendMessage, sendVideo } from "../telegram.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const TG = env.TELEGRAM_TOPIC_CHAT_ID
  ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_TOPIC_CHAT_ID, threadId: env.TELEGRAM_TOPIC_DRAFTS }
  : { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };

const WHISPER_MODEL = env.WHISPER_MODEL || "base.en";
const CLIP_COUNT = Math.max(1, parseInt(env.CLIP_COUNT || "6", 10) || 6);
const MAX_H = env.SOURCE_MAX_HEIGHT || "720";
const PY = env.PYTHON_BIN || "python";

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26, ...opts });
const dur = (f) => parseFloat(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// ---- 1) get the source video ---------------------------------------------
function getSource(input, wd) {
  if (input && /^https?:\/\//i.test(input)) {
    // YouTube often blocks datacenter IPs ("sign in to confirm you're not a
    // bot"). Cookies (YT_COOKIES_FILE) are the reliable fix; YTDLP_EXTRA lets
    // you pass things like --extractor-args without a code change.
    const cookies = env.YT_COOKIES_FILE && fs.existsSync(env.YT_COOKIES_FILE) ? ["--cookies", env.YT_COOKIES_FILE] : [];
    const extra = (env.YTDLP_EXTRA || "").split(" ").filter(Boolean);
    sh("yt-dlp", [
      "-f", `bv*[height<=${MAX_H}][ext=mp4]+ba[ext=m4a]/b[height<=${MAX_H}]/best`,
      "--merge-output-format", "mp4", "--no-playlist",
      "--retries", "5", "--fragment-retries", "5", "--no-warnings",
      ...cookies, ...extra,
      "-o", path.join(wd, "source.%(ext)s"), input,
    ], { stdio: ["ignore", "inherit", "inherit"] });
    const f = fs.readdirSync(wd).find((x) => x.startsWith("source."));
    if (!f) throw new Error("yt-dlp produced no file (the site may require sign-in cookies — set YT_COOKIES_FILE)");
    return path.join(wd, f);
  }
  if (input && fs.existsSync(input)) return input;
  throw new Error("no input: pass a URL or an existing file path");
}

// ---- 2) transcribe with word timestamps ----------------------------------
function transcribe(media, wd) {
  const out = path.join(wd, "transcript.json");
  sh(PY, [path.join(HERE, "transcribe.py"), media, out, WHISPER_MODEL, env.CLIP_LANG || "auto"], { stdio: ["ignore", "inherit", "inherit"] });
  const t = JSON.parse(fs.readFileSync(out, "utf8"));
  if (!t.words?.length) throw new Error("transcription returned no words");
  return t;
}

// ---- 3) Gemini picks the most clip-worthy moments ------------------------
async function pickMoments(segments, n) {
  const lines = segments.map((s) => `[${Math.round(s.start)}] ${s.text}`).join("\n").slice(0, 200000);
  const prompt = `You are a world-class short-form video editor. Below is a timestamped transcript (numbers are seconds) of a long video.
Pick the ${n} BEST standalone moments to cut as vertical Shorts. Rules for each pick:
- self-contained: makes sense without the rest of the video
- starts at a natural sentence start, ends at a sentence end
- 18-60 seconds long
- a strong HOOK in the first 3 seconds
- prefer: surprising claims, concrete stories, strong opinions, actionable tips, emotional or funny peaks
- avoid: mid-sentence cuts, filler, intros/outros, ads/sponsor reads
Return STRICT JSON only:
{"clips":[{"start":<sec>,"end":<sec>,"title":"<=70 char hook title","reason":"why it pops <=15 words","hashtags":["#Shorts","#...","#..."]}]}
TRANSCRIPT:
${lines}`;
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  for (const m of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, responseMimeType: "application/json" } }),
      });
      if (!r.ok) continue;
      const o = JSON.parse(((await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      if (Array.isArray(o.clips) && o.clips.length) return o.clips;
    } catch { /* next model */ }
  }
  throw new Error("Gemini moment selection failed");
}

// snap a requested [start,end] to whole sentences and a sane length
function snapClip(c, segments) {
  let start = Number(c.start), end = Number(c.end);
  if (!(end > start)) return null;
  const segStart = [...segments].reverse().find((s) => s.start <= start + 0.4) || segments[0];
  const segEnd = segments.find((s) => s.end >= end - 0.4) || segments[segments.length - 1];
  start = segStart.start;
  end = segEnd.end;
  if (end - start < 8) end = start + 8;
  if (end - start > 75) end = start + 75;          // hard cap for Shorts
  return { ...c, start: Math.max(0, start), end };
}

// ---- captions: build-up phrase that STAYS; active word gold ---------------
const CAP_WHITE = "&HFFFFFF&", CAP_GOLD = "&H00D7FF&";
function buildAssWords(words, wd) {
  const G = 4, groups = [];
  for (let i = 0; i < words.length; i += G) groups.push(words.slice(i, i + G));
  const tt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(2); return `${h}:${String(m).padStart(2, "0")}:${x.padStart(5, "0")}`; };
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Cap,Arial,62,&H00FFFFFF,&H00FFFFFF,&H00141414,&H00000000,-1,0,0,0,100,100,1,0,1,5,2,5,110,110,0,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;
  const lines = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (let i = 0; i < g.length; i++) {
      const start = g[i].a;
      let end = (i + 1 < g.length) ? g[i + 1].a : (gi + 1 < groups.length ? groups[gi + 1][0].a : g[i].b + 0.5);
      end = Math.max(end, start + 0.1);
      let txt = "";
      for (let j = 0; j <= i; j++) txt += `{\\c${j === i ? CAP_GOLD : CAP_WHITE}}${g[j].w} `;
      lines.push(`Dialogue: 0,${tt(start)},${tt(end)},Cap,,0,0,0,,${txt.trim()}`);
    }
  }
  fs.writeFileSync(path.join(wd, "captions.ass"), head + lines.join("\n"));
}

function clipWords(allWords, start, end) {
  return allWords
    .filter((w) => w.end > start + 0.02 && w.start < end - 0.02)
    .map((w) => ({ w: String(w.word).toUpperCase().replace(/[{}]/g, ""), a: Math.max(0, w.start - start), b: Math.max(0.1, w.end - start) }));
}

// ---- background music (quiet) --------------------------------------------
async function jamendoMusic(wd) {
  if (!env.JAMENDO_CLIENT_ID) return null;
  try {
    const r = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${env.JAMENDO_CLIENT_ID}&format=json&limit=1&audioformat=mp32&include=musicinfo&tags=corporate&order=popularity_total`);
    const url = (await r.json())?.results?.[0]?.audio;
    if (!url) return null;
    const fp = path.join(wd, "music.mp3");
    fs.writeFileSync(fp, Buffer.from(await (await fetch(url)).arrayBuffer()));
    return fp;
  } catch { return null; }
}

// ---- render one clip ------------------------------------------------------
const GRADE = "eq=contrast=1.06:saturation=1.14:brightness=0.01,vignette=PI/5";
function renderClip(source, c, allWords, music, wd, idx) {
  const raw = path.join(wd, `raw${idx}.mp4`);
  const vert = path.join(wd, `vert${idx}.mp4`);
  const outp = path.join(wd, `short${idx}.mp4`);
  // 1) accurate cut (re-encode), normalise fps
  sh("ffmpeg", ["-y", "-ss", String(c.start), "-to", String(c.end), "-i", source,
    "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", raw]);
  // 2) smart speaker-tracking 9:16 reframe (video only)
  sh(PY, [path.join(HERE, "reframe.py"), raw, vert, "1080", "1920"], { stdio: ["ignore", "inherit", "inherit"] });
  // 3) captions for just this clip (clip-relative timing)
  buildAssWords(clipWords(allWords, c.start, c.end), wd);
  const D = dur(vert);
  // 4) compose: reframed video + original clip audio + quiet music + captions
  const args = ["-y", "-i", vert, "-i", raw];
  let filter, amap;
  if (music) {
    args.push("-i", music);
    filter = `[0:v]${GRADE},ass=captions.ass[v];[2:a]volume=0.08,aloop=loop=-1:size=2000000000[m];[1:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`;
    amap = "[a]";
  } else {
    filter = `[0:v]${GRADE},ass=captions.ass[v]`;
    amap = "1:a";
  }
  sh("ffmpeg", [...args, "-filter_complex", filter, "-map", "[v]", "-map", amap, "-t", D.toFixed(2), "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", outp], { cwd: wd });
  return outp;
}

async function main() {
  const input = (env.CLIP_URL || env.CLIP_FILE || process.argv[2] || "").trim();
  if (!input) throw new Error("Pass a YouTube URL or a local file: npm run clips -- \"<url|file>\"");
  if (!TG.token || !TG.chatId) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
  const wd = fs.mkdtempSync(path.join(os.tmpdir(), "clips-"));

  await sendMessage({ ...TG, text: `✂️ Clipping started…\n${input.slice(0, 200)}` });
  const source = getSource(input, wd);
  const total = dur(source);
  await sendMessage({ ...TG, text: `📥 Source ready (${mmss(total)}). Transcribing with Whisper (${WHISPER_MODEL})…` });

  const t = transcribe(source, wd);
  await sendMessage({ ...TG, text: `📝 Transcribed ${t.words.length} words. Finding the best ${CLIP_COUNT} moments…` });

  const picks = await pickMoments(t.segments, CLIP_COUNT);
  const clips = picks.map((c) => snapClip(c, t.segments)).filter(Boolean)
    .sort((a, b) => a.start - b.start)
    .filter((c, i, arr) => i === 0 || c.start >= arr[i - 1].end - 1);   // drop overlaps
  if (!clips.length) throw new Error("no usable clips selected");
  await sendMessage({ ...TG, text: `🎯 Selected ${clips.length} clip(s). Rendering vertical Shorts with speaker-tracking + captions…` });

  const music = await jamendoMusic(wd);

  let done = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    try {
      const outp = renderClip(source, c, t.words, music, wd, i);
      const caption = `🎬 ${c.title || "Clip " + (i + 1)}\n\n💡 ${c.reason || ""}\n⏱ ${mmss(c.start)}–${mmss(c.end)} of source\n\n${(c.hashtags || ["#Shorts"]).join(" ")}`.slice(0, 1024);
      await sendVideo({ ...TG, file: outp, caption });
      done++;
    } catch (e) {
      await sendMessage({ ...TG, text: `⚠️ Clip ${i + 1} (${mmss(c.start)}) failed: ${e.message}` });
    }
  }
  await sendMessage({ ...TG, text: `✅ Done — ${done}/${clips.length} Shorts sent${music ? " · quiet music" : ""}. Review above, then post the ones you like.` });
  console.log(`clips: ${done}/${clips.length}`);
}

main().catch(async (e) => { console.error(e); try { await sendMessage({ ...TG, text: `❌ Clipping failed: ${e.message}` }); } catch {} process.exit(1); });
