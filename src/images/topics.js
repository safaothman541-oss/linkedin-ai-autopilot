// topics.js — the rotation data for the 3 daily image pillars.
//   pillar "claude" → one Claude/Claude Code capability, deep-dived.
//   pillar "models" → a head-to-head of 3 models, rotating the line-up + axes.
//   pillar "erp"    → one module of the user's ERPIQ (Zoho ERP) system.
// A deterministic day index advances each list by one per UTC day, so the
// series never repeats until a list is exhausted.

// ---- deterministic day selector ---------------------------------------------
export function dayIndex(offset = 0) {
  const now = new Date();
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - startOfYear) / 86400000) + offset;
}

export function pick(list, offset = 0) {
  const i = ((dayIndex(offset) % list.length) + list.length) % list.length;
  return { ...list[i], _index: i, _total: list.length };
}

// ---- PILLAR 1: Claude / Claude Code capabilities ----------------------------
// Each item is a real, advanced capability. `brief` keeps the content model
// grounded; the model expands it into a deep, practitioner-level post.
export const CLAUDE_SKILLS = [
  { key: "agent-skills", title: "Agent Skills", brief: "Folders with a SKILL.md (name + description + instructions) that Claude loads on demand via progressive disclosure. Only the description sits in context until the skill is triggered, then the body and bundled files/scripts load. Portable across Claude Code, the API, and apps." },
  { key: "subagents", title: "Subagents", brief: "Spawn isolated agents (their own context window + tools) to fan out work in parallel, then return only the conclusion to the main thread. Keeps the orchestrator's context clean; ideal for broad searches, multi-file reviews, and independent tasks." },
  { key: "hooks", title: "Hooks", brief: "Shell commands the harness runs deterministically on events: PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart. Used for guardrails, auto-formatting, logging, and blocking unsafe calls — executed by the harness, not the model." },
  { key: "mcp", title: "Model Context Protocol (MCP)", brief: "An open standard that connects Claude to external tools and data through MCP servers (stdio or HTTP). One protocol exposes databases, SaaS APIs, and filesystems as typed tools the agent can call." },
  { key: "slash-commands", title: "Custom Slash Commands", brief: "Reusable prompts saved as Markdown in .claude/commands that become /commands. Support arguments, frontmatter, and can chain tools — turning a long workflow into one keystroke." },
  { key: "memory-tool", title: "The Memory Tool", brief: "A file-based memory the agent reads and writes across sessions. Facts persist as small Markdown files with an index, letting the agent recall user preferences, project constraints, and prior decisions without re-explaining." },
  { key: "plan-mode", title: "Plan Mode", brief: "A read-only mode where Claude investigates and proposes a step-by-step plan before touching anything. Nothing is edited until you approve — separating thinking from doing on risky changes." },
  { key: "prompt-caching", title: "Prompt Caching", brief: "Cache large, stable prefixes (system prompts, docs, tool defs) so repeat calls skip re-processing them. Cuts latency and cost dramatically on iterative agent loops; a 5-minute TTL keeps hot context warm." },
  { key: "extended-thinking", title: "Extended Thinking", brief: "A budgeted reasoning phase before the answer, with interleaved thinking between tool calls. More thinking tokens buy deeper multi-step reasoning on hard problems; the budget is tunable per request." },
  { key: "tool-use", title: "Tool Use (Function Calling)", brief: "Define typed tools via JSON Schema; Claude decides when to call them, you execute, and feed results back. The backbone of every agent — parallel tool calls and forced tool choice included." },
  { key: "batch-api", title: "Message Batches API", brief: "Submit large jobs asynchronously at ~50% off synchronous pricing, with results returned within 24h. Built for evals, bulk generation, and offline pipelines that don't need real-time latency." },
  { key: "files-api", title: "Files API", brief: "Upload documents once and reference them by ID across many requests — no re-uploading. Pairs with vision and PDF support for document-heavy workflows." },
  { key: "citations", title: "Citations", brief: "Claude grounds answers in your supplied documents and returns exact source spans. Reduces hallucination and makes RAG output auditable with sentence-level provenance." },
  { key: "computer-use", title: "Computer Use", brief: "Claude controls a screen via screenshots + mouse/keyboard actions, looping perceive→act. Automates GUIs that have no API — desktop apps, legacy tools, cross-app flows." },
  { key: "vision-pdf", title: "Vision & PDF Understanding", brief: "Native image and PDF input: charts, diagrams, screenshots, and multi-page documents are read directly, including layout and embedded visuals — no separate OCR step." },
  { key: "agent-sdk", title: "Claude Agent SDK", brief: "The same harness that powers Claude Code, as a library. Build custom agents with tools, subagents, hooks, MCP, and permission modes in TypeScript or Python." },
  { key: "structured-outputs", title: "Structured Outputs", brief: "Constrain responses to a JSON Schema so the model returns validated, parseable objects every time — no brittle string parsing in your pipeline." },
  { key: "checkpoints", title: "Checkpoints & Rewind", brief: "Claude Code snapshots the workspace as it edits, so you can rewind code + conversation to any earlier point. Encourages bold changes with a safety net." },
  { key: "output-styles", title: "Output Styles", brief: "Reusable response personas/formats that reshape how Claude writes for a project (terse, explanatory, review-focused) without rewriting the system prompt each time." },
  { key: "permissions", title: "Permissions & Settings", brief: "Allow/deny rules in settings.json govern which tools and commands run without a prompt. Tiered permission modes let you trade autonomy for control per project." },
];

