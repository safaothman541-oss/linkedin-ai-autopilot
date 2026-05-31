// Cloudflare Worker — full control Telegram bot for LinkedIn AI Autopilot.
// Chat with AI (Gemini) + fully control the automation (make videos, settings, status).
// Worker secrets: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GH_PAT, GH_REPO, ALLOWED_CHAT_ID, WEBHOOK_SECRET

const HELP = `🤖 *AI Autopilot Bot*

🎬 *Videos*
• \`video <topic>\` — make a video on a topic
• \`ڤیدیۆ <بابەت>\` — هەمان شت بە کوردی
• \`run\` — make today's videos now

⚙️ *Control*
• \`auto\` — post to LinkedIn automatically
• \`approve\` — Telegram only (you post manually)
• \`voice <name>\` — e.g. af_bella, am_adam, af_heart
• \`count <1-5>\` — videos per day
• \`status\` — last run status
• \`settings\` — show current settings

💬 *Or just ask me anything* — I answer with AI.`;

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
    try { await handle(env, chatId, text); }
    catch (e) { await send(env, chatId, "⚠️ " + e.message); }
    return new Response("ok");
  },
};

async function handle(env, chatId, text) {
  const lower = text.toLowerCase();
  const cmd = lower.replace(/^\//, "").split(/\s+/)[0];
  const arg = text.replace(/^\/?\S+\s*/, "").trim();

  if (cmd === "start" || cmd === "help") return send(env, chatId, HELP, true);

  // make a video about a topic
  let topic = null;
  if (cmd === "video" || cmd === "ڤیدیۆ") topic = arg;
  else if (text.startsWith("ڤیدیۆ")) topic = text.replace(/^ڤیدیۆ\S*\s*/, "").trim();
  if (topic !== null && topic.length > 1) {
    const ok = await dispatch(env, { topic: topic.replace(/\s+/g, " ").trim().slice(0, 3000) });
    return send(env, chatId, ok ? `🎬 Creating a video from your brief:\n"${topic.slice(0, 200)}${topic.length > 200 ? "…" : ""}"\nIt'll arrive here in a few minutes ⏳` : "⚠️ Couldn't start the job.");
  }

  if (cmd === "run") {
    const ok = await dispatch(env, {});
    return send(env, chatId, ok ? "🎬 Creating today's videos now — they'll arrive shortly ⏳" : "⚠️ Couldn't start the job.");
  }
  if (cmd === "auto") {
    const ok = await setVar(env, "POST_MODE", "auto");
    return send(env, chatId, ok ? "✅ Mode = *auto* — videos post to LinkedIn automatically." : "⚠️ Couldn't update.", true);
  }
  if (cmd === "approve") {
    const ok = await setVar(env, "POST_MODE", "approve");
    return send(env, chatId, ok ? "✅ Mode = *approve* — videos come to Telegram only; you post manually." : "⚠️ Couldn't update.", true);
  }
  if (cmd === "voice") {
    if (!arg) return send(env, chatId, "Usage: voice af_bella");
    const ok = await setVar(env, "TTS_VOICE", arg.split(/\s+/)[0]);
    return send(env, chatId, ok ? `✅ Voice set to ${arg.split(/\s+/)[0]}` : "⚠️ Couldn't update.");
  }
  if (cmd === "count") {
    const n = parseInt(arg, 10);
    if (!n || n < 1 || n > 5) return send(env, chatId, "Usage: count 3  (1 to 5)");
    const ok = await setVar(env, "VIDEOS_PER_RUN", String(n));
    return send(env, chatId, ok ? `✅ Videos per run = ${n}` : "⚠️ Couldn't update.");
  }
  if (cmd === "status") return send(env, chatId, await status(env));
  if (cmd === "settings") return send(env, chatId, await settings(env), true);

  // default: AI chat
  return send(env, chatId, await ai(env, text));
}

async function send(env, chatId, text, markdown) {
  try {
    const body = { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true };
    if (markdown) body.parse_mode = "Markdown";
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch { /* ignore */ }
}

async function ai(env, prompt) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are a concise, friendly AI assistant on Telegram. Answer clearly and briefly. Reply in the user's language (including Kurdish Sorani). If asked what you can do, mention you can also make videos (video <topic>) and control the automation (auto/approve/voice/count/status/settings)." }] },
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || "🤔 I couldn't generate an answer.";
  } catch (e) { return "⚠️ AI error: " + e.message; }
}

function gh(env, method, path, body) {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GH_PAT}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "tg-ai-bot",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function dispatch(env, inputs) {
  try {
    const r = await gh(env, "POST", `/repos/${env.GH_REPO}/actions/workflows/daily.yml/dispatches`, { ref: "main", inputs });
    return r.status === 204 || r.ok;
  } catch { return false; }
}

async function setVar(env, name, value) {
  try {
    let r = await gh(env, "PATCH", `/repos/${env.GH_REPO}/actions/variables/${name}`, { name, value });
    if (r.status === 404) r = await gh(env, "POST", `/repos/${env.GH_REPO}/actions/variables`, { name, value });
    return r.status === 204 || r.status === 201 || r.ok;
  } catch { return false; }
}

async function getVar(env, name, def) {
  try {
    const r = await gh(env, "GET", `/repos/${env.GH_REPO}/actions/variables/${name}`);
    if (!r.ok) return def;
    const j = await r.json();
    return j.value ?? def;
  } catch { return def; }
}

async function status(env) {
  try {
    const r = await gh(env, "GET", `/repos/${env.GH_REPO}/actions/runs?per_page=1`);
    if (!r.ok) return "⚠️ Couldn't fetch status.";
    const j = await r.json();
    const run = j.workflow_runs && j.workflow_runs[0];
    if (!run) return "No runs yet.";
    const icon = run.conclusion === "success" ? "✅" : run.conclusion ? "❌" : "🔄";
    return `${icon} Last run: ${run.status}${run.conclusion ? " / " + run.conclusion : ""}\n${run.html_url}`;
  } catch (e) { return "⚠️ " + e.message; }
}

async function settings(env) {
  const [mode, voice, count] = await Promise.all([
    getVar(env, "POST_MODE", "approve"),
    getVar(env, "TTS_VOICE", "af_heart"),
    getVar(env, "VIDEOS_PER_RUN", "3"),
  ]);
  return `⚙️ *Current settings*\n• Mode: ${mode}\n• Voice: ${voice}\n• Videos/run: ${count}`;
}
