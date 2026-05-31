// Cloudflare Worker — Telegram AI bot for LinkedIn AI Autopilot.
//   • Any message  -> AI answer (Gemini)
//   • "video <topic>" / "/video <topic>" / "ڤیدیۆ <topic>" -> triggers a LinkedIn video on that topic
//
// Set these in the Worker dashboard (Settings -> Variables and Secrets), as SECRETS:
//   TELEGRAM_BOT_TOKEN   your bot token
//   GEMINI_API_KEY       your Gemini key
//   GH_PAT               GitHub token with repo + workflow scope
//   GH_REPO              safaothman541-oss/linkedin-ai-autopilot
//   ALLOWED_CHAT_ID      your Telegram chat id (6558230965)  -> keeps the bot private
//   WEBHOOK_SECRET       any random string (must match the webhook setup)

export default {
  async fetch(request, env) {
    if (request.method === "GET") return new Response("AI bot is running ✅");

    if (env.WEBHOOK_SECRET && request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    let update;
    try { update = await request.json(); } catch { return new Response("ok"); }
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return new Response("ok");

    const chatId = msg.chat.id;
    const text = String(msg.text).trim();

    if (env.ALLOWED_CHAT_ID && String(chatId) !== String(env.ALLOWED_CHAT_ID)) {
      await send(env, chatId, "🔒 This is a private bot.");
      return new Response("ok");
    }

    if (text === "/start" || text === "/help") {
      await send(env, chatId, "👋 I'm your AI assistant.\n\n• Ask me anything — I reply with AI.\n• Type:  video <topic>  — I'll create a LinkedIn video about it (arrives here in a few minutes).");
      return new Response("ok");
    }

    // video command
    let topic = null;
    const low = text.toLowerCase();
    if (low.startsWith("/video ")) topic = text.slice(7).trim();
    else if (low.startsWith("video ")) topic = text.slice(6).trim();
    else if (text.startsWith("ڤیدیۆ")) topic = text.replace(/^ڤیدیۆ\S*\s*/, "").trim();

    if (topic && topic.length > 1) {
      const ok = await dispatch(env, topic);
      await send(env, chatId, ok
        ? `🎬 Creating a video about:\n"${topic}"\n\nIt'll arrive here in a few minutes ⏳`
        : "⚠️ Couldn't start the video job (check GH_PAT / GH_REPO).");
      return new Response("ok");
    }

    // default: AI chat
    await send(env, chatId, await ai(env, text));
    return new Response("ok");
  },
};

async function send(env, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true }),
    });
  } catch { /* ignore */ }
}

async function ai(env, prompt) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are a concise, friendly AI assistant on Telegram. Answer clearly and briefly. Reply in the user's language (including Kurdish Sorani)." }] },
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || "🤔 I couldn't generate an answer.";
  } catch (e) { return "⚠️ AI error: " + e.message; }
}

async function dispatch(env, topic) {
  try {
    const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/daily.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_PAT}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "tg-ai-bot",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { topic: topic.slice(0, 300) } }),
    });
    return r.status === 204 || r.ok;
  } catch { return false; }
}
