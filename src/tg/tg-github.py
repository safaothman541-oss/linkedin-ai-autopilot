#!/usr/bin/env python3
# tg-github.py — post today's TRENDING GitHub projects to the projects section
# (topic 680), each with a DEEP Kurdish explanation summarised from the repo's
# README (what it is / what it's for / its benefits). Dedup so a repo isn't
# repeated. Env: TELEGRAM_BOT_TOKEN, ART_DEST/TELEGRAM_TOPIC_CHAT_ID, AI keys.
#   python tg-github.py [topic_id] [count]
import os, sys, json, re, time
import requests
import bs4

try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def _load_env():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
    if not os.path.exists(p):
        return                                              # cloud: rely on env vars / secrets
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()
BOT = os.environ["TELEGRAM_BOT_TOKEN"]
DEST = int(os.environ.get("ART_DEST") or os.environ.get("TELEGRAM_TOPIC_CHAT_ID") or "-1003915145933")
GEMINI = os.environ.get("GEMINI_API_KEY", "")
GROQ = os.environ.get("GROQ_API_KEY", "")
OPENROUTER = os.environ.get("OPENROUTER_API_KEY", "")
HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "github-state.json")
TOPIC = int(sys.argv[1]) if len(sys.argv) > 1 else 680
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 2
CHANNEL = os.environ.get("CHANNEL", "")                      # also broadcast to the public channel for growth

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
load_state = lambda: (json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {"seen": []})
save_state = lambda s: json.dump(s, open(STATE, "w", encoding="utf-8"))


def ai_text(prompt):
    if GEMINI:
        body = {"contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.4, "thinkingConfig": {"thinkingBudget": 0}}}
        for m in ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"]:
            try:
                r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent",
                                  headers={"x-goog-api-key": GEMINI}, json=body, timeout=45)
                if r.status_code == 200:
                    t = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    if t:
                        return t
            except Exception:
                pass
    for base, model, key in [("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", GROQ),
                             ("https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free", OPENROUTER)]:
        if not key:
            continue
        try:
            r = requests.post(f"{base}/chat/completions", headers={"Authorization": f"Bearer {key}"},
                              json={"model": model, "temperature": 0.4,
                                    "messages": [{"role": "user", "content": prompt}]}, timeout=45)
            if r.status_code == 200:
                t = r.json()["choices"][0]["message"]["content"].strip()
                if t:
                    return t
        except Exception:
            pass
    return None


def fetch_trending():
    r = requests.get("https://github.com/trending?since=daily",
                     headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}, timeout=40)
    if r.status_code != 200:
        return []
    soup = bs4.BeautifulSoup(r.text, "html.parser")
    out = []
    for art in soup.select("article.Box-row"):
        a = art.select_one("h2 a")
        if not a:
            continue
        full = re.sub(r"\s+", "", a.get_text()).strip("/")
        desc_el = art.select_one("p")
        desc = re.sub(r"\s+", " ", desc_el.get_text()).strip() if desc_el else ""
        lang_el = art.select_one('[itemprop="programmingLanguage"]')
        lang = lang_el.get_text(strip=True) if lang_el else ""
        stars_el = art.select_one('a[href$="/stargazers"]')
        stars = stars_el.get_text(strip=True) if stars_el else ""
        today_el = art.select_one("span.d-inline-block.float-sm-right")
        today = re.sub(r"\s+", " ", today_el.get_text()).strip() if today_el else ""
        out.append({"full": full, "desc": desc, "lang": lang, "stars": stars, "today": today})
    return out


def fetch_readme(full):
    try:
        r = requests.get(f"https://api.github.com/repos/{full}/readme",
                         headers={"User-Agent": UA, "Accept": "application/vnd.github.raw+json"}, timeout=30)
        if r.status_code == 200 and r.text:
            txt = re.sub(r"```.*?```", " ", r.text, flags=re.S)        # drop code blocks
            txt = re.sub(r"<[^>]+>", " ", txt)                          # drop html
            txt = re.sub(r"!?\[[^\]]*\]\([^)]*\)", " ", txt)            # drop images/links markup
            txt = re.sub(r"[ \t]+", " ", txt)
            return txt.strip()[:5000]
    except Exception:
        pass
    return ""


def summarize(full, readme, desc):
    src = readme or desc
    if not src:
        return None
    q = (f"ئەمە زانیاری پڕۆژەیەکی GitHubـە بەناوی «{full}». بەپێی ئەم دەقە، بە زمانی کوردی (سۆرانی) "
         "بە قووڵی و ڕوونی بۆ ئەندامان ڕوونی بکەوە. تەنها وەک JSON بگەڕێنەرەوە: "
         '{"what":"ئەمە چییە؟ (٢-٣ ڕستە)","use":"بۆ چی بەکاردێت / چی کارێک دەکات؟ (١-٢ ڕستە)",'
         '"benefit":"گرنگترین سوودەکانی (١-٢ ڕستە)"}. زمانەکە سادە و تێگەیشتوو بێت.\n\nدەقەکە:\n' + src)
    out = ai_text(q)
    if not out:
        return None
    try:
        o = json.loads(re.search(r"\{.*\}", re.sub(r"```json|```", "", out), re.S).group(0))
        if o.get("what"):
            return o
    except Exception:
        pass
    return None


def _post(chat, text, thread=None):
    data = {"chat_id": chat, "text": text[:4096], "parse_mode": "Markdown", "disable_web_page_preview": True}
    if thread:
        data["message_thread_id"] = thread
    for _ in range(4):
        res = requests.post(f"https://api.telegram.org/bot{BOT}/sendMessage", data=data, timeout=30).json()
        if res.get("ok"):
            return res
        ra = (res.get("parameters") or {}).get("retry_after")
        if ra:
            time.sleep(ra + 1); continue
        return res
    return res


def send(text):
    res = _post(DEST, text, TOPIC)
    if res.get("ok") and CHANNEL:
        _post(CHANNEL, text)                                    # broadcast to the public channel too
    return res


def main():
    repos = fetch_trending()
    if not repos:
        print("no trending fetched"); return
    state = load_state(); seen = set(state.get("seen", []))
    posted = 0
    for r in repos:
        if posted >= COUNT:
            break
        if r["full"] in seen or "/" not in r["full"]:
            continue
        readme = fetch_readme(r["full"])
        s = summarize(r["full"], readme, r["desc"])
        if not s:
            seen.add(r["full"]); continue                              # skip if we can't explain it
        owner, name = r["full"].split("/", 1)
        meta = "  ·  ".join(filter(None, [
            (f"⭐ {r['stars']}" if r["stars"] else ""),
            (f"💻 {r['lang']}" if r["lang"] else ""),
            (f"📈 {r['today']}" if r["today"] else ""),
        ]))
        text = (f"🚀 *{owner}/{name}*\n\n"
                f"📌 *ئەمە چییە؟*\n{s['what']}\n\n"
                + (f"🛠️ *بۆ چی بەکاردێت؟*\n{s['use']}\n\n" if s.get("use") else "")
                + (f"✨ *سوودەکانی:*\n{s['benefit']}\n\n" if s.get("benefit") else "")
                + (f"{meta}\n" if meta else "")
                + f"🔗 github.com/{r['full']}")
        res = send(text)
        if res.get("ok"):
            posted += 1; seen.add(r["full"])
            print(f"posted {r['full']} -> {posted}")
        else:
            print(f"send fail {r['full']}: {res}")
        time.sleep(2)
    state["seen"] = list(seen)[-500:]
    save_state(state)
    print(json.dumps({"topic": TOPIC, "posted": posted}))


main()
