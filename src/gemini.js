// gemini.js — generate the day's content with Google Gemini (free tier).
// Returns: { title, hook, bullets[3], script, post, hashtags[5], description, cta }

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = (angle, source) => `You are a viral short-form content creator AND a senior AI engineer.
You write daily 9:16 vertical videos (LinkedIn / Reels / TikTok style) about AI & ML.
Today's angle: "${angle}".
Use this fresh news item as inspiration (rewrite completely in your own words, never copy):
TITLE: ${source.title}
SUMMARY: ${source.summary}

GOAL: stop the scroll. Be punchy, specific, surprising, and concrete — no fluff, no generic buzzwords.
The "script" is spoken aloud by a TTS voice AND shown as fast word-by-word captions, so:
- Use SHORT, punchy sentences (3-9 words each). Conversational and energetic.
- Open with a bold hook in the first sentence. End by teasing a follow.
- Avoid hashtags, emojis, URLs, parentheses, and quotation marks INSIDE the script (they read awkwardly as captions).

Return STRICT JSON (no markdown, no backticks) with EXACTLY these keys:
{
  "title": "a 3-6 word scroll-stopping on-screen headline (Title Case)",
  "hook": "the scroll-stopping first line of the written post",
  "bullets": ["3 punchy takeaways, max 6 words each", "...", "..."],
  "script": "spoken voiceover, 55-80 words, short punchy sentences, energetic, matches the captions",
  "keywords": ["6-10 single power-words from the script to visually highlight, e.g. names, numbers, verbs"],
  "post": "the full LinkedIn post: hook + 3 bullet lines (use • ) + a closing question. 120-180 words.",
  "hashtags": ["#AI", "#...", "#...", "#...", "#..."],
  "description": "one-sentence summary",
  "cta": "a punchy 2-4 word end-card line (e.g. 'Follow for more', 'Save this')"
}`;

export async function generateContent({ angle, source, apiKey }) {
  const body = {
    contents: [{ parts: [{ text: PROMPT(angle, source) }] }],
    generationConfig: {
      temperature: 0.8,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const clean = raw.replace(/```json|```/g, "").trim();

  let obj;
  try {
    obj = JSON.parse(clean);
  } catch {
    throw new Error("Gemini did not return valid JSON:\n" + clean.slice(0, 400));
  }

  // Safety defaults
  obj.title ||= obj.hook || "AI Update";
  obj.bullets = Array.isArray(obj.bullets) ? obj.bullets.slice(0, 3) : [];
  while (obj.bullets.length < 3) obj.bullets.push("");
  obj.hashtags = Array.isArray(obj.hashtags) ? obj.hashtags.slice(0, 5) : ["#AI"];
  obj.keywords = Array.isArray(obj.keywords) ? obj.keywords.slice(0, 12) : [];
  obj.script ||= obj.post || obj.title;
  obj.cta ||= "Follow for more";
  obj.post ||= obj.hook || obj.title;
  return obj;
}
