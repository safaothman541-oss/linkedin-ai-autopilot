// card.js — render a premium, chart-rich infographic overlay on the (AI or
// gradient) background. Glassmorphism panels, gradient accents, Poppins type.
// Every value is drawn from the same content object used for the caption, so
// the image exactly matches the post. Output: 1200x1200 PNG (LinkedIn square).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

const W = 1200, H = 1200, PAD = 76;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- fonts: prefer bundled Poppins, else system ---------------------------
let POPPINS = false;
const ALIAS = { xb: "PoppinsXB", b: "PoppinsB", sb: "PoppinsSB", m: "PoppinsM", r: "PoppinsR" };
const WEIGHT = { xb: "800", b: "700", sb: "600", m: "500", r: "400" };
(() => {
  const dir = path.join(HERE, "..", "..", "assets", "fonts");
  const files = { xb: "Poppins-ExtraBold.ttf", b: "Poppins-Bold.ttf", sb: "Poppins-SemiBold.ttf", m: "Poppins-Medium.ttf", r: "Poppins-Regular.ttf" };
  try {
    let n = 0;
    for (const k of Object.keys(files)) {
      const p = path.join(dir, files[k]);
      if (fs.existsSync(p)) { GlobalFonts.registerFromPath(p, ALIAS[k]); n++; }
    }
    POPPINS = n === 5;
  } catch { POPPINS = false; }
})();
const fnt = (px, s = "r") => (POPPINS ? `${px}px ${ALIAS[s]}` : `${WEIGHT[s]} ${px}px sans-serif`);

const C = {
  text: "#F7FAFF", muted: "#AEBAD0", faint: "#7E8CA8",
  border: "rgba(255,255,255,0.10)", hi: "rgba(255,255,255,0.06)",
  panel: "rgba(15,21,38,0.52)", track: "rgba(255,255,255,0.09)",
};
const ACCENT = {
  claude: { a: "#8B7CF6", b: "#6366F1", soft: "rgba(139,124,246,0.16)", label: "CLAUDE SKILL" },
  models: { a: "#22D3EE", b: "#3B82F6", soft: "rgba(34,211,238,0.14)", label: "MODEL FACE-OFF" },
  erp: { a: "#34D399", b: "#14B8A6", soft: "rgba(52,211,153,0.14)", label: "ERPIQ DEEP-DIVE" },
};
const SERIES = [["#7DD3FC", "#2563EB"], ["#6EE7B7", "#10B981"], ["#FCD34D", "#F59E0B"]];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
const lg = (ctx, x0, y0, x1, y1, c0, c1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };

function panel(ctx, x, y, w, h, r = 18, fill = C.panel) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 9;
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, r); ctx.lineWidth = 1.5; ctx.strokeStyle = C.border; ctx.stroke();
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1); ctx.lineWidth = 1; ctx.strokeStyle = C.hi; ctx.stroke();
}

