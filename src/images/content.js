// content.js — generate the day's English post + RICH infographic card data.
// One generator, three pillar-specific prompts. Returns an object whose fields
// feed BOTH the LinkedIn caption (post/hashtags) and a chart-rich rendered card
// (stat tiles, score-bar charts, flow diagrams).

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

const monthYear = () =>
  new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const BASE = `You are a senior AI/software engineer AND an information designer producing a premium LinkedIn infographic (English only).
Audience: technical practitioners, founders, engineering managers. Be advanced, specific, accurate, and DENSE with real signal.
Hard rules:
- NO hype, NO clichés ("game-changer", "revolutionary"), NO emojis inside card fields.
- Every value must be concrete and correct. If unsure of a figure, do NOT invent it — use "—".
- Keep card text TIGHT: it is rendered in chips, tiles and chart bars, so labels are 1-4 words, details 5-9 words.
- The written post is 110-180 words: strong first-line hook, 3-4 substantive lines, then one CTA question.
- Return STRICT JSON only (no markdown fences, no commentary).`;

function claudePrompt(skill) {
  return `${BASE}

TOPIC: A deep, advanced explainer of the Claude / Claude Code capability: "${skill.title}".
GROUNDING (accurate, expand — do not contradict): ${skill.brief}

Return JSON with EXACTLY these keys:
{
  "headline": "${skill.title}",
  "subhead": "a 4-8 word precise descriptor of what it is",
  "stats": [ {"value":"1-2 words or a number","label":"1-3 words"}, ...exactly 3 punchy headline stats ],
  "capabilities": [ {"label":"2-4 words","detail":"a concrete 5-9 word specific"}, ...exactly 4 ],
  "flow": ["3-4 steps of how it actually works, 2-3 words each"],
  "useCase": "one concrete engineering use case, max 12 words",
  "post": "the full LinkedIn post, 110-180 words, hook + insight + CTA question",
  "hashtags": ["#Claude","#AI","#...","#...","#..."],
  "altText": "one factual sentence describing the infographic for accessibility",
  "imagePrompt": "a vivid, art-directed prompt for an abstract PREMIUM dark tech BACKGROUND (no text, no UI, no charts) that thematically matches this capability"
}`;
}

function modelsPrompt(trio) {
  return `${BASE}

TOPIC: A balanced, chart-driven head-to-head of three models in the category "${trio.category}".
CONTENDERS (use these exact display names): ${trio.models.map((m) => `"${m}"`).join(", ")}.
COMPARE ON THESE AXES (one chart row each, in this order): ${trio.axes.map((a) => `"${a}"`).join(", ")}.
For EACH axis give, per model: a "score" 0-100 (your best RELATIVE estimate for visual comparison) AND a "cell"
(1-3 word concrete value or rating). Make scores differentiate the models. Where a real figure is unknown use "—" for the cell
but still give a reasonable relative score. This is illustrative, as of ${monthYear()} — do not present scores as official benchmarks.

Return JSON with EXACTLY these keys:
{
  "headline": "${trio.category}",
  "subhead": "a 4-8 word framing of the comparison",
  "models": ["${trio.models[0]}","${trio.models[1]}","${trio.models[2]}"],
  "metrics": [ {"axis":"${trio.axes[0]}","scores":[n,n,n],"cells":["m1","m2","m3"]}, ... one per axis, same order ],
  "verdict": "balanced one-line takeaway: who wins for what, max 16 words",
  "post": "the full LinkedIn post, 110-180 words, hook + the real trade-offs + CTA question",
  "hashtags": ["#AI","#LLM","#...","#...","#..."],
  "altText": "one factual sentence describing the comparison chart for accessibility",
  "imagePrompt": "a vivid, art-directed prompt for an abstract PREMIUM dark tech BACKGROUND (no text, no logos, no charts) evoking a three-way contest"
}`;
}

