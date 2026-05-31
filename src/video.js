// video.js — VIRAL 9:16 video: AI image scenes (new bg every 5s) + word-synced kinetic
// captions (Whisper word timing) + per-caption icons + animated end card.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIBE = path.join(__dirname, "..", "tools", "transcribe.py");

const sh = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });

// ---- Brand palette ----
const BG0 = "#05070f";
const C_BLUE = "#2f7bff";
const C_TEAL = "#22e3c3";
const C_VIOLET = "#8b5cf6";
const INK = "#ffffff";
const MUTED = "#9fb3d8";
const SCENE_SECS = 5; // background fully changes every 5 seconds

// fallback gradients for scenes whose image failed to generate
const GRADS = [
  "linear-gradient(160deg,#0a1029,#0a66c2)",
  "linear-gradient(160deg,#1a0a29,#7c3aed)",
  "linear-gradient(160deg,#06120f,#0f766e)",
  "linear-gradient(160deg,#1a0612,#be185d)",
  "linear-gradient(160deg,#0a1226,#1d4ed8)",
  "linear-gradient(160deg,#150a1f,#6d28d9)",
  "linear-gradient(160deg,#0f0a06,#c2410c)",
];

function audioDuration(file) {
  try {
    const out = sh(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) && d > 1 ? d : 30;
  } catch {
    return 30;
  }
}

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// pick a relevant icon for a caption line
const EMOJI_RULES = [
  [/model|gpt|llm|neural|brain|intellig|reason|think/, "🧠"],
  [/fast|speed|quick|instant|real.?time|latency/, "⚡"],
  [/code|coding|program|develop|build|engineer|deploy/, "💻"],
  [/data|dataset|benchmark|number|stat|score|percent/, "📊"],
  [/launch|release|ship|new|introduc|announc|drop/, "🚀"],
  [/cost|price|cheap|fund|billion|million|dollar|\$|revenue/, "💰"],
  [/secur|safe|risk|protect|privacy|attack|threat/, "🔒"],
  [/image|vision|see|visual|photo|video|render|generat/, "🎨"],
  [/agent|robot|autonom|auto/, "🤖"],
  [/win|beat|best|top|lead|state.of|outperform|crush/, "🏆"],
  [/grow|rise|increas|surg|boom|up|scal/, "📈"],
  [/idea|tip|learn|how|guide|secret|trick/, "💡"],
  [/open|free|public|access/, "🔓"],
];
const DEFAULT_EMO = ["🚀", "🤖", "⚡", "🧠", "🔥", "✨", "📈", "💡", "🎯"];
function pickEmoji(text, idx) {
  const t = String(text).toLowerCase();
  for (const [re, e] of EMOJI_RULES) if (re.test(t)) return e;
  return DEFAULT_EMO[idx % DEFAULT_EMO.length];
}