function wrap(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function fitLines(ctx, text, maxW, startPx, minPx, maxLines, style = "b") {
  let px = startPx;
  while (px > minPx) { ctx.font = fnt(px, style); const l = wrap(ctx, text, maxW); if (l.length <= maxLines) return { lines: l, px }; px -= 3; }
  ctx.font = fnt(minPx, style); return { lines: wrap(ctx, text, maxW).slice(0, maxLines), px: minPx };
}
function ellipsize(ctx, text, maxW) {
  let t = String(text || "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// ---- background + frame ---------------------------------------------------
function drawBackground(ctx, bgImg, accent) {
  ctx.fillStyle = lg(ctx, 0, 0, W, H, "#0A0E1B", "#141C32"); ctx.fillRect(0, 0, W, H);
  if (bgImg) {
    const s = Math.max(W / bgImg.width, H / bgImg.height);
    const dw = bgImg.width * s, dh = bgImg.height * s;
    ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const sc = ctx.createLinearGradient(0, 0, 0, H);
    sc.addColorStop(0, "rgba(8,11,22,0.58)"); sc.addColorStop(0.5, "rgba(8,11,22,0.70)"); sc.addColorStop(1, "rgba(8,11,22,0.90)");
    ctx.fillStyle = sc; ctx.fillRect(0, 0, W, H);
  } else {
    const rg = ctx.createRadialGradient(W * 0.84, H * 0.08, 40, W * 0.84, H * 0.08, 800);
    rg.addColorStop(0, accent.soft); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  // vignette for focus
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.40)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // gradient top bar
  ctx.fillStyle = lg(ctx, 0, 0, W, 0, accent.a, accent.b); ctx.fillRect(0, 0, W, 7);
}
function drawHeader(ctx, accent) {
  const y = PAD - 8, h = 48;
  ctx.font = fnt(21, "b");
  const label = accent.label, tw = ctx.measureText(label).width, pw = tw + 60;
  panel(ctx, PAD, y, pw, h, 24, accent.soft);
  ctx.fillStyle = lg(ctx, PAD + 20, y, PAD + 34, y + h, accent.a, accent.b);
  ctx.beginPath(); ctx.arc(PAD + 28, y + h / 2, 6, 0, 7); ctx.fill();
  ctx.fillStyle = C.text; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(label, PAD + 46, y + h / 2 + 1);
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  ctx.font = fnt(21, "m"); ctx.fillStyle = C.muted; ctx.textAlign = "right";
  ctx.fillText(date, W - PAD, y + h / 2 + 1); ctx.textAlign = "left";
  return y + h + 10;
}
function drawTitle(ctx, content, accent, topY) {
  let y = topY + 42;
  ctx.fillStyle = C.text; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  const { lines, px } = fitLines(ctx, content.headline, W - 2 * PAD, 76, 44, 2, "xb");
  ctx.font = fnt(px, "xb");
  for (const ln of lines) { y += px; ctx.fillText(ln, PAD, y); y += 10; }
  if (content.subhead) {
    y += 30; ctx.font = fnt(27, "sb"); ctx.fillStyle = accent.a;
    ctx.fillText(ellipsize(ctx, content.subhead, W - 2 * PAD), PAD, y); y += 6;
  }
  y += 22; ctx.fillStyle = lg(ctx, PAD, 0, PAD + 120, 0, accent.a, accent.b);
  roundRect(ctx, PAD, y, 96, 4, 2); ctx.fill();
  ctx.fillStyle = C.border; roundRect(ctx, PAD + 104, y, W - PAD - (PAD + 104), 4, 2); ctx.fill();
  return y + 4;
}
function drawFooter(ctx, accent, note, brand) {
  const y = H - 58;
  ctx.fillStyle = C.border; roundRect(ctx, PAD, y - 28, W - 2 * PAD, 2, 1); ctx.fill();
  ctx.textBaseline = "middle";
  const handle = (brand && brand.handle) || (brand && brand.tagline) || "AI · Engineering · ERPIQ";
  ctx.font = fnt(22, "b"); ctx.fillStyle = C.text; ctx.textAlign = "left"; ctx.fillText(handle, PAD, y);
  ctx.font = fnt(19, "b");
  const cta = "Follow for more  →", cw = ctx.measureText(cta).width + 40;
  ctx.fillStyle = lg(ctx, W - PAD - cw, y, W - PAD, y, accent.a, accent.b);
  roundRect(ctx, W - PAD - cw, y - 21, cw, 42, 21); ctx.fill();
  ctx.fillStyle = "#0A0E1B"; ctx.textAlign = "center"; ctx.fillText(cta, W - PAD - cw / 2, y + 1);
  if (note) { ctx.font = fnt(17, "m"); ctx.fillStyle = C.faint; ctx.textAlign = "center"; ctx.fillText(note, W / 2, H - 16); }
  ctx.textAlign = "left";
}

// ---- infographic primitives ----------------------------------------------
function badge(ctx, x, y, d, accent, label, style = "b") {
  ctx.fillStyle = lg(ctx, x, y, x + d, y + d, accent.a, accent.b);
  roundRect(ctx, x, y, d, d, d * 0.32); ctx.fill();
  ctx.fillStyle = "#0A0E1B"; ctx.font = fnt(d * 0.5, "xb"); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + d / 2, y + d / 2 + 1); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}
function statTiles(ctx, stats, accent, y) {
  const items = (stats || []).slice(0, 3); if (!items.length) return y;
  const gap = 18, fullW = W - 2 * PAD, tw = (fullW - gap * 2) / 3, th = 128;
  items.forEach((s, i) => {
    const x = PAD + i * (tw + gap);
    panel(ctx, x, y, tw, th, 18);
    ctx.fillStyle = lg(ctx, x, y, x, y + th, accent.a, accent.b); roundRect(ctx, x, y + 14, 6, th - 28, 3); ctx.fill();
    ctx.textAlign = "left"; ctx.fillStyle = C.text;
    const { lines, px } = fitLines(ctx, s.value || "", tw - 50, 40, 19, 1, "xb");
    ctx.font = fnt(px, "xb"); ctx.textBaseline = "alphabetic";
    ctx.fillText(ellipsize(ctx, lines[0] || "", tw - 50), x + 26, y + 66);
    ctx.font = fnt(18, "sb"); ctx.fillStyle = C.muted;
    ctx.fillText(ellipsize(ctx, (s.label || "").toUpperCase(), tw - 50), x + 26, y + 98);
  });
  return y + th + 24;
}
function featureGrid(ctx, items, accent, y, rowH) {
  const list = (items || []).slice(0, 4);
  const gap = 18, cw = (W - 2 * PAD - gap) / 2;
  list.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = PAD + col * (cw + gap), cy = y + row * (rowH + gap);
    panel(ctx, x, cy, cw, rowH, 18);
    badge(ctx, x + 20, cy + 20, 42, accent, String(i + 1));
    ctx.fillStyle = C.text; ctx.font = fnt(24, "b"); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillText(ellipsize(ctx, it.label || "", cw - 96), x + 78, cy + 40);
    ctx.fillStyle = C.muted; ctx.font = fnt(19, "m");
    wrap(ctx, it.detail || "", cw - 44).slice(0, 2).forEach((ln, k) => ctx.fillText(ln, x + 24, cy + 74 + k * 25));
  });
  return y + 2 * rowH + gap + 24;
}
function flowStrip(ctx, label, steps, accent, y) {
  const list = (steps || []).slice(0, 4); if (!list.length) return y;
  ctx.font = fnt(18, "b"); ctx.fillStyle = C.faint; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillText(label.toUpperCase(), PAD, y + 16);
  let x = PAD; const cy = y + 30, h = 46; ctx.font = fnt(20, "sb");
  list.forEach((raw, i) => {
    const t = String(raw || "").trim(); if (!t) return;
    const cw = ctx.measureText(t).width + 38; if (x + cw > W - PAD) return;
    panel(ctx, x, cy, cw, h, 23);
    ctx.fillStyle = C.text; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(t, x + 19, cy + h / 2 + 1);
    x += cw;
    if (i < list.length - 1 && x + 32 < W - PAD) { ctx.fillStyle = accent.a; ctx.font = fnt(22, "b"); ctx.fillText("→", x + 7, cy + h / 2 + 1); ctx.font = fnt(20, "sb"); x += 34; }
  });
  ctx.textBaseline = "alphabetic";
  return cy + h + 22;
}
function chipRow(ctx, label, items, accent, y) {
  const list = (items || []).slice(0, 6); if (!list.length) return y;
  ctx.font = fnt(18, "b"); ctx.fillStyle = C.faint; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(label.toUpperCase(), PAD, y + 16);
  let x = PAD; const cy = y + 28, h = 44; ctx.font = fnt(20, "sb");
  for (const raw of list) {
    const t = String(raw || "").trim(); if (!t) continue;
    const cw = ctx.measureText(t).width + 34; if (x + cw > W - PAD) break;
    ctx.fillStyle = accent.soft; roundRect(ctx, x, cy, cw, h, 14); ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; roundRect(ctx, x, cy, cw, h, 14); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textBaseline = "middle"; ctx.fillText(t, x + 17, cy + h / 2 + 1);
    ctx.textBaseline = "alphabetic"; x += cw + 12;
  }
  return cy + h + 20;
}

