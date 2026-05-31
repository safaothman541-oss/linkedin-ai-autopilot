// video.js — VIRAL 9:16 videos in ROTATING STYLES.
// Each render: pick a style -> bg (AI/tech images OR animated aurora) + word-synced
// karaoke captions (Whisper timing) + per-caption icons + music + end card.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIBE = path.join(__dirname, "..", "tools", "transcribe.py");

const sh = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });

const BG0 = "#05070f", INK = "#ffffff", MUTED = "#9fb3d8";
const SCENE_SECS = 5;

// ---- 3 rotating styles ----
export const STYLES = [
  { id: "cinematic", bg: "image",  ac: "#22e3c3", ac2: "#2f7bff", capTop: "50%", label: "AI DAILY" },
  { id: "neon",      bg: "aurora", ac: "#ff4d8d", ac2: "#8b5cf6", capTop: "50%", label: "AI PULSE" },
  { id: "electric",  bg: "image",  ac: "#3b82f6", ac2: "#22e3c3", capTop: "66%", label: "TECH BRIEF" },
];

const GRADS = [
  "linear-gradient(160deg,#0a1029,#0a66c2)", "linear-gradient(160deg,#1a0a29,#7c3aed)",
  "linear-gradient(160deg,#06120f,#0f766e)", "linear-gradient(160deg,#1a0612,#be185d)",
  "linear-gradient(160deg,#0a1226,#1d4ed8)", "linear-gradient(160deg,#150a1f,#6d28d9)",
];

const AI_QUERIES = [
  "artificial intelligence", "neural network abstract", "futuristic technology",
  "data center servers", "humanoid robot", "programming code screen",
  "digital network connection", "glowing circuit board", "machine learning visualization",
  "cyber technology blue", "abstract digital brain", "holographic interface",
  "quantum computing", "futuristic city neon", "data stream abstract",
];

