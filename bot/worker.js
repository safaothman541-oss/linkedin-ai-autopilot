// Cloudflare Worker — Telegram bot for LinkedIn AI Autopilot.
// Two jobs:
//  1) DRAFTS: on `today` (or daily cron) it writes 3 posts (caption + image prompt)
//     for the 3 pillars and sends them to Telegram.
//  2) PUBLISH: when you REPLY to a draft with a photo, it posts your image + that
//     post's caption to LinkedIn.
// Secrets: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, LINKEDIN_ACCESS_TOKEN,
//          LINKEDIN_PERSON_URN, ALLOWED_CHAT_ID, WEBHOOK_SECRET,
//          GH_PAT, GH_REPO (for the legacy video commands).

const CAPTION_MARK = "📝 CAPTION (posted with your image):";

const HELP = `🤖 *LinkedIn AI Autopilot*

📝 *Daily posts*
• \`today\` — draft today's 3 posts (Claude skill · model face-off · ERPIQ)
• Then *reply to a draft with your image* → I post it + the caption to LinkedIn ✅

🎬 *Videos (legacy)*
• \`video <topic>\` · \`run\` · \`auto\` / \`approve\` · \`voice\` · \`count\` · \`status\`

💬 Or just ask me anything.`;

// ---------- pillars & rotation -------------------------------------------
const CLAUDE = [
  ["Agent Skills", "SKILL.md files Claude loads on demand via progressive disclosure; portable across Code, API and apps."],
  ["Subagents", "Isolated parallel agents with their own context that fan out work and return only the conclusion."],
  ["Hooks", "Shell commands the harness runs on events (PreToolUse, PostToolUse, Stop) for guardrails and automation."],
  ["Model Context Protocol (MCP)", "Open standard connecting Claude to external tools and data via typed MCP servers."],
  ["Custom Slash Commands", "Reusable Markdown prompts in .claude/commands that become /commands with arguments."],
  ["The Memory Tool", "File-based memory Claude reads and writes across sessions to recall preferences and decisions."],
  ["Plan Mode", "Read-only mode where Claude proposes a step-by-step plan before editing anything."],
  ["Prompt Caching", "Cache large stable prefixes to cut latency and cost on iterative agent loops; 5-min TTL."],
  ["Extended Thinking", "A budgeted reasoning phase with interleaved thinking between tool calls for hard problems."],
  ["Tool Use", "Typed JSON-Schema tools Claude decides to call; the backbone of every agent, parallel calls included."],
  ["Message Batches API", "Async bulk jobs at ~50% off with results within 24h; built for evals and offline pipelines."],
  ["Files API", "Upload documents once and reference them by ID across many requests; pairs with vision and PDF."],
  ["Citations", "Claude grounds answers in your documents and returns exact source spans for auditable RAG."],
  ["Computer Use", "Claude controls a screen via screenshots and mouse/keyboard to automate GUIs with no API."],
  ["Vision & PDF", "Native image and multi-page PDF input: charts, diagrams and layout read directly, no OCR step."],
  ["Claude Agent SDK", "The harness behind Claude Code as a library: tools, subagents, hooks, MCP, permission modes."],
  ["Structured Outputs", "Constrain responses to a JSON Schema for validated, parseable objects every time."],
  ["Checkpoints & Rewind", "Claude Code snapshots the workspace so you can rewind code and conversation to any point."],
  ["Output Styles", "Reusable response personas that reshape how Claude writes for a project."],
  ["Permissions & Settings", "Allow/deny rules in settings.json govern which tools run without a prompt."],
];
const MODELS = [
  ["Frontier Reasoning LLMs", ["Claude Opus 4.x", "OpenAI GPT-5 class", "Google Gemini 2.5 Pro"], ["Reasoning", "Coding", "Context window", "Multimodal", "Price"]],
  ["Fast & Low-cost LLMs", ["Claude Haiku 4.5", "GPT-5 mini class", "Gemini 2.5 Flash"], ["Latency", "Cost", "Quality", "Context", "Tool use"]],
  ["Open-weight LLMs", ["Llama 3.x / 4", "Qwen 2.5/3", "DeepSeek V3/R1"], ["License", "Params", "Reasoning", "Self-host cost", "Ecosystem"]],
  ["Coding Models", ["Claude Sonnet", "GPT-5 Codex class", "Qwen3-Coder / DeepSeek"], ["Agentic coding", "Diff accuracy", "Long-context", "Tool calling", "Cost"]],
  ["Image Generation", ["Google Imagen", "OpenAI GPT Image", "FLUX / Midjourney"], ["Photorealism", "Text-in-image", "Editing", "Speed", "API"]],
  ["Text-to-Video", ["OpenAI Sora", "Google Veo", "Runway / Kling"], ["Clip length", "Motion", "Control", "Audio", "Access"]],
  ["Speech-to-Text", ["OpenAI Whisper", "Deepgram Nova", "AssemblyAI"], ["Accuracy", "Languages", "Real-time", "Diarization", "Cost"]],
  ["Text-to-Speech", ["ElevenLabs", "OpenAI TTS", "Kokoro (open)"], ["Naturalness", "Cloning", "Latency", "Languages", "Price"]],
  ["Embeddings", ["OpenAI embed-3", "Voyage AI", "Cohere / Gemini"], ["Retrieval", "Dimensions", "Max input", "Multilingual", "Cost"]],
  ["Vision-Language", ["Claude vision", "GPT-4o/5 vision", "Gemini 2.5"], ["Document OCR", "Charts", "Grounding", "Video", "Cost"]],
];
const ERP = [
  ["ERPIQ Architecture", "Iraq-first SMB ERP: FastAPI + Firestore backend, React 19 + Ant Design frontend, Cloud Run + Firebase, Kurdish RTL."],
  ["Accounting & GL", "Double-entry GL with enforced journal balancing, period locks and chart of accounts. Tier-4."],
  ["Sales & AR", "Quotes to Sales Orders to Invoices and Credit Notes, recurring invoices and customer statements."],
  ["Purchasing & AP", "Purchase Orders, vendor Bills and 3-way match (PO/receipt/bill) to block over-billing."],
  ["Inventory", "Multi-warehouse stock with lots/serials, transfers and stock moves; valuation flows to accounting."],
  ["Point of Sale", "Offline-first terminal using IndexedDB sync with idempotent replay; cash control; restaurant KDS."],
  ["Security: RBAC & Audit", "Role-based access, tamper-evident hash-chain audit log, field-level PII encryption."],
  ["Platform Console", "Vendor console to manage tenant orgs, licenses and audited support impersonation."],
  ["Module Licensing", "Per-tenant module gates and bundle editor; features switch on by plan via onboarding."],
  ["CRM Pipeline", "Leads to Opportunities to Pipeline on a Kanban board with activities and conversion to orders."],
  ["HR Management", "Employees, contracts, attendance (face/PIN/manual) and time-off allocation with approvals."],
  ["Iraq Payroll", "Auto-computed payslips with Iraq salary rules: income tax, social security, withholding; IQD."],
  ["Banking", "Bank statement import and reconciliation against GL entries with matching rules."],
  ["Tax Engine (Iraq)", "VAT, corporate tax 15% and withholding 3-5% with returns and settings."],
  ["Manufacturing", "Bills of Materials, Manufacturing Orders, work orders and routing with cost roll-up."],
  ["Projects & Timesheets", "Tasks, Gantt planning, timesheets and project profitability."],
  ["Fixed Assets", "Asset register with scheduled depreciation runs posting to the GL."],
  ["Subscriptions", "Recurring plans with MRR reporting, a dunning queue and pause/cancel lifecycle."],
  ["Reports & Analytics", "Standard financial statements plus embedded analytics, custom reports and dashboards."],
  ["E-Invoicing (ITA)", "Iraq Tax Authority e-invoice export with XSD-validated payloads and portal credentials."],
  ["WhatsApp Integration", "Send invoices, statements and notifications over the Meta WhatsApp Business API."],
  ["Iraq Payments", "Local rails via FIB and Zain Cash merchant integrations, reconciled back to invoices."],
  ["Multi-Entity", "Manage several legal entities with consolidation and a top-bar entity switch."],
  ["AI & OCR", "Document OCR and AI extraction of bills/receipts into structured entries."],
  ["Automation Rules", "No-code trigger-to-action rules: approvals, notifications and field updates over modules."],
  ["Iraq Localization", "IQD, CBI exchange rates, Kurdish RTL, Arabic/English and Iraqi compliance baked in."],
  ["Disaster Recovery", "Documented backup and restore runbooks with point-in-time Firestore recovery."],
  ["Observability & Ops", "Health checks, structured logging and an operations runbook for incidents and secrets."],
];
const PILLARS = ["claude", "models", "erp"];
const LABELS = { claude: "Claude Skill", models: "Model Face-off", erp: "ERPIQ Deep-dive" };