// ---- model face-off: legend + gradient score-bar chart --------------------
function legend(ctx, models, y) {
  let x = PAD; const cy = y + 14;
  models.slice(0, 3).forEach((m, i) => {
    ctx.fillStyle = lg(ctx, x, cy - 7, x + 16, cy + 7, SERIES[i][0], SERIES[i][1]);
    roundRect(ctx, x, cy - 7, 16, 14, 5); ctx.fill();
    ctx.fillStyle = C.text; ctx.font = fnt(20, "sb"); ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const name = ellipsize(ctx, m, 300); ctx.fillText(name, x + 26, cy + 1);
    x += 26 + ctx.measureText(name).width + 36;
  });
  ctx.textBaseline = "alphabetic"; return y + 40;
}
function scoreChart(ctx, metrics, y, bottomLimit) {
  const rows = (metrics || []).slice(0, 5);
  const axisW = 190, chartX = PAD + axisW + 10, chartW = W - PAD - chartX;
  const rowH = Math.max(80, Math.min(106, (bottomLimit - y) / Math.max(rows.length, 1)));
  rows.forEach((row, i) => {
    const ry = y + i * rowH;
    ctx.fillStyle = C.muted; ctx.font = fnt(20, "sb"); ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const al = wrap(ctx, row.axis, axisW - 6).slice(0, 2);
    al.forEach((ln, k) => ctx.fillText(ln, PAD, ry + rowH / 2 + (k - (al.length - 1) / 2) * 23));
    const barH = 22, gap = (rowH - 14 - barH * 3) / 2;
    for (let j = 0; j < 3; j++) {
      const by = ry + 7 + j * (barH + gap), score = Math.max(0, Math.min(100, (row.scores || [])[j] ?? 50));
      ctx.fillStyle = C.track; roundRect(ctx, chartX, by, chartW, barH, 11); ctx.fill();
      const fw = Math.max(barH, chartW * score / 100);
      ctx.fillStyle = lg(ctx, chartX, by, chartX + fw, by, SERIES[j][0], SERIES[j][1]);
      roundRect(ctx, chartX, by, fw, barH, 11); ctx.fill();
      const cell = (row.cells || [])[j] ?? "—";
      ctx.font = fnt(15, "b"); ctx.textBaseline = "middle";
      if (ctx.measureText(cell).width <= fw - 18) { ctx.fillStyle = "#0A0E1B"; ctx.textAlign = "left"; ctx.fillText(cell, chartX + 12, by + barH / 2 + 1); }
      else { ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.fillText(ellipsize(ctx, cell, chartW - fw - 14), chartX + fw + 8, by + barH / 2 + 1); }
    }
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  });
  return y + rows.length * rowH + 4;
}