function erpPrompt(topic) {
  return `${BASE}

TOPIC: A deep, advanced spotlight on ONE module of a real production ERP called "ERPIQ" (an Iraq-first SMB ERP).
MODULE: "${topic.title}".
GROUNDING (factual — expand, never contradict): ${topic.brief}
ERPIQ'S REAL STACK (use ONLY these in stackChips — never invent PostgreSQL/MySQL/Node): Python, FastAPI, Firestore (NoSQL), React 19, TypeScript, Ant Design, Cloud Run, Firebase. Pick the 3-5 most relevant to THIS module (you may add a standard like RBAC, IQD, ITA, WhatsApp API).
Write as the engineer who built it: what it does, why the design choices matter, the hard problem it solves. Iraq/SMB-aware.

Return JSON with EXACTLY these keys:
{
  "headline": "${topic.title}",
  "subhead": "a 4-8 word precise descriptor",
  "stats": [ {"value":"1-2 words or a number","label":"1-3 words"}, ...exactly 3 punchy stats ],
  "features": [ {"label":"2-4 words","detail":"a concrete 5-9 word specific"}, ...exactly 4 ],
  "flow": ["3-4 step data/architecture flow, 1-3 words each"],
  "stackChips": ["3-5 short tech tags from the real stack"],
  "metric": "one credible impact line, max 12 words (no fake numbers)",
  "post": "the full LinkedIn post, 110-180 words, hook + engineering depth + CTA question",
  "hashtags": ["#ERP","#FastAPI","#...","#...","#..."],
  "altText": "one factual sentence describing the infographic for accessibility",
  "imagePrompt": "a vivid, art-directed prompt for an abstract PREMIUM dark tech BACKGROUND (no text, no UI screenshots, no charts) evoking enterprise software and data flow"
}`;
}

const PROMPTS = { claude: claudePrompt, models: modelsPrompt, erp: erpPrompt };

export async function generatePostContent({ pillar, topic, apiKey }) {
  const build = PROMPTS[pillar];
  if (!build) throw new Error(`unknown pillar: ${pillar}`);

  const body = {
    contents: [{ parts: [{ text: build(topic) }] }],
    generationConfig: { temperature: pillar === "models" ? 0.5 : 0.7, responseMimeType: "application/json" },
  };

  let raw = null, lastErr = "";
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const data = await r.json();
        raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("content model:", model);
        break;
      }
      lastErr = `${model} -> ${r.status}`;
    } catch (e) { lastErr = `${model} -> ${e.message}`; }
  }
  if (!raw) throw new Error(`All Gemini text models failed. Last: ${lastErr}`);

  let obj;
  try { obj = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { throw new Error("content model did not return valid JSON:\n" + raw.slice(0, 400)); }

  // safety defaults so the renderer never crashes
  obj.headline ||= topic.title || topic.category || "Update";
  obj.subhead ||= "";
  obj.hashtags = Array.isArray(obj.hashtags) ? obj.hashtags.slice(0, 6) : ["#AI"];
  obj.post ||= obj.subhead || obj.headline;
  obj.altText ||= obj.subhead || obj.headline;
  obj.imagePrompt ||= "abstract premium dark technology background, soft gradients, depth of field";

  if (pillar === "claude") {
    obj.stats = ensureStats(obj.stats, 3);
    obj.capabilities = ensureItems(obj.capabilities, 4);
    obj.flow = cleanList(obj.flow, 4);
  } else if (pillar === "models") {
    obj.models = Array.isArray(obj.models) && obj.models.length === 3 ? obj.models : topic.models;
    obj.metrics = (Array.isArray(obj.metrics) ? obj.metrics : []).filter((m) => m && m.axis).slice(0, 6)
      .map((m) => ({ axis: m.axis, scores: normScores(m.scores), cells: padCells(m.cells) }));
  } else if (pillar === "erp") {
    obj.stats = ensureStats(obj.stats, 3);
    obj.features = ensureItems(obj.features, 4);
    obj.flow = cleanList(obj.flow, 4);
    obj.stackChips = cleanList(obj.stackChips, 5);
  }
  return obj;
}

function ensureItems(arr, n) {
  const out = Array.isArray(arr) ? arr.filter((x) => x && (x.label || x.detail)) : [];
  while (out.length < n) out.push({ label: "", detail: "" });
  return out.slice(0, n);
}
function ensureStats(arr, n) {
  const out = Array.isArray(arr) ? arr.filter((x) => x && (x.value || x.label)) : [];
  while (out.length < n) out.push({ value: "", label: "" });
  return out.slice(0, n);
}
function cleanList(arr, n) {
  return (Array.isArray(arr) ? arr : []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, n);
}
function padCells(cells) {
  const out = Array.isArray(cells) ? cells.slice(0, 3) : [];
  while (out.length < 3) out.push("—");
  return out.map((c) => (c == null || c === "" ? "—" : String(c)));
}
function normScores(scores) {
  const out = (Array.isArray(scores) ? scores : []).slice(0, 3).map((n) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.max(6, Math.min(100, v)) : 50;
  });
  while (out.length < 3) out.push(50);
  return out;
}