function dayIndex() {
  const now = new Date();
  const soy = Date.UTC(now.getUTCFullYear(), 0, 0);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - soy) / 86400000);
}
function pickFor(pillar) {
  const list = pillar === "claude" ? CLAUDE : pillar === "models" ? MODELS : ERP;
  return list[((dayIndex() % list.length) + list.length) % list.length];
}

// ---------- draft generation (Gemini) ------------------------------------
function draftPrompt(pillar, item) {
  const common = `You are a senior AI engineer writing ONE English LinkedIn post. No hype, no clichés, every line specific and accurate. The post is 110-170 words: a strong hook, 3-4 substantive lines, a closing question. Return STRICT JSON only: {"post":"...","hashtags":["#..",".."],"imagePrompt":"a vivid art-directed prompt for a premium professional infographic image that matches this post"}.`;
  if (pillar === "claude") return `${common}\nTOPIC: the Claude capability "${item[0]}". GROUNDING: ${item[1]}`;
  if (pillar === "erp") return `${common}\nTOPIC: the module "${item[0]}" of ERPIQ, an Iraq-first SMB ERP (FastAPI + Firestore + React). GROUNDING: ${item[1]} Write as the engineer who built it.`;
  return `${common}\nTOPIC: a balanced head-to-head of three models in "${item[0]}": ${item[1].join(", ")}, compared on ${item[2].join(", ")}. Be fair; note who wins for what. As of ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}; do not fabricate benchmark numbers.`;
}
async function genDraft(env, pillar) {
  const item = pickFor(pillar);
  const title = item[0];
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  let raw = "";
  for (const m of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: draftPrompt(pillar, item) }] }], generationConfig: { temperature: pillar === "models" ? 0.5 : 0.75, responseMimeType: "application/json" } }),
      });
      if (r.ok) { raw = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || ""; if (raw) break; }
    } catch { /* next model */ }
  }
  let obj = {};
  try { obj = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch { obj = {}; }
  const post = obj.post || `${title}: ${item[1] || ""}`;
  const tags = Array.isArray(obj.hashtags) ? obj.hashtags.slice(0, 6).join(" ") : "#AI";
  const caption = `${post}\n\n${tags}`.trim();
  const imagePrompt = obj.imagePrompt || `Premium professional LinkedIn infographic about ${title}, dark navy theme, clean modern typography, glassmorphism, charts, high detail, no watermark.`;
  return { title, caption, imagePrompt };
}
function draftMessage(pillar, n, d) {
  return `🟦 POST ${n}/3 · ${LABELS[pillar]}\n📌 ${d.title}\n\n↩️ Reply to THIS message with your image — I'll post it + the caption below to LinkedIn.\n\n🎨 IMAGE PROMPT (paste into any image generator):\n${d.imagePrompt}\n\n${CAPTION_MARK}\n${d.caption}`;
}
async function sendDrafts(env, chatId, threadId) {
  for (let i = 0; i < PILLARS.length; i++) {
    try { const d = await genDraft(env, PILLARS[i]); await sendTo(env, chatId, draftMessage(PILLARS[i], i + 1, d), threadId); }
    catch (e) { await sendTo(env, chatId, `⚠️ Draft ${i + 1} failed: ${e.message}`, threadId); }
  }
}

