// gemini.js — generate the day's content with Google Gemini (free tier).
// Returns: { title, hook, bullets[3], script, post, hashtags[5], description, cta }

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = (angle, source) => `You are a senior AI engineer writing a daily LinkedIn post.
Today's content angle: "${angle}".
Use this fresh news item as inspiration (rewrite in your own words, do not copy):
TITLE: ${source.title}
SUMMARY: ${source.summary}

Write punchy, specific, non-generic content for an audience of AI/ML engineers and builders.
Return STRICT JSON (no markdown) with exactly these keys:
{
  "title": "a 3-6 word on-screen hook for the video",
  "hook": "the first line of the post, scroll-stopping",
  "bullets": ["3 short on-screen points, max 7 words each", "...", "..."],
  "script": "a spoken voiceover narration, ~70-85 words, natural and energetic, that matches the on-screen text",
  "post": "the full LinkedIn post: hook + 3 bullet lines (use • ) + a closing question. 120-180 words.",
  "hashtags": ["#AI", "#...", "#...", "#...", "#..."],
  "description": "one-sentence summary",
  "cta": "a 2-4 word call to action for the end card"
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
  obj.script ||= obj.post || obj.title;
  obj.cta ||= "Follow for more";
  obj.post ||= obj.hook || obj.title;
  return obj;
}