function audioDuration(file) {
  try {
    const out = sh(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) && d > 1 ? d : 30;
  } catch { return 30; }
}

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const EMOJI_RULES = [
  [/model|gpt|llm|neural|brain|intellig|reason|think|claude|gemini|llama/, "🧠"],
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

function buildComposition(content, D, compId, words, images, audioSrc, style) {
  const W = 1080, H = 1920;
  const AC = style.ac, AC2 = style.ac2;
  const END_DUR = Math.min(2.8, D * 0.22);
  const CAP_START = 0.35;
  const CAP_END = Math.max(CAP_START + 1.2, D - END_DUR);

  const kw = new Set();
  [].concat(content.keywords || [], content.bullets || [], [content.title || ""])
    .forEach((k) => String(k).toLowerCase().split(/[^a-z0-9#+]+/).forEach((t) => { if (t.length > 3) kw.add(t); }));
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9#+]/g, "");

  let timed = [];
  if (Array.isArray(words) && words.length) {
    timed = words.filter((w) => w && w.text && Number.isFinite(w.start))
      .map((w) => ({ text: w.text, start: +(+w.start).toFixed(3) }));
  }
  if (!timed.length) {
    const raw = String(content.script || content.post || content.title || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const weights = raw.map((w) => Math.max(2.2, norm(w).length + 2));
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    const span = Math.max(0.6, CAP_END - CAP_START);
    let acc = 0;
    timed = raw.map((w) => { const start = CAP_START + (acc / totalW) * span; acc += Math.max(2.2, norm(w).length + 2); return { text: w, start: +start.toFixed(3) }; });
  }

  const PER = 3;
  const lines = [];
  for (let i = 0; i < timed.length; i += PER) {
    const ws = timed.slice(i, i + PER);
    const next = timed[i + PER];
    const end = next ? +next.start.toFixed(3) : +Math.min(CAP_END, ws[0].start + 1.4).toFixed(3);
    lines.push({ words: ws, start: +ws[0].start.toFixed(3), end, emoji: pickEmoji(ws.map((w) => w.text).join(" "), lines.length) });
  }

  const linesHtml = lines.map((ln, li) =>
    `<div class="capline" id="cl${li}"><div class="capicon" id="ci${li}">${ln.emoji}</div><div class="capwords">` +
    ln.words.map((w, wi) => `<span class="cw" id="cw${li}_${wi}">${esc(w.text)}</span>`).join(" ") +
    `</div></div>`
  ).join("\n      ");

  const linesData = JSON.stringify(lines.map((l, li) => ({
    id: li, start: l.start, end: l.end,
    words: l.words.map((w, wi) => { const nx = l.words[wi + 1]; return { id: wi, start: w.start, off: +(nx ? nx.start : l.end).toFixed(3) }; }),
  })));

  const numScenes = Math.max(1, Math.ceil(D / SCENE_SECS));
  let bgHtml = "";
  if (style.bg === "aurora") {
    bgHtml = `<div id="bgbase"></div>
      <div class="blob" id="b1"></div><div class="blob" id="b2"></div>
      <div class="blob" id="b3"></div><div class="blob" id="b4"></div>`;
  } else {
    bgHtml = Array.from({ length: numScenes }, (_, i) => {
      const img = images && images[i];
      const st = img ? `background-image:url('${img}');background-size:cover;background-position:center;` : `background:${GRADS[i % GRADS.length]};`;
      return `<div class="scene" id="sc${i}" style="${st}"></div>`;
    }).join("\n      ");
  }

  const tag = esc((content.tagLabel || style.label).toUpperCase());
  const cta = esc(content.cta || "Follow for more");
  const handle = esc(content.handle || "");
  const hook = esc(content.title || content.hook || "AI Update");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{--ac:${AC};--ac2:${AC2};}
  #root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${BG0};font-family:'Poppins','Arial Black',Arial,sans-serif;}
  .scene{position:absolute;inset:0;opacity:0;will-change:opacity,transform;transform:scale(1.08);}
  #bgbase{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%, #0a1029, ${BG0} 60%);}
  .blob{position:absolute;border-radius:50%;filter:blur(95px);opacity:.6;mix-blend-mode:screen;will-change:transform;}
  #b1{width:760px;height:760px;background:var(--ac);left:-160px;top:120px;}
  #b2{width:680px;height:680px;background:var(--ac2);right:-160px;top:560px;}
  #b3{width:720px;height:720px;background:var(--ac2);left:80px;bottom:-160px;}
  #b4{width:520px;height:520px;background:var(--ac);right:40px;bottom:260px;opacity:.45;}
  #shade{position:absolute;inset:0;background:linear-gradient(180deg, rgba(3,5,12,.55) 0%, rgba(3,5,12,.20) 32%, rgba(3,5,12,.30) 60%, rgba(3,5,12,.80) 100%);}
  #vignette{position:absolute;inset:0;background:radial-gradient(80% 70% at 50% 45%, transparent 52%, rgba(0,0,0,.6) 100%);}
  #barwrap{position:absolute;top:0;left:0;right:0;height:12px;background:rgba(255,255,255,.10);z-index:6;}
  #bar{transform-origin:left center;height:100%;width:100%;background:linear-gradient(90deg,var(--ac),var(--ac2));box-shadow:0 0 24px var(--ac);}
  #tag{position:absolute;top:92px;left:50%;transform:translateX(-50%);z-index:6;padding:16px 36px;border-radius:999px;background:rgba(8,12,24,.55);border:2px solid var(--ac);color:var(--ac);font-size:38px;font-weight:800;letter-spacing:3px;white-space:nowrap;backdrop-filter:blur(8px);}
  #hookcard{position:absolute;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;padding:0 70px;background:radial-gradient(75% 60% at 50% 45%, rgba(5,7,15,.92), rgba(5,7,15,.99));opacity:0;visibility:hidden;}
  #hooktext{color:${INK};font-size:120px;font-weight:900;line-height:1.0;letter-spacing:-2px;text-align:center;text-shadow:0 12px 55px rgba(0,0,0,.7);}
  #capwrap{position:absolute;left:54px;right:54px;top:${style.capTop};transform:translateY(-50%);min-height:560px;display:flex;align-items:center;justify-content:center;z-index:5;}
  .capline{position:absolute;width:100%;display:flex;flex-direction:column;align-items:center;gap:26px;opacity:0;visibility:hidden;}
  .capicon{font-size:150px;line-height:1;filter:drop-shadow(0 12px 30px rgba(0,0,0,.5));}
  .capwords{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;justify-content:center;}
  .cw{display:inline-block;color:${INK};font-size:104px;font-weight:900;line-height:1.06;letter-spacing:-1px;padding:2px 20px;border-radius:18px;background-color:rgba(255,255,255,0);text-shadow:0 6px 30px rgba(0,0,0,.75);will-change:transform,opacity,background-color,color;}
  #handle{position:absolute;bottom:92px;left:0;right:0;text-align:center;z-index:6;color:#e8f0ff;font-size:40px;font-weight:700;letter-spacing:1px;text-shadow:0 4px 18px rgba(0,0,0,.7);}
  #endcard{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:42px;text-align:center;padding:0 80px;background:radial-gradient(60% 55% at 50% 50%, rgba(5,7,15,.55), rgba(5,7,15,.92));opacity:0;visibility:hidden;}
  #endemoji{font-size:170px;line-height:1;}
  #endcta{color:var(--ac);font-size:118px;font-weight:900;line-height:1.0;letter-spacing:-2px;text-shadow:0 10px 50px rgba(0,0,0,.5);}
  #endfollow{display:flex;align-items:center;gap:18px;color:${INK};font-size:52px;font-weight:800;padding:22px 48px;border-radius:999px;background:linear-gradient(90deg,var(--ac2),var(--ac));box-shadow:0 16px 54px rgba(0,0,0,.4);}
  #endhandle{color:${MUTED};font-size:42px;font-weight:700;}
</style></head>
<body>
  <div id="root" data-composition-id="${compId}" data-start="0" data-width="${W}" data-height="${H}">
      ${bgHtml}
    <div id="shade" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1"></div>
    <div id="vignette" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1"></div>
    <div id="barwrap" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2"><div id="bar"></div></div>
    <div id="tag" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2">${tag}</div>
    <div id="hookcard" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="5"><div id="hooktext">${hook}</div></div>
    <div id="capwrap" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="3">
      ${linesHtml}
    </div>
    <div id="handle" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2">${handle}</div>
    <div id="endcard" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="4">
      <div id="endemoji">🚀</div><div id="endcta">${cta}</div>
      <div id="endfollow">▶ Follow for more</div><div id="endhandle">${handle}</div>
    </div>
    <audio id="vo" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="9" src="${audioSrc}"></audio>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      const TOTAL = ${D.toFixed(3)}, SS = ${SCENE_SECS}, SCENES = ${numScenes}, CAP_FADE = ${CAP_END.toFixed(3)};
      const BG = "${style.bg}", AC = "${AC}";
      const LINES = ${linesData};
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

      if (BG === "aurora") {
        tl.to("#b1", { x: 220, y: 300, scale: 1.3, duration: TOTAL, ease: "sine.inOut" }, 0);
        tl.to("#b2", { x: -200, y: -240, scale: 1.2, duration: TOTAL, ease: "sine.inOut" }, 0);
        tl.to("#b3", { x: 160, y: -300, scale: 1.35, duration: TOTAL, ease: "sine.inOut" }, 0);
        tl.to("#b4", { x: -140, y: 180, scale: 1.25, duration: TOTAL, ease: "sine.inOut" }, 0);
      } else {
        for (let i = 0; i < SCENES; i++) {
          const s = i * SS, st = Math.max(0, s - 0.35);
          const dx = (i % 2 === 0) ? 55 : -55, dy = (i % 2 === 0) ? -38 : 42;
          const kdur = Math.max(1.0, Math.min(SS + 1.7, TOTAL - st));
          tl.fromTo("#sc" + i, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: "power1.out" }, st);
          tl.fromTo("#sc" + i, { scale: 1.14, x: -dx, y: -dy }, { scale: 1.3, x: dx, y: dy, duration: kdur, ease: "none" }, st);
          if (i < SCENES - 1) tl.to("#sc" + i, { autoAlpha: 0, duration: 0.7, ease: "power1.in" }, s + SS - 0.35);
        }
      }

      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, duration: TOTAL, ease: "none" }, 0);
      tl.fromTo("#tag", { opacity: 0, y: -60, scale: .8 }, { opacity: 1, y: 0, scale: 1, duration: .55, ease: "back.out(2)" }, .05);
      tl.fromTo("#handle", { opacity: 0, y: 30 }, { opacity: .92, y: 0, duration: .6 }, .4);
      tl.fromTo("#hookcard", { autoAlpha: 0 }, { autoAlpha: 1, duration: .25 }, 0);
      tl.fromTo("#hooktext", { scale: .55, y: 50, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .6, ease: "back.out(1.9)" }, .1);
      tl.to("#hooktext", { scale: 1.07, duration: 1.2, ease: "sine.inOut" }, .7);
      tl.to("#hookcard", { autoAlpha: 0, duration: .4 }, 1.9);

      LINES.forEach(function (ln) {
        tl.fromTo("#cl" + ln.id, { autoAlpha: 0 }, { autoAlpha: 1, duration: .12 }, Math.max(0, ln.start - .05));
        tl.fromTo("#ci" + ln.id, { scale: .3, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: .32, ease: "back.out(2.4)" }, Math.max(0, ln.start - .05));
        tl.to("#cl" + ln.id, { autoAlpha: 0, duration: .14 }, Math.max(ln.start + .25, ln.end - .03));
        ln.words.forEach(function (w) {
          var sel = "#cw" + ln.id + "_" + w.id;
          tl.fromTo(sel, { opacity: 0, scale: .5, y: 30 }, { opacity: 1, scale: 1.13, y: 0, duration: .2, ease: "back.out(3)" }, w.start);
          tl.to(sel, { backgroundColor: AC, color: "#06121a", duration: .1 }, w.start);
          tl.to(sel, { backgroundColor: "rgba(255,255,255,0)", color: "${INK}", scale: 1, duration: .12 }, w.off);
        });
      });

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
  } catch { return false; } finally { clearTimeout(to); }
}

async function fetchPexels(query, key, perPage) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { Authorization: key }, signal: ctrl.signal });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.photos || []).map((p) => p.src && (p.src.large2x || p.src.portrait || p.src.original)).filter(Boolean);
  } catch { return []; } finally { clearTimeout(to); }
}

