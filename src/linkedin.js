// linkedin.js — refresh token, upload the MP4, and publish a video post.
// Uses the LinkedIn REST (versioned) API with the w_member_social scope.
import fs from "node:fs";

const REST = "https://api.linkedin.com/rest";
// LinkedIn requires a version header (YYYYMM). Override via env if LinkedIn asks for a newer one.
const VERSION = process.env.LINKEDIN_VERSION || "202506";

const headers = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  ...extra,
});

// Get a usable access token: prefer a stored one, else exchange a refresh token.
export async function getAccessToken({ accessToken, refreshToken, clientId, clientSecret }) {
  if (refreshToken && clientId && clientSecret) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.ok) return (await res.json()).access_token;
    // fall through to a stored access token if refresh fails
  }
  if (accessToken) return accessToken;
  throw new Error("No LinkedIn access token available (set LINKEDIN_ACCESS_TOKEN or a refresh token + client id/secret).");
}

export async function getPersonUrn({ token, personUrn }) {
  if (personUrn) return personUrn;
  const res = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`userinfo failed ${res.status}: ${await res.text()}`);
  const { sub } = await res.json();
  return `urn:li:person:${sub}`;
}

// LinkedIn commentary: escape reserved characters (hashtags with # are left intact).
function escapeCommentary(text = "") {
  return text.replace(/[\\(){}\[\]@|~<>]/g, (c) => "\\" + c);
}

async function initializeUpload(token, owner, fileSizeBytes) {
  const res = await fetch(`${REST}/videos?action=initializeUpload`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      initializeUploadRequest: { owner, fileSizeBytes, uploadCaptions: false, uploadThumbnail: false },
    }),
  });
  if (!res.ok) throw new Error(`initializeUpload ${res.status}: ${await res.text()}`);
  return (await res.json()).value;
}

async function uploadParts(instructions, buffer) {
  const partIds = [];
  for (const inst of instructions) {
    const part = buffer.subarray(inst.firstByte, inst.lastByte + 1);
    const up = await fetch(inst.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: part,
    });
    if (!up.ok) throw new Error(`upload part ${up.status}: ${await up.text()}`);
    const etag = up.headers.get("etag") || up.headers.get("ETag");
    partIds.push((etag || "").replaceAll('"', ""));
  }
  return partIds;
}

async function finalizeUpload(token, video, uploadToken, partIds) {
  const res = await fetch(`${REST}/videos?action=finalizeUpload`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      finalizeUploadRequest: { video, uploadToken: uploadToken || "", uploadedPartIds: partIds },
    }),
  });
  if (!res.ok) throw new Error(`finalizeUpload ${res.status}: ${await res.text()}`);
}

async function createPost(token, author, videoUrn, text, title) {
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      author,
      commentary: escapeCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { title: title.slice(0, 100), id: videoUrn } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) throw new Error(`createPost ${res.status}: ${await res.text()}`);
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "posted";
}

// Full flow: returns the post id (or throws).
export async function postVideoToLinkedIn({ token, personUrn, file, text, title }) {
  const buffer = fs.readFileSync(file);
  const init = await initializeUpload(token, personUrn, buffer.length);
  const partIds = await uploadParts(init.uploadInstructions, buffer);
  await finalizeUpload(token, init.video, init.uploadToken, partIds);
  // small settle delay so LinkedIn finishes processing the video
  await new Promise((r) => setTimeout(r, 8000));
  return createPost(token, personUrn, init.video, text, title);
}

// ---- Image posts ------------------------------------------------------------
// Single-image upload is simpler than video: initialize → PUT the bytes → post.
async function initializeImageUpload(token, owner) {
  const res = await fetch(`${REST}/images?action=initializeUpload`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!res.ok) throw new Error(`image initializeUpload ${res.status}: ${await res.text()}`);
  return (await res.json()).value; // { uploadUrl, image }
}

async function uploadImageBinary(uploadUrl, token, buffer) {
  const up = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" },
    body: buffer,
  });
  if (!up.ok) throw new Error(`image upload ${up.status}: ${await up.text()}`);
}

async function createImagePost(token, author, imageUrn, text, altText) {
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      author,
      commentary: escapeCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { altText: (altText || "").slice(0, 300), id: imageUrn } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) throw new Error(`createPost (image) ${res.status}: ${await res.text()}`);
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "posted";
}

// Full flow for a single-image post: returns the post id (or throws).
export async function postImageToLinkedIn({ token, personUrn, file, text, altText }) {
  const buffer = fs.readFileSync(file);
  const init = await initializeImageUpload(token, personUrn);
  await uploadImageBinary(init.uploadUrl, token, buffer);
  // brief settle so the asset is registered before we reference it in a post
  await new Promise((r) => setTimeout(r, 3000));
  return createImagePost(token, personUrn, init.image, text, altText);
}