// ---------- LinkedIn image publish ---------------------------------------
function liHeaders(env, extra = {}) {
  return { Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`, "LinkedIn-Version": env.LINKEDIN_VERSION || "202506", "X-Restli-Protocol-Version": "2.0.0", ...extra };
}
const escCommentary = (t = "") => t.replace(/[\\(){}\[\]@|~<>]/g, (c) => "\\" + c);
async function publishToLinkedIn(env, bytes, text) {
  if (!env.LINKEDIN_ACCESS_TOKEN || !env.LINKEDIN_PERSON_URN) throw new Error("LinkedIn not connected (set LINKEDIN_ACCESS_TOKEN + LINKEDIN_PERSON_URN secrets).");
  const owner = env.LINKEDIN_PERSON_URN;
  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST", headers: liHeaders(env, { "Content-Type": "application/json" }), body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!init.ok) throw new Error(`init ${init.status}: ${(await init.text()).slice(0, 140)}`);
  const { uploadUrl, image } = (await init.json()).value;
  const up = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`, "Content-Type": "image/jpeg" }, body: bytes });
  if (!up.ok) throw new Error(`upload ${up.status}`);
  await new Promise((r) => setTimeout(r, 3000));
  const cp = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST", headers: liHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify({ author: owner, commentary: escCommentary(text), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, content: { media: { altText: "Infographic", id: image } }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }),
  });
  if (!cp.ok) throw new Error(`post ${cp.status}: ${(await cp.text()).slice(0, 160)}`);
  return cp.headers.get("x-restli-id") || "posted";
}
async function tgDownload(env, fileId) {
  const f = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`).then((r) => r.json());
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`;
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}
function captionFromReply(replyText) {
  if (!replyText) return null;
  const i = replyText.indexOf(CAPTION_MARK);
  if (i < 0) return null;
  return replyText.slice(i + CAPTION_MARK.length).trim() || null;
}