// ---- pillar bodies --------------------------------------------------------
function bodyClaude(ctx, c, accent, topY) {
  let y = statTiles(ctx, c.stats, accent, topY + 26);
  y = featureGrid(ctx, c.capabilities, accent, y, 126);
  flowStrip(ctx, "How it works", c.flow, accent, y);
}
function bodyErp(ctx, c, accent, topY) {
  let y = statTiles(ctx, c.stats, accent, topY + 26);
  y = featureGrid(ctx, c.features, accent, y, 120);
  y = flowStrip(ctx, "Data flow", c.flow, accent, y);
  y = chipRow(ctx, "Stack", c.stackChips, accent, y);
  if (c.metric) { ctx.font = fnt(22, "sb"); ctx.fillStyle = accent.a; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillText(ellipsize(ctx, c.metric, W - 2 * PAD), PAD, y + 16); }
}
function bodyModels(ctx, c, accent, topY) {
  let y = legend(ctx, c.models || [], topY + 22);
  y = scoreChart(ctx, c.metrics, y + 6, H - 196);
  if (c.verdict) {
    const vy = y + 12, fullW = W - 2 * PAD;
    panel(ctx, PAD, vy, fullW, 68, 16, accent.soft);
    ctx.fillStyle = accent.a; ctx.font = fnt(19, "b"); ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText("VERDICT", PAD + 22, vy + 34);
    const vx = PAD + 22 + ctx.measureText("VERDICT").width + 22;
    ctx.fillStyle = C.text; ctx.font = fnt(21, "sb"); ctx.fillText(ellipsize(ctx, c.verdict, fullW - (vx - PAD) - 22), vx, vy + 34);
    ctx.textBaseline = "alphabetic";
  }
}

const BODIES = { claude: bodyClaude, models: bodyModels, erp: bodyErp };

export async function renderCard({ pillar, content, bg, brand, file }) {
  const accent = ACCENT[pillar] || ACCENT.claude;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  let bgImg = null;
  if (bg) { try { bgImg = await loadImage(bg); } catch { bgImg = null; } }

  drawBackground(ctx, bgImg, accent);
  const afterHeader = drawHeader(ctx, accent);
  const afterTitle = drawTitle(ctx, content, accent, afterHeader);
  (BODIES[pillar] || bodyClaude)(ctx, content, accent, afterTitle);
  const note = pillar === "models"
    ? "Relative, illustrative scores · as of " + new Date().toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) + " · verify specifics"
    : "";
  drawFooter(ctx, accent, note, brand);

  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  return file;
}