// ---- PILLAR 2: model head-to-heads ------------------------------------------
// Each trio = a category, 3 named contenders, and the axes to compare on.
// The content model fills cells with figures it is confident are public, and
// marks anything uncertain with "—" (the card footer adds an "as of" note).
export const MODEL_TRIOS = [
  { key: "frontier-llm", category: "Frontier Reasoning LLMs", models: ["Claude Opus 4.x", "OpenAI GPT-5 class", "Google Gemini 2.5 Pro"], axes: ["Reasoning depth", "Coding (SWE-bench)", "Context window", "Multimodal", "Relative price"] },
  { key: "fast-llm", category: "Fast & Low-cost LLMs", models: ["Claude Haiku 4.5", "GPT-5 mini class", "Gemini 2.5 Flash"], axes: ["Latency", "Cost / 1M tokens", "Quality vs flagship", "Context window", "Tool use"] },
  { key: "open-weight", category: "Open-weight LLMs", models: ["Llama 3.x / 4", "Qwen 2.5/3", "DeepSeek V3/R1"], axes: ["License", "Params / MoE", "Reasoning", "Self-host cost", "Ecosystem"] },
  { key: "coding", category: "Coding Models", models: ["Claude Sonnet (coding)", "GPT-5 Codex class", "Qwen3-Coder / DeepSeek-Coder"], axes: ["Agentic coding", "Diff accuracy", "Long-context repo", "Tool calling", "Cost"] },
  { key: "image-gen", category: "Image Generation", models: ["Google Imagen / Nano-Banana", "OpenAI GPT Image", "FLUX / Midjourney"], axes: ["Photorealism", "Text-in-image", "Editing/inpaint", "Speed", "API access"] },
  { key: "text-to-video", category: "Text-to-Video", models: ["OpenAI Sora", "Google Veo", "Runway / Kling"], axes: ["Clip length", "Motion realism", "Prompt control", "Audio", "Availability"] },
  { key: "asr", category: "Speech-to-Text (ASR)", models: ["OpenAI Whisper", "Deepgram Nova", "AssemblyAI Universal"], axes: ["Accuracy (WER)", "Languages", "Real-time", "Diarization", "Cost"] },
  { key: "tts", category: "Text-to-Speech", models: ["ElevenLabs", "OpenAI TTS", "Kokoro (open)"], axes: ["Naturalness", "Voice cloning", "Latency", "Languages", "Price / self-host"] },
  { key: "embeddings", category: "Embedding Models", models: ["OpenAI text-embedding-3", "Voyage AI", "Cohere Embed / Gemini"], axes: ["Retrieval quality (MTEB)", "Dimensions", "Max input", "Multilingual", "Cost"] },
  { key: "vision-vlm", category: "Vision-Language Models", models: ["Claude (vision)", "GPT-4o/5 vision", "Gemini 2.5 (vision)"], axes: ["Document OCR", "Chart/diagram", "Grounding", "Video frames", "Cost"] },
];