// Translate the English caption into Arabic + Kurdish Sorani (for the channel only).
async function translate(env, text) {
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `Translate this LinkedIn post into (1) Modern Standard Arabic and (2) Kurdish Sorani. Natural, professional, keep hashtags. Return STRICT JSON only: {"ar":"...","ckb":"..."}.\n\nPOST:\n${text}` }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });
  for (const m of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" }, body,
      });
      if (!r.ok) continue; // 429/5xx → try next model
      const raw = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const o = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (o.ar || o.ckb) return { ar: o.ar || "", ckb: o.ckb || "" };
    } catch { /* try next model */ }
  }
  return { ar: "", ckb: "" };
}

export default {
  async scheduled(event, env, ctx) {
    // Daily cron: send drafts to the Drafts topic if configured, else the DM.
    const chat = env.TELEGRAM_TOPIC_CHAT_ID || env.ALLOWED_CHAT_ID;
    const thread = env.TELEGRAM_TOPIC_CHAT_ID ? env.TELEGRAM_TOPIC_DRAFTS : null;
    if (chat) ctx.waitUntil(sendDrafts(env, chat, thread));
  },
  async fetch(request, env) {
    if (request.method === "GET") return new Response("AI bot is running ✅");
    if (env.WEBHOOK_SECRET && request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
    let update; try { update = await request.json(); } catch { return new Response("ok"); }
    if (update.callback_query) {
      const cb = update.callback_query;
      if (!chatAllowed(env, cb.message?.chat?.id)) { await answerCallback(env, cb.id); return new Response("ok"); }
      try { await handleCallback(env, cb); } catch (e) { await answerCallback(env, cb.id, "⚠️ " + e.message); }
      return new Response("ok");
    }
    const msg = update.message || update.edited_message;
    if (!msg) return new Response("ok");
    const chatId = msg.chat.id;
    if (!chatAllowed(env, chatId)) { await send(env, chatId, "🔒 This is a private bot."); return new Response("ok"); }
    try {
      if (msg.photo && msg.photo.length) await handlePhoto(env, chatId, msg);
      else if (msg.text) await handle(env, chatId, msg.text.trim(), msg.message_thread_id);
    } catch (e) { await send(env, chatId, "⚠️ " + e.message); }
    return new Response("ok");
  },
};

// Allow EITHER the private DM (ALLOWED_CHAT_ID) or the forum group (TELEGRAM_TOPIC_CHAT_ID).
function chatAllowed(env, chatId) {
  if (!chatId) return false;
  const s = String(chatId);
  const a = env.ALLOWED_CHAT_ID ? String(env.ALLOWED_CHAT_ID) : null;
  const g = env.TELEGRAM_TOPIC_CHAT_ID ? String(env.TELEGRAM_TOPIC_CHAT_ID) : null;
  if (!a && !g) return true;          // no restriction set
  return (a && s === a) || (g && s === g);
}

// When you reply to a draft / monitor post with a photo, ask WHERE to post (buttons).
// Works in the private DM AND inside any topic of the forum group — buttons stay
// in the same topic.
async function handlePhoto(env, chatId, msg) {
  const caption = captionFromReply(msg.reply_to_message && msg.reply_to_message.text);
  const threadId = msg.message_thread_id;
  if (!caption) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, ...(threadId ? { message_thread_id: threadId } : {}), text: "🖼️ Reply to a Drafts or Monitor post (the one with 'Reply to THIS message') with your image to publish." }),
    });
    return;
  }
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      ...(threadId ? { message_thread_id: threadId } : {}),
      reply_to_message_id: msg.message_id,
      text: `📤 Where should I post this?\n\n${CAPTION_MARK}\n${caption}`,
      reply_markup: { inline_keyboard: [
        [{ text: "✅ LinkedIn", callback_data: "post:li" }, { text: "📢 Channel", callback_data: "post:ch" }],
        [{ text: "🔁 Both", callback_data: "post:both" }, { text: "❌ Cancel", callback_data: "post:x" }],
      ] },
    }),
  });
}

