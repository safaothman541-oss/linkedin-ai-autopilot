// background.js — generate an AI background image (the "hybrid" half: AI art
// behind, precise text rendered on top in card.js). Returns a PNG/JPEG Buffer,
// or null so the caller falls back to a gradient.
// Tries, in order: Cloudflare Workers AI (FLUX) → Gemini image → null.

const STYLE_SUFFIX =
  "Editorial tech-magazine cover background. Premium, modern, abstract, high detail, 8k, depth of field. " +
  "Deep navy-to-charcoal gradient base with ONE subtle accent-color glow and faint geometric data motifs " +
  "(thin connected nodes, light grid lines, soft particle flow, gentle bokeh). Cinematic rim lighting, fine film grain. " +
  "NO text, NO words, NO letters, NO numbers, NO logos, NO charts, NO graphs, NO UI, NO watermark, NO frame, NO border. " +
  "Calm, dark and uncluttered so white text overlaid on top stays perfectly readable.";

const GEMINI_IMAGE_MODELS = ["gemini-2.5-flash-image", "gemini-2.0-flash-preview-image-generation"];

// Cloudflare Workers AI — FLUX-1 schnell (fast, free-tier friendly).
async function fromCloudflare({ accountId, apiToken, prompt }) {
  if (!accountId || !apiToken) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: `${prompt}. ${STYLE_SUFFIX}`, steps: 8 }),
    });
    if (!r.ok) { console.warn(`CF FLUX -> ${r.status}`); return null; }
    const data = await r.json();
    const b64 = data?.result?.image;
    if (b64) { console.log("background: Cloudflare FLUX"); return Buffer.from(b64, "base64"); }
  } catch (e) { console.warn(`CF FLUX error: ${e.message}`); }
  return null;
}

// Gemini image generation (fallback if Cloudflare is unavailable).
async function fromGemini({ apiKey, prompt }) {
  if (!apiKey) return null;
  const body = {
    contents: [{ parts: [{ text: `${prompt}. ${STYLE_SUFFIX}` }] }],
    generationConfig: { responseModalities: ["IMAGE"], temperature: 0.9 },
  };
  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { console.warn(`Gemini bg ${model} -> ${r.status}`); continue; }
      const data = await r.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const b64 = parts.find((p) => p.inlineData?.data || p.inline_data?.data)?.inlineData?.data
        || parts.find((p) => p.inline_data?.data)?.inline_data?.data;
      if (b64) { console.log("background: Gemini", model); return Buffer.from(b64, "base64"); }
    } catch (e) { console.warn(`Gemini bg ${model} error: ${e.message}`); }
  }
  return null;
}

export async function makeBackground({ apiKey, prompt, mode = "hybrid", cfAccountId, cfApiToken }) {
  if (mode === "gradient") return null;
  const cf = await fromCloudflare({ accountId: cfAccountId, apiToken: cfApiToken, prompt });
  if (cf) return cf;
  const g = await fromGemini({ apiKey, prompt });
  if (g) return g;
  console.warn("AI background unavailable — using gradient fallback.");
  return null;
}