// Build the composition. words = [{text,start,end}] from Whisper (may be empty -> estimate).
function buildComposition(content, D, compId, words, images) {
  const W = 1080, H = 1920;
  const END_DUR = Math.min(2.8, D * 0.22);
  const CAP_START = 0.35;
  const CAP_END = Math.max(CAP_START + 1.2, D - END_DUR);

  // keyword set for highlighting
  const kw = new Set();
  [].concat(content.keywords || [], content.bullets || [], [content.title || ""])
    .forEach((k) => String(k).toLowerCase().split(/[^a-z0-9#+]+/).forEach((t) => { if (t.length > 3) kw.add(t); }));
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9#+]/g, "");

  // ---- timed words: prefer Whisper timing, else estimate from script ----
  let timed = [];
  if (Array.isArray(words) && words.length) {
    timed = words
      .filter((w) => w && w.text && Number.isFinite(w.start))
      .map((w) => ({ text: w.text, start: +(+w.start).toFixed(3), hl: kw.has(norm(w.text)) }));
  }
  if (!timed.length) {
    const raw = String(content.script || content.post || content.title || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const weights = raw.map((w) => Math.max(2.2, norm(w).length + 2));
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    const span = Math.max(0.6, CAP_END - CAP_START);
    let acc = 0;
    timed = raw.map((w) => {
      const start = CAP_START + (acc / totalW) * span;
      acc += Math.max(2.2, norm(w).length + 2);
      return { text: w, start: +start.toFixed(3), hl: kw.has(norm(w)) };
    });
  }

  // group into lines of up to 3 words
  const PER = 3;
  const lines = [];
  for (let i = 0; i < timed.length; i += PER) {
    const ws = timed.slice(i, i + PER);
    const start = ws[0].start;
    const next = timed[i + PER];
    const end = next ? +next.start.toFixed(3) : +Math.min(CAP_END, start + 1.4).toFixed(3);
    const emoji = pickEmoji(ws.map((w) => w.text).join(" "), lines.length);
    lines.push({ words: ws, start: +start.toFixed(3), end, emoji });
  }

  const linesHtml = lines.map((ln, li) =>
    `<div class="capline" id="cl${li}">` +
    `<div class="capicon" id="ci${li}">${ln.emoji}</div>` +
    `<div class="capwords">` +
    ln.words.map((w, wi) => `<span class="cw${w.hl ? " hl" : ""}" id="cw${li}_${wi}">${esc(w.text)}</span>`).join(" ") +
    `</div></div>`
  ).join("\n      ");

  const linesData = JSON.stringify(lines.map((l, li) => ({
    id: li, start: l.start, end: l.end,
    words: l.words.map((w, wi) => {
      const nxt = l.words[wi + 1];
      return { id: wi, start: w.start, off: +(nxt ? nxt.start : l.end).toFixed(3) };
    }),
  })));

  // ---- background scenes (new image every SCENE_SECS) ----
  const numScenes = Math.max(1, Math.ceil(D / SCENE_SECS));
  const sceneHtml = Array.from({ length: numScenes }, (_, i) => {
    const img = images && images[i];
    const style = img
      ? `background-image:url('${img}');background-size:cover;background-position:center;`
      : `background:${GRADS[i % GRADS.length]};`;
    return `<div class="scene" id="sc${i}" style="${style}"></div>`;
  }).join("\n      ");

  const tag = esc((content.tagLabel || "AI DAILY").toUpperCase());
  const cta = esc(content.cta || "Follow for more");
  const handle = esc(content.handle || "");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  #root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${BG0};
        font-family:'Poppins','Arial Black',Arial,sans-serif;}
  .scene{position:absolute;inset:0;opacity:0;will-change:opacity,transform;transform:scale(1.08);}
  #shade{position:absolute;inset:0;background:
      linear-gradient(180deg, rgba(3,5,12,.55) 0%, rgba(3,5,12,.20) 32%, rgba(3,5,12,.30) 60%, rgba(3,5,12,.78) 100%);}
  #vignette{position:absolute;inset:0;background:radial-gradient(80% 70% at 50% 45%, transparent 52%, rgba(0,0,0,.6) 100%);}

  #barwrap{position:absolute;top:0;left:0;right:0;height:12px;background:rgba(255,255,255,.10);z-index:6;}
  #bar{transform-origin:left center;height:100%;width:100%;
       background:linear-gradient(90deg,${C_TEAL},${C_BLUE});box-shadow:0 0 24px ${C_TEAL};}

  #tag{position:absolute;top:92px;left:50%;transform:translateX(-50%);z-index:6;
       padding:16px 36px;border-radius:999px;background:rgba(8,12,24,.55);
       border:2px solid rgba(34,227,195,.55);color:${C_TEAL};
       font-size:38px;font-weight:800;letter-spacing:3px;white-space:nowrap;backdrop-filter:blur(8px);}

  #capwrap{position:absolute;left:54px;right:54px;top:50%;transform:translateY(-50%);
           min-height:620px;display:flex;align-items:center;justify-content:center;z-index:5;}
  .capline{position:absolute;width:100%;display:flex;flex-direction:column;align-items:center;gap:26px;
           opacity:0;visibility:hidden;}
  .capicon{font-size:150px;line-height:1;filter:drop-shadow(0 12px 30px rgba(0,0,0,.5));}
  .capwords{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;justify-content:center;}
  .cw{display:inline-block;color:${INK};font-size:104px;font-weight:900;line-height:1.06;letter-spacing:-1px;
      padding:2px 20px;border-radius:18px;background-color:rgba(34,227,195,0);
      text-shadow:0 6px 30px rgba(0,0,0,.75);will-change:transform,opacity,background-color,color;}

  #handle{position:absolute;bottom:92px;left:0;right:0;text-align:center;z-index:6;
          color:#e8f0ff;font-size:40px;font-weight:700;letter-spacing:1px;text-shadow:0 4px 18px rgba(0,0,0,.7);}

  #endcard{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;
           align-items:center;justify-content:center;gap:42px;text-align:center;padding:0 80px;
           background:radial-gradient(60% 55% at 50% 50%, rgba(5,7,15,.55), rgba(5,7,15,.92));
           opacity:0;visibility:hidden;}
  #endemoji{font-size:170px;line-height:1;}
  #endcta{color:${C_TEAL};font-size:120px;font-weight:900;line-height:1.0;letter-spacing:-2px;
          text-shadow:0 10px 50px rgba(34,227,195,.45);}
  #endfollow{display:flex;align-items:center;gap:18px;color:${INK};font-size:52px;font-weight:800;
             padding:22px 48px;border-radius:999px;
             background:linear-gradient(90deg,${C_BLUE},${C_VIOLET});box-shadow:0 16px 54px rgba(47,123,255,.55);}
  #endhandle{color:${MUTED};font-size:42px;font-weight:700;}
