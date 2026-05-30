// video.js — turn the day's content into a HyperFrames motion-graphics MP4.
// Pipeline: init project -> TTS (Kokoro) -> build composition HTML -> render (FFmpeg+Chrome).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sh = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });

// Brand colours — edit these to restyle every video.
const BG_A = "#0b1020", BG_B = "#0a66c2", ACCENT = "#23d5ab", INK = "#ffffff", MUTED = "#9fb0d4";

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

// Build a vertical 1080x1920 composition from the content + narration length.
function buildComposition(content, D, compId) {
  const W = 1080, H = 1920;
  // Scene proportions across the narration: title, b1, b2, b3, cta
  const props = [0.18, 0.2, 0.2, 0.2, 0.22];
  const starts = [];
  let acc = 0;
  for (const p of props) { starts.push(acc); acc += p * D; }
  const dur = props.map((p) => p * D);

  const scenes = [
    { id: "s0", start: +starts[0].toFixed(2), dur: +dur[0].toFixed(2), html:
      `<div class="big">${esc(content.title)}</div>` },
    { id: "s1", start: +starts[1].toFixed(2), dur: +dur[1].toFixed(2), html:
      `<div class="bullet">${esc(content.bullets[0] || "")}</div>` },
    { id: "s2", start: +starts[2].toFixed(2), dur: +dur[2].toFixed(2), html:
      `<div class="bullet">${esc(content.bullets[1] || "")}</div>` },
    { id: "s3", start: +starts[3].toFixed(2), dur: +dur[3].toFixed(2), html:
      `<div class="bullet">${esc(content.bullets[2] || "")}</div>` },
    { id: "s4", start: +starts[4].toFixed(2), dur: +dur[4].toFixed(2), html:
      `<div class="cta">${esc(content.cta)}</div>` },
  ];

  const sceneEls = scenes.map((s) =>
    `<div id="${s.id}" class="clip scene" data-start="${s.start}" data-duration="${s.dur}" data-track-index="1">${s.html}</div>`
  ).join("\n    ");

  const tween = JSON.stringify(scenes.map((s) => ({ sel: "#" + s.id, start: s.start })));

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  #root{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:Arial,Helvetica,sans-serif}
  #bg{position:absolute;inset:0;background:radial-gradient(1200px 700px at 70% 10%, ${BG_B}, transparent), linear-gradient(160deg, ${BG_A}, #060a16)}
  .tag{position:absolute;top:120px;left:80px;color:${ACCENT};font-size:40px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
  .scene{position:absolute;left:80px;right:80px;top:50%;transform:translateY(-50%)}
  .big{color:${INK};font-size:108px;font-weight:900;line-height:1.1}
  .bullet{color:${INK};font-size:84px;font-weight:800;line-height:1.2}
  .bullet::before{content:"";display:block;width:90px;height:10px;background:${ACCENT};border-radius:6px;margin-bottom:30px}
  .cta{color:${ACCENT};font-size:96px;font-weight:900}
  .handle{position:absolute;bottom:110px;left:80px;color:${MUTED};font-size:38px;font-weight:700}
</style></head>
<body>
  <div id="root" data-composition-id="${compId}" data-start="0" data-width="${W}" data-height="${H}">
    <div id="bg" class="clip" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0"></div>
    <div id="tag" class="clip tag" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0">${esc(content.tagLabel || "AI DAILY")}</div>
    ${sceneEls}
    <div id="handle" class="clip handle" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="0">${esc(content.handle || "")}</div>
    <audio id="vo" data-start="0" data-duration="${D.toFixed(2)}" data-track-index="9" src="assets/narration.wav"></audio>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      const SCENES = ${tween};
      const TOTAL = ${D.toFixed(2)};
      const tl = gsap.timeline({ paused: true });
      tl.to("#bg", { opacity: 1, duration: TOTAL }, 0);     // keep timeline full length
      tl.from("#tag", { opacity: 0, y: -30, duration: 0.6 }, 0);
      SCENES.forEach((s) => { tl.from(s.sel, { opacity: 0, y: 50, duration: 0.6 }, s.start); });
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
    // Fallback: create a minimal project layout manually.
    fs.mkdirSync(path.join(project, "assets"), { recursive: true });
    fs.mkdirSync(path.join(project, "compositions"), { recursive: true });
    fs.writeFileSync(path.join(project, "meta.json"),
      JSON.stringify({ name: "daily", id: "daily", created: new Date().toISOString() }, null, 2));
  }
  fs.mkdirSync(path.join(project, "assets"), { recursive: true });

  // 2) Narration via Kokoro TTS (text read from a file to avoid shell quoting).
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
