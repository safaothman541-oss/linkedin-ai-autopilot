// telegram.js — send notifications and the finished video to you on Telegram.
import fs from "node:fs";
import path from "node:path";

const api = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

export async function sendMessage({ token, chatId, text }) {
  if (!token || !chatId) return;
  await fetch(api(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

export async function sendPhoto({ token, chatId, file, caption }) {
  if (!token || !chatId) return;
  try {
    const buf = fs.readFileSync(file);
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption.slice(0, 1024));
    form.append("photo", new Blob([buf], { type: "image/png" }), path.basename(file));
    const res = await fetch(api(token, "sendPhoto"), { method: "POST", body: form });
    if (!res.ok) {
      // photos must be <10MB / valid; fall back to sending as a document
      const form2 = new FormData();
      form2.append("chat_id", String(chatId));
      if (caption) form2.append("caption", caption.slice(0, 1024));
      form2.append("document", new Blob([buf], { type: "image/png" }), path.basename(file));
      const res2 = await fetch(api(token, "sendDocument"), { method: "POST", body: form2 });
      if (!res2.ok) await sendMessage({ token, chatId, text: caption || "Image ready (couldn't attach)." });
    }
  } catch (e) {
    await sendMessage({ token, chatId, text: `Image ready but Telegram upload failed: ${e.message}` });
  }
}

export async function sendVideo({ token, chatId, file, caption }) {
  if (!token || !chatId) return;
  try {
    const buf = fs.readFileSync(file);
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption.slice(0, 1024));
    form.append("video", new Blob([buf], { type: "video/mp4" }), path.basename(file));
    const res = await fetch(api(token, "sendVideo"), { method: "POST", body: form });
    if (!res.ok) {
      // fall back to sending as a document, then a plain caption
      const form2 = new FormData();
      form2.append("chat_id", String(chatId));
      if (caption) form2.append("caption", caption.slice(0, 1024));
      form2.append("document", new Blob([buf], { type: "video/mp4" }), path.basename(file));
      const res2 = await fetch(api(token, "sendDocument"), { method: "POST", body: form2 });
      if (!res2.ok) await sendMessage({ token, chatId, text: caption || "Video ready (couldn't attach)." });
    }
  } catch (e) {
    await sendMessage({ token, chatId, text: `Video ready but Telegram upload failed: ${e.message}` });
  }
}