</style></head>
<body>
  <div id="root" data-composition-id="${compId}" data-start="0" data-width="${W}" data-height="${H}">
      ${sceneHtml}
    <div id="shade" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1"></div>
    <div id="vignette" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1"></div>

    <div id="barwrap" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2"><div id="bar"></div></div>
    <div id="tag" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2">${tag}</div>

    <div id="capwrap" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="3">
      ${linesHtml}
    </div>

    <div id="handle" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2">${handle}</div>

    <div id="endcard" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="4">
      <div id="endemoji">🚀</div>
      <div id="endcta">${cta}</div>
      <div id="endfollow">▶ Follow for more</div>
      <div id="endhandle">${handle}</div>
    </div>

    <audio id="vo" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="9" src="assets/narration.wav"></audio>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      const TOTAL = ${D.toFixed(3)};
      const SS = ${SCENE_SECS};
      const SCENES = ${numScenes};
      const CAP_FADE = ${CAP_END.toFixed(3)};
      const LINES = ${linesData};
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

      // background scenes: fade + slow Ken Burns zoom; a new image every SS seconds
      for (let i = 0; i < SCENES; i++) {
        const s = i * SS;
        tl.fromTo("#sc" + i, { autoAlpha: 0, scale: 1.08 }, { autoAlpha: 1, duration: 0.7, ease: "power1.out" }, Math.max(0, s - 0.35));
        tl.to("#sc" + i, { scale: 1.22, duration: SS + 1.4, ease: "none" }, Math.max(0, s - 0.35));
        if (i < SCENES - 1) tl.to("#sc" + i, { autoAlpha: 0, duration: 0.7, ease: "power1.in" }, s + SS - 0.35);
      }

      // progress bar over the whole video
      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, duration: TOTAL, ease: "none" }, 0);

      // intro chrome
      tl.fromTo("#tag", { opacity: 0, y: -60, scale: .8 }, { opacity: 1, y: 0, scale: 1, duration: .55, ease: "back.out(2)" }, .05);
      tl.fromTo("#handle", { opacity: 0, y: 30 }, { opacity: .92, y: 0, duration: .6 }, .4);

      // kinetic captions (synced to voice via Whisper word times)
      LINES.forEach(function (ln) {
        tl.fromTo("#cl" + ln.id, { autoAlpha: 0 }, { autoAlpha: 1, duration: .12 }, Math.max(0, ln.start - .04));
        tl.fromTo("#ci" + ln.id, { scale: .3, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: .32, ease: "back.out(2.4)" }, Math.max(0, ln.start - .04));
        tl.to("#cl" + ln.id, { autoAlpha: 0, duration: .14 }, Math.max(ln.start + .25, ln.end - .03));
        ln.words.forEach(function (w) {
          var sel = "#cw" + ln.id + "_" + w.id;
          // pop in + become the active (karaoke) word
          tl.fromTo(sel, { opacity: 0, scale: .5, y: 30 }, { opacity: 1, scale: 1.13, y: 0, duration: .2, ease: "back.out(3)" }, w.start);
          tl.to(sel, { backgroundColor: "${C_TEAL}", color: "#06121a", duration: .1 }, w.start);
          // hand the highlight to the next word
          tl.to(sel, { backgroundColor: "rgba(34,227,195,0)", color: "${INK}", scale: 1, duration: .12 }, w.off);
        });
      });

      // end card
      tl.to("#capwrap", { autoAlpha: 0, duration: .3 }, CAP_FADE + .05);
      tl.to("#handle", { autoAlpha: 0, duration: .3 }, CAP_FADE + .05);
      tl.fromTo("#endcard", { autoAlpha: 0 }, { autoAlpha: 1, duration: .4 }, CAP_FADE + .15);
      tl.fromTo("#endemoji", { scale: 0, rotation: -30 }, { scale: 1, rotation: 0, duration: .55, ease: "back.out(2.2)" }, CAP_FADE + .25);
      tl.fromTo("#endcta", { opacity: 0, scale: .7, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: .55, ease: "back.out(1.8)" }, CAP_FADE + .4);
      tl.fromTo("#endfollow", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .45 }, CAP_FADE + .65);
      tl.fromTo("#endhandle", { opacity: 0 }, { opacity: .9, duration: .4 }, CAP_FADE + .8);

      window.__timelines = window.__timelines || {};
      window.__timelines["${compId}"] = tl;
    </script>
  </div>
