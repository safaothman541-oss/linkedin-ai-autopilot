#!/usr/bin/env python3
# tg-ideas.py — post a couple of fresh, practical AI/build IDEAS (in Kurdish) to the
# ideas section (topic 679) to spark members. Generated via the 3-tier AI fallback
# (Gemini->Groq->OpenRouter), rotating domains by day so they stay varied, with a
# memory of past titles so they don't repeat.
#   python tg-ideas.py [topic_id] [count]
import os, sys, json, re, time
from datetime import datetime, timezone
import requests

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
STATE = os.path.join(HERE, "ideas-state.json")
TOPIC = int(sys.argv[1]) if len(sys.argv) > 1 else 679
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 2

DOMAINS = ["پەروەردە و فێربوون", "تەندروستی", "کشتوکاڵ", "بازرگانی و ستارتئەپ",
           "زمانی کوردی و کلتوور", "دارایی و پارە", "بەرهەمهێنان و کارایی",
           "تۆڕی کۆمەڵایەتی", "داهێنان و هونەر", "ژینگە", "گەشتیاری", "یاری و سەرگەرمی"]

load_state = lambda: (json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {"titles": []})
save_state = lambda s: json.dump(s, open(STATE, "w", encoding="utf-8"))


def ai_text(prompt):
    if GEMINI:
        body = {"contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.9, "thinkingConfig": {"thinkingBudget": 0}}}
        for m in ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"]:
            try:
                r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent",
                                  headers={"x-goog-api-key": GEMINI}, json=body, timeout=40)
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
                              json={"model": model, "temperature": 0.9,
                                    "messages": [{"role": "user", "content": prompt}]}, timeout=40)
            if r.status_code == 200:
                t = r.json()["choices"][0]["message"]["content"].strip()
                if t:
                    return t
        except Exception:
            pass
    return None


def make_ideas(domains, avoid):
    """Generate len(domains) DISTINCT ideas in ONE call (one per domain) so they
    never repeat within a run. Returns a list of {title,description,benefit,domain}."""
    doms = "، ".join(f"({i+1}) {d}" for i, d in enumerate(domains))
    q = (f"{len(domains)} بیرۆکەی جیاواز و نوێ و کارا بۆ پڕۆژە/ستارتئەپ بنووسە کە زیرەکی دەستکرد (AI) بەکاردەهێنن — "
         f"هەر بیرۆکەیەک لە یەکێک لەم بوارانە: {doms}. هەموویان دەبێت تەواو جیاواز بن لە یەکتر. "
         "بە زمانی کوردی (سۆرانی) بنووسە. تەنها وەک JSON array بگەڕێنەرەوە: "
         '[{"title":"ناوێکی کورت سەرنجڕاکێش","description":"٢-٣ ڕستە چۆن کاردەکات","benefit":"کێ سوودی لێدەبینێت","domain":"بوارەکە"}]. '
         "با ڕاستەقینە و جێبەجێکراو بن، نەک خەیاڵی. ")
    if avoid:
        q += "ئەم ناوانە دووبارە مەکەرەوە: " + "؛ ".join(avoid[-20:])
    out = ai_text(q)
    if not out:
        return []
    try:
        arr = json.loads(re.search(r"\[.*\]", re.sub(r"```json|```", "", out), re.S).group(0))
        return [o for o in arr if isinstance(o, dict) and o.get("title") and o.get("description")]
    except Exception:
        return []


def send(text):
    for _ in range(4):
        res = requests.post(f"https://api.telegram.org/bot{BOT}/sendMessage",
                            data={"chat_id": DEST, "message_thread_id": TOPIC, "text": text,
                                  "parse_mode": "Markdown", "disable_web_page_preview": True}, timeout=30).json()
        if res.get("ok"):
            return res
        ra = (res.get("parameters") or {}).get("retry_after")
        if ra:
            time.sleep(ra + 1); continue
        return res
    return res


def main():
    state = load_state(); titles = state.get("titles", [])
    doy = datetime.now(timezone.utc).timetuple().tm_yday
    domains = [DOMAINS[(doy + i) % len(DOMAINS)] for i in range(COUNT)]
    ideas = make_ideas(domains, titles)
    posted = 0
    for idea in ideas:
        if posted >= COUNT:
            break
        dom = idea.get("domain") or ""
        text = (f"💡 *بیرۆکەی ئەمڕۆ*" + (f" — {dom}" if dom else "") + "\n\n"
                f"*{idea['title']}*\n{idea['description']}\n"
                + (f"\n🎯 {idea['benefit']}" if idea.get("benefit") else ""))
        res = send(text)
        if res.get("ok"):
            posted += 1; titles.append(idea["title"])
            print(f"posted idea: {idea['title']}")
        else:
            print(f"send fail: {res}")
        time.sleep(2)
    state["titles"] = titles[-200:]
    save_state(state)
    print(json.dumps({"topic": TOPIC, "posted": posted}, ensure_ascii=False))


main()