// Mirror an image + caption to the public channel, with AR + CKB translations.
async function postToChannel(env, fileId, caption) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_GROUP_ID, photo: fileId, caption: caption.slice(0, 1024) }),
  });
  const tr = await translate(env, caption);
  const tmsg = [tr.ar ? `🇸🇦 العربية:\n${tr.ar}` : "", tr.ckb ? `🟢 کوردی (سۆرانی):\n${tr.ckb}` : ""].filter(Boolean).join("\n\n———\n\n");
  if (tmsg) await send(env, env.TELEGRAM_GROUP_ID, tmsg);
}

async function answerCallback(env, id, text) {
  try { await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id, text: text || "" }) }); } catch { /* ignore */ }
}
async function editText(env, chatId, messageId, text) {
  try { await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: String(text).slice(0, 4000) }) }); } catch { /* ignore */ }
}

// Handle a button tap: recover the image + caption from the reply chain, then post.
async function handleCallback(env, cb) {
  await answerCallback(env, cb.id);
  const data = cb.data || "";
  const chatId = cb.message?.chat?.id, msgId = cb.message?.message_id;
  if (!data.startsWith("post:")) return;
  const action = data.slice(5);
  if (action === "x") return editText(env, chatId, msgId, "❌ Cancelled.");
  // caption is carried in THIS message's text; the image is the message we replied to
  const caption = captionFromReply(cb.message && cb.message.text);
  const photoMsg = cb.message && cb.message.reply_to_message;
  if (!caption || !photoMsg?.photo) return editText(env, chatId, msgId, "⚠️ Couldn't recover the post — reply to a draft with your image again.");
  const fileId = photoMsg.photo[photoMsg.photo.length - 1].file_id;
  await editText(env, chatId, msgId, "⏳ Posting…");
  const out = [];
  if (action === "li" || action === "both") {
    try { const bytes = await tgDownload(env, fileId); const id = await publishToLinkedIn(env, bytes, caption); out.push(`✅ LinkedIn (${id})`); }
    catch (e) { out.push("❌ LinkedIn: " + e.message); }
  }
  if (action === "ch" || action === "both") {
    if (!env.TELEGRAM_GROUP_ID) out.push("❌ Channel: not configured");
    else { try { await postToChannel(env, fileId, caption); out.push("✅ Channel (EN/AR/CKB)"); } catch (e) { out.push("❌ Channel: " + e.message); } }
  }
  await editText(env, chatId, msgId, "📤 Done:\n" + out.join("\n"));
}