</body>
</html>`;
}

async function fetchOne(url, file, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3000) { fs.writeFileSync(file, buf); return true; }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(to);
  }
}

// Search Pexels for portrait stock photos matching a query -> array of image URLs.
async function fetchPexels(query, key, perPage) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { Authorization: key }, signal: ctrl.signal });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.photos || []).map((p) => p.src && (p.src.large2x || p.src.portrait || p.src.original)).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(to);
  }
}

// Get a relevant background image per scene. Primary: Pexels (reliable, keyed).
// Fallback: Pollinations AI images. Final fallback: gradients (handled in the composition).
async function fetchImages(content, numScenes, destDir) {
  const out = new Array(numScenes);
  const title = content.title || "artificial intelligence";
  const key = process.env.PEXELS_API_KEY;

  if (key) {
    const kws = (content.keywords && content.keywords.length ? content.keywords.slice(0, 4) : []);
    const queries = [title, ...kws, "artificial intelligence", "futuristic technology", "data network"].filter(Boolean);
    let pool = [];
    for (const q of queries) {
      if (pool.length >= numScenes + 4) break;
      pool = pool.concat(await fetchPexels(String(q) + " technology", key, 6));
    }
    pool = Array.from(new Set(pool));
    for (let i = 0; i < numScenes && pool.length; i++) {
      const file = path.join(destDir, `img${i}.jpg`);
      if (await fetchOne(pool[i % pool.length], file, 30000)) {
        out[i] = `assets/img${i}.jpg`; console.log(`  image ${i + 1}/${numScenes} ok (pexels)`);
      } else console.log(`  image ${i + 1}/${numScenes} download failed`);
    }
    if (out.filter(Boolean).length) return out;
    console.log("  pexels unavailable -> trying pollinations");
  }

  // Fallback: Pollinations (one by one)
  const kws2 = (content.keywords && content.keywords.length ? content.keywords : [title]);
  for (let i = 0; i < numScenes; i++) {
    if (out[i]) continue;
    const kw = kws2[i % kws2.length] || title;
    const prompt = `${title}, ${kw}, futuristic technology, cinematic, vivid neon, vertical`;
    const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1920&nologo=true`;
    const file = path.join(destDir, `img${i}.jpg`);
    if (await fetchOne(base + `&seed=${100 + i * 7}`, file, 60000)) {
      out[i] = `assets/img${i}.jpg`; console.log(`  image ${i + 1}/${numScenes} ok (pollinations)`);
    }
  }
  return out;
}

export async function makeVideo({ content, workdir, voice = "af_heart" }) {
  const project = path.join(workdir, "project");
  const compId = "daily";

  // 1) Scaffold a valid HyperFrames project.
  fs.mkdirSync(workdir, { recursive: true });
  try {
    sh(`npx --yes hyperframes init project --example blank --skip-skills`, { cwd: workdir, env: { ...process.env, CI: "1" } });
  } catch (e) {
    fs.mkdirSync(path.join(project, "compositions"), { recursive: true });
    fs.writeFileSync(path.join(project, "meta.json"),
      JSON.stringify({ name: "daily", id: "daily", created: new Date().toISOString() }, null, 2));
  }
  const assets = path.join(project, "assets");
  fs.mkdirSync(assets, { recursive: true });

  // 2) Narration via Kokoro TTS.
  fs.writeFileSync(path.join(project, "script.txt"), content.script);
  sh(`npx --yes hyperframes tts script.txt --voice ${voice} --output assets/narration.wav`, {
    cwd: project, env: { ...process.env, CI: "1" },
  });

  const D = audioDuration(path.join(assets, "narration.wav"));
  const numScenes = Math.max(1, Math.ceil(D / SCENE_SECS));

  // 3) Whisper word-level timestamps for perfect caption sync (best-effort).
  let words = [];
  try {
    sh(`python3 "${TRANSCRIBE}" assets/narration.wav assets/words.json`, { cwd: project, env: { ...process.env } });
    const wj = JSON.parse(fs.readFileSync(path.join(assets, "words.json"), "utf8"));
    if (Array.isArray(wj.words)) words = wj.words;
  } catch (e) {
    console.error("Word timing unavailable, using estimate:", e.message);
  }

  // 3b) Generate AI background images one-by-one (reliable on the free tier).
  const images = await fetchImages(content, numScenes, assets).catch(() => new Array(numScenes));
  console.log(`Scenes: ${numScenes} | images: ${images.filter(Boolean).length}/${numScenes} | caption words: ${words.length}`);

  // 4) Build composition + render.
  const html = buildComposition(content, D, compId, words, images);
  fs.writeFileSync(path.join(project, "index.html"), html);

  const out = path.join(workdir, "video.mp4");
  sh(`npx --yes hyperframes render --output "${out}" --fps 30 --quality high`, {
    cwd: project, env: { ...process.env, CI: "1" },
  });

  if (!fs.existsSync(out)) throw new Error("Render finished but video.mp4 was not produced.");
  return out;
}