async function fetchImages(numScenes, destDir) {
  const out = new Array(numScenes);
  const key = process.env.PEXELS_API_KEY;
  const offset = Math.floor(Math.random() * AI_QUERIES.length);
  if (key) {
    for (let i = 0; i < numScenes; i++) {
      const q = AI_QUERIES[(offset + i) % AI_QUERIES.length];
      const urls = await fetchPexels(q, key, 8);
      const u = urls.length ? urls[i % urls.length] : null;
      if (u) {
        const file = path.join(destDir, `img${i}.jpg`);
        if (await fetchOne(u, file, 30000)) { out[i] = `assets/img${i}.jpg`; console.log(`  image ${i + 1}/${numScenes} ok (${q})`); continue; }
      }
      console.log(`  image ${i + 1}/${numScenes} no result for "${q}"`);
    }
    if (out.filter(Boolean).length) return out;
  }
  for (let i = 0; i < numScenes; i++) {
    if (out[i]) continue;
    const q = AI_QUERIES[(offset + i) % AI_QUERIES.length];
    const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(q + ", futuristic, cinematic, vivid neon, vertical")}?width=1080&height=1920&nologo=true`;
    const file = path.join(destDir, `img${i}.jpg`);
    if (await fetchOne(base + `&seed=${100 + i * 7}`, file, 60000)) out[i] = `assets/img${i}.jpg`;
  }
  return out;
}

async function fetchMusic(destDir) {
  const cid = process.env.JAMENDO_CLIENT_ID;
  if (!cid) return null;
  const moods = ["electronic+upbeat", "energetic+electronic", "epic+powerful", "electronic+dance", "upbeat+corporate"];
  const tags = moods[Math.floor(Math.random() * moods.length)];
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${cid}&format=json&limit=20&audioformat=mp32&order=popularity_total&vocalinstrumental=instrumental&speed=high+veryhigh&fuzzytags=${tags}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const tracks = (j.results || []).filter((t) => t.audio);
    if (!tracks.length) return null;
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    const file = path.join(destDir, "music.mp3");
    if (await fetchOne(pick.audio, file, 30000)) { console.log(`  music: "${pick.name}" by ${pick.artist_name}`); return file; }
  } catch (e) { console.log("  music fetch failed: " + e.message); }
  return null;
}

function mixAudio(project, D, musicAbs) {
  const cleanRel = "assets/narration.wav";
  if (!musicAbs) return cleanRel;
  try {
    const cleanAbs = path.join(project, "assets", "narration.wav");
    const finalAbs = path.join(project, "assets", "narration_final.wav");
    const dur = D.toFixed(2), fo = Math.max(0.1, D - 2).toFixed(2);
    sh(`ffmpeg -y -i "${cleanAbs}" -i "${musicAbs}" -filter_complex "[1:a]aresample=24000,atrim=0:${dur},volume=0.16,afade=t=in:d=1.5,afade=t=out:st=${fo}:d=2[m];[0:a]aresample=24000,volume=1.25[v];[v][m]amix=inputs=2:duration=first:normalize=0[out]" -map "[out]" -ar 24000 "${finalAbs}"`, { cwd: project });
    if (fs.existsSync(finalAbs) && fs.statSync(finalAbs).size > 5000) return "assets/narration_final.wav";
  } catch (e) { console.error("music mix failed:", e.message); }
  return cleanRel;
}

export async function makeVideo({ content, workdir, voice = "af_heart", style = 0 }) {
  const st = STYLES[((style % STYLES.length) + STYLES.length) % STYLES.length];
  const project = path.join(workdir, "project");
  const compId = "daily";
  console.log(`Style: ${st.id} (bg=${st.bg})`);

  fs.mkdirSync(workdir, { recursive: true });
  try {
    sh(`npx --yes hyperframes init project --example blank --skip-skills`, { cwd: workdir, env: { ...process.env, CI: "1" } });
  } catch (e) {
    fs.mkdirSync(path.join(project, "compositions"), { recursive: true });
    fs.writeFileSync(path.join(project, "meta.json"), JSON.stringify({ name: "daily", id: "daily" }, null, 2));
  }
  const assets = path.join(project, "assets");
  fs.mkdirSync(assets, { recursive: true });

  fs.writeFileSync(path.join(project, "script.txt"), content.script);
  sh(`npx --yes hyperframes tts script.txt --voice ${voice} --output assets/narration.wav`, { cwd: project, env: { ...process.env, CI: "1" } });
  const D = audioDuration(path.join(assets, "narration.wav"));
  const numScenes = Math.max(1, Math.ceil(D / SCENE_SECS));

  let words = [];
  try {
    sh(`python3 "${TRANSCRIBE}" assets/narration.wav assets/words.json`, { cwd: project, env: { ...process.env } });
    const wj = JSON.parse(fs.readFileSync(path.join(assets, "words.json"), "utf8"));
    if (Array.isArray(wj.words)) words = wj.words;
  } catch (e) { console.error("Word timing unavailable:", e.message); }

  // Aurora style uses no photos (animated gradient) -> faster + distinct look.
  let images = [];
  if (st.bg === "image") images = await fetchImages(numScenes, assets).catch(() => []);
  console.log(`Scenes: ${numScenes} | images: ${images.filter(Boolean).length} | words: ${words.length}`);

  let audioSrc = "assets/narration.wav";
  try { audioSrc = mixAudio(project, D, await fetchMusic(assets)); } catch (e) { console.error("music step skipped:", e.message); }

  const html = buildComposition(content, D, compId, words, images, audioSrc, st);
  fs.writeFileSync(path.join(project, "index.html"), html);

  const out = path.join(workdir, "video.mp4");
  sh(`npx --yes hyperframes render --output "${out}" --fps 30 --quality high`, { cwd: project, env: { ...process.env, CI: "1" } });
  if (!fs.existsSync(out)) throw new Error("Render finished but video.mp4 was not produced.");

  const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
  const finalOut = path.join(workdir, "final.mp4");
  try {
    sh(`ffmpeg -y -i "${out}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k "${finalOut}"`, { cwd: project });
    if (fs.existsSync(finalOut) && fs.statSync(finalOut).size > 10000) { console.log(`Video size: raw ${mb(out)}MB -> final ${mb(finalOut)}MB`); return finalOut; }
  } catch (e) { console.error("compress failed:", e.message); }
  return out;
}