async function handle(env, chatId, text, threadId) {
  const lower = text.toLowerCase();
  const cmd = lower.replace(/^\//, "").split(/\s+/)[0];
  const arg = text.replace(/^\/?\S+\s*/, "").trim();
  if (cmd === "start" || cmd === "help") return send(env, chatId, HELP, true);
  if (cmd === "today" || cmd === "draft" || cmd === "posts" || lower.startsWith("درووست") || lower.startsWith("دروست")) {
    // If you ran this in the group, route drafts to the Drafts topic.
    const draftChat = env.TELEGRAM_TOPIC_CHAT_ID && String(chatId) === String(env.TELEGRAM_TOPIC_CHAT_ID) ? chatId : chatId;
    const draftThread = env.TELEGRAM_TOPIC_DRAFTS && String(chatId) === String(env.TELEGRAM_TOPIC_CHAT_ID) ? Number(env.TELEGRAM_TOPIC_DRAFTS) : threadId;
    await sendTo(env, chatId, "✍️ Writing today's 3 posts… (reply to each with your image to publish)", threadId);
    return sendDrafts(env, draftChat, draftThread);
  }
  // legacy video controls
  let topic = null;
  if (cmd === "video" || cmd === "ڤیدیۆ") topic = arg;
  else if (text.startsWith("ڤیدیۆ")) topic = text.replace(/^ڤیدیۆ\S*\s*/, "").trim();
  if (topic !== null && topic.length > 1) { const ok = await dispatch(env, { topic: topic.slice(0, 3000) }); return send(env, chatId, ok ? `🎬 Creating a video:\n"${topic.slice(0, 200)}"` : "⚠️ Couldn't start the job."); }
  if (cmd === "run") { const ok = await dispatch(env, {}); return send(env, chatId, ok ? "🎬 Creating today's videos now ⏳" : "⚠️ Couldn't start the job."); }
  if (cmd === "auto") { const ok = await setVar(env, "POST_MODE", "auto"); return send(env, chatId, ok ? "✅ Videos = auto" : "⚠️ Couldn't update."); }
  if (cmd === "approve") { const ok = await setVar(env, "POST_MODE", "approve"); return send(env, chatId, ok ? "✅ Videos = approve" : "⚠️ Couldn't update."); }
  if (cmd === "voice") { if (!arg) return send(env, chatId, "Usage: voice af_bella"); const ok = await setVar(env, "TTS_VOICE", arg.split(/\s+/)[0]); return send(env, chatId, ok ? `✅ Voice = ${arg.split(/\s+/)[0]}` : "⚠️"); }
  if (cmd === "count") { const n = parseInt(arg, 10); if (!n || n < 1 || n > 5) return send(env, chatId, "Usage: count 3"); const ok = await setVar(env, "VIDEOS_PER_RUN", String(n)); return send(env, chatId, ok ? `✅ Videos/run = ${n}` : "⚠️"); }
  if (cmd === "status") return send(env, chatId, await status(env));
  return send(env, chatId, await ai(env, text));
}

async function send(env, chatId, text, markdown) {
  try {
    const body = { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true };
    if (markdown) body.parse_mode = "Markdown";
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { /* ignore */ }
}
async function sendTo(env, chatId, text, threadId, markdown) {
  try {
    const body = { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true };
    if (threadId) body.message_thread_id = Number(threadId);
    if (markdown) body.parse_mode = "Markdown";
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { /* ignore */ }
}
async function ai(env, prompt) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: "You are a concise, friendly Telegram assistant. Reply in the user's language (including Kurdish Sorani). You can draft daily LinkedIn posts (say 'today') and publish a replied image to LinkedIn." }] }, contents: [{ parts: [{ text: prompt }] }] }),
    });
    return (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "🤔";
  } catch (e) { return "⚠️ " + e.message; }
}
function gh(env, method, path, body) {
  return fetch(`https://api.github.com${path}`, { method, headers: { Authorization: `Bearer ${env.GH_PAT}`, Accept: "application/vnd.github+json", "User-Agent": "tg-ai-bot", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
async function dispatch(env, inputs) { try { const r = await gh(env, "POST", `/repos/${env.GH_REPO}/actions/workflows/daily.yml/dispatches`, { ref: "main", inputs }); return r.status === 204 || r.ok; } catch { return false; } }
async function setVar(env, name, value) { try { let r = await gh(env, "PATCH", `/repos/${env.GH_REPO}/actions/variables/${name}`, { name, value }); if (r.status === 404) r = await gh(env, "POST", `/repos/${env.GH_REPO}/actions/variables`, { name, value }); return r.ok || r.status === 204 || r.status === 201; } catch { return false; } }
async function status(env) {
  try {
    const r = await gh(env, "GET", `/repos/${env.GH_REPO}/actions/runs?per_page=1`);
    if (!r.ok) return "⚠️ Couldn't fetch status.";
    const run = (await r.json()).workflow_runs?.[0];
    if (!run) return "No runs yet.";
    const icon = run.conclusion === "success" ? "✅" : run.conclusion ? "❌" : "🔄";
    return `${icon} Last run: ${run.status}${run.conclusion ? " / " + run.conclusion : ""}\n${run.html_url}`;
  } catch (e) { return "⚠️ " + e.message; }
}
