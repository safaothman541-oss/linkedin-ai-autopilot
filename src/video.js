// video.js — turn the day's content into a VIRAL-style 9:16 motion-graphics MP4.
// Pipeline: init project -> TTS (Kokoro) -> build kinetic-caption composition -> render (FFmpeg+Chrome).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sh = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });

// ---- Brand palette (edit to restyle every video) ----
const BG0 = "#05070f";          // deep base
const BG1 = "#0a1029";          // base 2
const C_BLUE = "#2f7bff";       // electric blue
const C_TEAL = "#22e3c3";       // accent / keyword highlight
const C_VIOLET = "#8b5cf6";     // violet blob
const C_PINK = "#ff4d8d";       // pink blob
const INK = "#ffffff";
const MUTED = "#9fb3d8";

function audioDuration(file) {
  try {
    const out = sh(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`
    ).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) && d > 1 ? d : 30;
  } catch {
    return 30;
  }
}

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Build a vertical 1080x1920 composition: animated bg + word-synced kinetic captions + end card.
function buildComposition(content, D, compId) {
  const W = 1080, H = 1920;

  // ---------- timing windows ----------
  const CAP_START = 0.35;
  const END_DUR = Math.min(2.8, D * 0.22);            // end-card window
  const CAP_END = Math.max(CAP_START + 1.2, D - END_DUR);
  const HEAD_OUT = Math.min(3.4, CAP_END - 0.6);      // headline fades out

  // ---------- caption words + weighted timing (approx voice sync) ----------
  const rawWords = String(content.script || content.post || content.title || "")
    .replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

  // keywords to emphasise (from Gemini + bullets + title)
  const kw = new Set();
  []
    .concat(content.keywords || [], content.bullets || [], [content.title || ""])
    .forEach((k) => String(k).toLowerCase().split(/[^a-z0-9#+]+/).forEach((t) => { if (t.length > 3) kw.add(t); }));
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9#+]/g, "");

  const weights = rawWords.map((w) => Math.max(2.2, norm(w).length + 2));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.6, CAP_END - CAP_START);
  let acc = 0;
  const words = rawWords.map((w, i) => {
    const start = CAP_START + (acc / totalW) * span;
    acc += weights[i];
    const n = norm(w);
    return { text: w, start: +start.toFixed(3), hl: n.length > 2 && kw.has(n) };
  });

  // group into short kinetic lines (2-3 words)
  const PER = 3;
  const lines = [];
  for (let i = 0; i < words.length; i += PER) {
    const ws = words.slice(i, i + PER);
    const start = ws[0].start;
    const end = (i + PER < words.length) ? +words[i + PER].start.toFixed(3) : +CAP_END.toFixed(3);
    lines.push({ words: ws, start: +start.toFixed(3), end });
  }

  const linesHtml = lines.map((ln, li) =>
    `<div class="capline" id="cl${li}">` +
    ln.words.map((w, wi) => `<span class="cw${w.hl ? " hl" : ""}" id="cw${li}_${wi}">${esc(w.text)}</span>`).join(" ") +
    `</div>`
  ).join("\n      ");

  const linesData = JSON.stringify(lines.map((l, li) => ({
    id: li, start: l.start, end: l.end,
    words: l.words.map((w, wi) => ({ id: wi, start: w.start })),
  })));

  const tag = esc((content.tagLabel || "AI DAILY").toUpperCase());
  const headline = esc(content.title || content.hook || "AI Update");
  const cta = esc(content.cta || "Follow for more");
  const handle = esc(content.handle || "");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  #root{position:relative;width:${W}px;height:${H}px;overflow:hidden;
        font-family:'Poppins','Arial Black',Arial,sans-serif;background:${BG0};}
  #bg{position:absolute;inset:0;background:
      radial-gradient(120% 80% at 50% 0%, ${BG1}, ${BG0} 60%);}
  .blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;mix-blend-mode:screen;}
  #b1{width:760px;height:760px;background:${C_BLUE};left:-160px;top:120px;}
  #b2{width:680px;height:680px;background:${C_TEAL};right:-160px;top:560px;}
  #b3{width:720px;height:720px;background:${C_VIOLET};left:80px;bottom:-160px;}
  #b4{width:520px;height:520px;background:${C_PINK};right:40px;bottom:240px;opacity:.4;}
  #vignette{position:absolute;inset:0;background:
      radial-gradient(75% 75% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%);}
  #grain{position:absolute;inset:0;opacity:.06;background-image:
      repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 3px);}

  #barwrap{position:absolute;top:0;left:0;right:0;height:12px;background:rgba(255,255,255,.08);}
  #bar{transform-origin:left center;height:100%;width:100%;
       background:linear-gradient(90deg,${C_TEAL},${C_BLUE});box-shadow:0 0 24px ${C_TEAL};}

  #tag{position:absolute;top:90px;left:50%;transform:translateX(-50%);
       padding:16px 34px;border-radius:999px;
       background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.18);
       color:${C_TEAL};font-size:38px;font-weight:800;letter-spacing:3px;white-space:nowrap;
       backdrop-filter:blur(6px);}

  #headline{position:absolute;top:210px;left:70px;right:70px;text-align:center;
            color:${INK};font-size:92px;font-weight:900;line-height:1.04;
            text-shadow:0 6px 40px rgba(0,0,0,.5);letter-spacing:-1px;}
  #headline .u{color:${C_TEAL};}

  #capwrap{position:absolute;left:60px;right:60px;top:50%;transform:translateY(-50%);
           height:560px;display:flex;align-items:center;justify-content:center;}
  .capline{position:absolute;width:100%;text-align:center;
           display:flex;flex-wrap:wrap;gap:0 24px;align-items:center;justify-content:center;
           opacity:0;visibility:hidden;}
  .cw{display:inline-block;color:${INK};font-size:104px;font-weight:900;line-height:1.05;
      letter-spacing:-1px;text-shadow:0 8px 34px rgba(0,0,0,.55);will-change:transform,opacity;}
  .cw.hl{color:#06121a;background:linear-gradient(90deg,${C_TEAL},#5ef0d8);
         padding:2px 22px;border-radius:18px;box-shadow:0 10px 40px rgba(34,227,195,.45);}

  #handle{position:absolute;bottom:96px;left:0;right:0;text-align:center;
          color:${MUTED};font-size:40px;font-weight:700;letter-spacing:1px;}

  #endcard{position:absolute;inset:0;display:flex;flex-direction:column;
           align-items:center;justify-content:center;gap:40px;
           background:radial-gradient(60% 50% at 50% 50%, rgba(5,7,15,.35), rgba(5,7,15,.85));
           opacity:0;visibility:hidden;text-align:center;padding:0 80px;}
  #endemoji{font-size:150px;line-height:1;}
  #endcta{color:${C_TEAL};font-size:118px;font-weight:900;line-height:1.02;letter-spacing:-2px;
          text-shadow:0 10px 50px rgba(34,227,195,.4);}
  #endfollow{display:flex;align-items:center;gap:18px;
             color:${INK};font-size:50px;font-weight:800;
             padding:20px 44px;border-radius:999px;
             background:linear-gradient(90deg,${C_BLUE},${C_VIOLET});box-shadow:0 16px 50px rgba(47,123,255,.5);}
  #endhandle{color:${MUTED};font-size:42px;font-weight:700;}
</style></head>
<body>
  <div id="root" data-composition-id="${compId}" data-start="0" data-width="${W}" data-height="${H}">
    <div id="bg" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="b1" class="blob clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="b2" class="blob clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="b3" class="blob clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="b4" class="blob clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="vignette" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="grain" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>

    <div id="barwrap" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1"><div id="bar"></div></div>
    <div id="tag" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1">${tag}</div>
    <div id="headline" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1">${headline}</div>

    <div id="capwrap" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="2">
      ${linesHtml}
    </div>

    <div id="handle" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="1">${handle}</div>

    <div id="endcard" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="3">
      <div id="endemoji">🚀</div>
      <div id="endcta">${cta}</div>
      <div id="endfollow">▶ Follow for more</div>
      <div id="endhandle">${handle}</div>
    </div>

    <audio id="vo" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="9" src="assets/narration.wav"></audio>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      const TOTAL = ${D.toFixed(3)};
      const HEAD_OUT = ${HEAD_OUT.toFixed(3)};
      const CAP_FADE = ${(CAP_END).toFixed(3)};
      const LINES = ${linesData};
      gsap.registerPlugin();
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

      // --- animated background (slow parallax drift; spans full length) ---
      tl.to("#b1", { x: 220, y: 300, scale: 1.25, duration: TOTAL, ease: "sine.inOut" }, 0);
      tl.to("#b2", { x: -200, y: -240, scale: 1.18, duration: TOTAL, ease: "sine.inOut" }, 0);
      tl.to("#b3", { x: 160, y: -300, scale: 1.3, duration: TOTAL, ease: "sine.inOut" }, 0);
      tl.to("#b4", { x: -140, y: 180, scale: 1.2, duration: TOTAL, ease: "sine.inOut" }, 0);

      // --- progress bar fills over the whole video ---
      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, duration: TOTAL, ease: "none" }, 0);

      // --- intro: tag + headline pop in ---
      tl.fromTo("#tag", { opacity: 0, y: -60, scale: .8 }, { opacity: 1, y: 0, scale: 1, duration: .55, ease: "back.out(2)" }, .05);
      tl.fromTo("#headline", { opacity: 0, y: 80, scale: .82 }, { opacity: 1, y: 0, scale: 1, duration: .8, ease: "back.out(1.6)" }, .2);
      tl.fromTo("#handle", { opacity: 0, y: 30 }, { opacity: .9, y: 0, duration: .6 }, .5);
      // headline gently leaves so captions own the stage
      tl.to("#headline", { opacity: 0, y: -70, scale: .94, duration: .5 }, HEAD_OUT);

      // --- kinetic word-by-word captions (approx synced to voice) ---
      LINES.forEach(function (ln) {
        tl.fromTo("#cl" + ln.id, { autoAlpha: 0 }, { autoAlpha: 1, duration: .12 }, ln.start);
        tl.to("#cl" + ln.id, { autoAlpha: 0, duration: .14 }, Math.max(ln.start + .25, ln.end - .04));
        ln.words.forEach(function (w) {
          tl.fromTo("#cw" + ln.id + "_" + w.id,
            { opacity: 0, scale: .45, y: 34, rotation: -3 },
            { opacity: 1, scale: 1, y: 0, rotation: 0, duration: .28, ease: "back.out(3)" }, w.start);
        });
      });

      // --- end card takes over ---
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

export async function makeVideo({ content, workdir, voice = "af_heart" }) {
  const project = path.join(workdir, "project");
  const compId = "daily";

  // 1) Scaffold a valid HyperFrames project (blank example).
  fs.mkdirSync(workdir, { recursive: true });
  try {
    sh(`npx --yes hyperframes init project --example blank --skip-skills`, { cwd: workdir, env: { ...process.env, CI: "1" } });
  } catch (e) {
    fs.mkdirSync(path.join(project, "assets"), { recursive: true });
    fs.mkdirSync(path.join(project, "compositions"), { recursive: true });
    fs.writeFileSync(path.join(project, "meta.json"),
      JSON.stringify({ name: "daily", id: "daily", created: new Date().toISOString() }, null, 2));
  }
  fs.mkdirSync(path.join(project, "assets"), { recursive: true });

  // 2) Narration via Kokoro TTS (text from a file to avoid shell quoting).
  fs.writeFileSync(path.join(project, "script.txt"), content.script);
  sh(`npx --yes hyperframes tts script.txt --voice ${voice} --output assets/narration.wav`, {
    cwd: project, env: { ...process.env, CI: "1" },
  });

  // 3) Build the composition sized to the narration length.
  const D = audioDuration(path.join(project, "assets", "narration.wav"));
  const html = buildComposition(content, D, compId);
  fs.writeFileSync(path.join(project, "index.html"), html);

  // 4) Render to MP4.
  const out = path.join(workdir, "video.mp4");
  sh(`npx --yes hyperframes render --output "${out}" --fps 30 --quality high`, {
    cwd: project, env: { ...process.env, CI: "1" },
  });

  if (!fs.existsSync(out)) throw new Error("Render finished but video.mp4 was not produced.");
  return out;
}