// ---- PILLAR 3: ERPIQ modules (grounded in the user's repo) ------------------
// Briefs are drawn from the ERPIQ codebase/docs so posts stay factual.
export const ERP_TOPICS = [
  { key: "architecture", title: "ERPIQ Architecture", brief: "Iraq-first multi-tenant SMB ERP. Backend: Python/FastAPI + Firestore (281+ routes). Frontend: React 19 + TypeScript + Vite + Ant Design with Kurdish RTL + English LTR. Deployed on Cloud Run + Firebase via GitHub Actions. Single-tenant app unifying accounting, sales, inventory, POS, HR and platform ops." },
  { key: "accounting-gl", title: "Accounting & General Ledger", brief: "Double-entry GL with enforced journal-entry balancing (debit=credit tests), period locks to freeze closed months, and chart of accounts. Tier-4 'production_core' module — the financial backbone every other module posts into." },
  { key: "sales-ar", title: "Sales & Accounts Receivable", brief: "Quotes → Sales Orders → Invoices → Credit Notes, plus recurring invoices and customer statements. AR aging and payment matching feed the GL. Tier-4 launch-certified." },
  { key: "purchase-ap", title: "Purchasing & Accounts Payable", brief: "Purchase Orders, vendor Bills, and 3-way match (PO ↔ receipt ↔ bill) to block over-billing. AP drives cash-out planning and posts to the GL. Tier-4." },
  { key: "inventory", title: "Inventory Management", brief: "Multi-warehouse stock with lots/serials, transfers, and stock moves. Valuation flows to accounting; integrates with POS and purchasing. Tier-4 production module." },
  { key: "pos", title: "Point of Sale (POS)", brief: "Offline-first terminal using IndexedDB sync with idempotent replay so no sale is lost or double-counted on reconnect. Session management + cash control; restaurant extension adds KDS, menu manager, and table view." },
  { key: "rbac-audit", title: "Security: RBAC & Audit Trail", brief: "Role-based access control with a tamper-evident audit log built on a hash chain, field-level encryption for PII, and automated RBAC sweeps. Tier-4 — core to multi-tenant trust." },
  { key: "platform-console", title: "Platform / Super-Admin Console", brief: "Vendor-side console to manage tenant orgs, licenses, and support impersonation (audited). Runs the SaaS layer above individual tenants. Tier-4." },
  { key: "licensing", title: "Module Licensing & Access", brief: "Per-tenant module gates and bundle editor: features are switched on by plan, with onboarding that provisions the right modules. Tier-4 — how ERPIQ monetizes scope." },
  { key: "crm", title: "CRM Pipeline", brief: "Leads → Opportunities → Pipeline on a Kanban board, with CRM activities and conversion into sales orders. Tier-3 functional module feeding the sales lifecycle." },
  { key: "hr", title: "HR Management", brief: "Employees, contracts, attendance (face/PIN/manual), and time-off allocation + approval workflows. Tier-3, feeding payroll." },
  { key: "payroll-iraq", title: "Iraq Payroll", brief: "Auto-computed payslips with Iraq salary rules: income tax, social security, and withholding. Localized to IQD and Iraqi compliance. Tier-3." },
  { key: "banking", title: "Banking & Reconciliation", brief: "Bank statement import and reconciliation against GL entries, with matching rules. Closes the loop between recorded and actual cash. Tier-3." },
  { key: "taxes-iraq", title: "Tax Engine (Iraq)", brief: "VAT handling, corporate tax (15%), and withholding (3–5%), with tax returns and settings. Part of the Iraq localization layer. Tier-3." },
  { key: "manufacturing", title: "Manufacturing (MRP)", brief: "Bills of Materials, Manufacturing Orders, work orders, and routing; lightweight MRP scheduler. Turns raw inventory into finished goods with cost roll-up. Tier-3." },
  { key: "projects", title: "Projects & Timesheets", brief: "Tasks, Gantt planning, timesheets, and project profitability. Bridges services delivery with billing. Tier-3." },
  { key: "fixed-assets", title: "Fixed Assets", brief: "Asset register with scheduled depreciation runs posting to the GL. Tracks capex over its useful life. Tier-3." },
  { key: "subscriptions", title: "Subscriptions & Billing", brief: "Recurring plans with MRR reporting, a dunning queue for failed payments, and pause/cancel lifecycle. The SaaS-style revenue engine. Tier-3." },
  { key: "reports-analytics", title: "Reports & Embedded Analytics", brief: "Standard financial statements plus embedded analytics v1 at /reports/analytics, custom reports, and dashboards. Turns transactional data into decisions. Tier-3." },
  { key: "einvoice", title: "E-Invoicing (ITA)", brief: "Iraq Tax Authority e-invoice export with XSD-validated payloads and portal credentials (efakhata). Preview tier — regulatory compliance for B2B invoicing." },
  { key: "whatsapp", title: "WhatsApp Integration", brief: "Send invoices, statements, and notifications over the Meta WhatsApp Business API. Preview tier — meets customers on the channel they actually use in Iraq." },
  { key: "iraq-payments", title: "Iraq Payments (FIB / Zain Cash)", brief: "Local payment rails via FIB and Zain Cash merchant integrations, reconciling collections back to invoices. Preview tier." },
  { key: "multi-entity", title: "Multi-Entity Consolidation", brief: "Manage several legal entities with consolidation pages and a top-bar entity switch. Preview tier — for groups running multiple companies in one app." },
  { key: "ai-ocr", title: "AI & OCR", brief: "Document OCR and AI features (e.g., extracting bills/receipts into structured entries) powered by external ML. Preview tier — reduces manual data entry." },
  { key: "automation-rules", title: "Automation Rules", brief: "No-code trigger→action rules (approvals, notifications, field updates) layered over modules. Preview UI today, engine maturing. Where ERPIQ becomes programmable." },
  { key: "localization-iraq", title: "Iraq Localization", brief: "IQD currency, CBI exchange rates, Kurdish RTL UI, Arabic/English, and Iraqi tax/compliance baked in — the moat that makes ERPIQ 'Iraq-first' rather than a generic ERP." },
  { key: "disaster-recovery", title: "Disaster Recovery & Backups", brief: "Documented backup + restore runbooks, point-in-time recovery for Firestore, and an admin DR-restore path. Keeps tenant data safe and recoverable." },
  { key: "observability", title: "Observability & Ops", brief: "Health checks, structured logging, and an operations runbook for incidents and secrets. Cloud Run + Firebase keep the platform serverless and scalable." },
];

// pillar id → its rotation list
export const PILLARS = {
  claude: { list: CLAUDE_SKILLS, label: "Claude Skill" },
  models: { list: MODEL_TRIOS, label: "Model Face-off" },
  erp: { list: ERP_TOPICS, label: "ERPIQ Deep-dive" },
};
