// get-linkedin-token.js — ONE-TIME helper to obtain your LinkedIn token + person URN.
// Run locally (you need Node 22 installed):
//   node tools/get-linkedin-token.js <CLIENT_ID> <CLIENT_SECRET>
// First, in your LinkedIn app -> Auth tab -> add this Authorized redirect URL:
//   http://localhost:8000/callback
import http from "node:http";

const CLIENT_ID = process.argv[2] || process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.argv[3] || process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT = "http://localhost:8000/callback";
const SCOPE = "openid profile w_member_social";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Usage: node tools/get-linkedin-token.js <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const authUrl =
  "https://www.linkedin.com/oauth/v2/authorization?response_type=code" +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&state=autopilot`;

console.log("\n1) Open this URL in your browser and approve:\n\n" + authUrl + "\n");

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost:8000");
  if (u.pathname !== "/callback") {
    res.writeHead(302, { Location: authUrl });
    return res.end();
  }
  const code = u.searchParams.get("code");
  if (!code) { res.end("No code received."); return; }

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) throw new Error(JSON.stringify(tok));

    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const me = await meRes.json();
    const personUrn = `urn:li:person:${me.sub}`;

    console.log("\n=========== COPY THESE INTO GITHUB SECRETS ===========\n");
    console.log("LINKEDIN_ACCESS_TOKEN =", tok.access_token);
    if (tok.refresh_token) console.log("LINKEDIN_REFRESH_TOKEN =", tok.refresh_token);
    console.log("LINKEDIN_PERSON_URN  =", personUrn);
    console.log("\n(access token valid ~60 days; refresh token ~365 days if provided)\n");
    console.log("======================================================\n");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>Done. Check your terminal for the values, then close this tab.</h2>");
  } catch (e) {
    res.end("Error: " + e.message);
    console.error(e);
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 1500);
  }
});

server.listen(8000, () => console.log("2) Waiting for the redirect on " + REDIRECT + " ...\n"));
