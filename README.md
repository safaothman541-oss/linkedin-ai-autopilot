# 🤖 LinkedIn AI Autopilot — ١٠٠٪ بەخۆڕایی

سیستەمێک کە **هەموو ڕۆژێک خۆکارانە** پۆستێکی LinkedIn + ڤیدیۆیەکی مۆشن گرافیک (HyperFrames) + دەنگ (Kokoro) + کاپشن دروست دەکات و بڵاودەکاتەوە — دەربارەی مۆدێل و فرەیمۆرکەکانی AI.

لەسەر **GitHub Actions** کاردەکات: بێ سێرڤەر، بێ کۆمپیوتەری داگیرساو، **خەرجی $0**.

---

## 🧠 چۆن کاردەکات

```
هەموو ڕۆژێک ٩:٠٠ (UTC)
   ↓
RSS (هەواڵی AI)  →  Gemini (دەق + سکریپت)  →  HyperFrames (ڤیدیۆ + دەنگ + کاپشن)
   ↓
Telegram (وەرگرتنی ڤیدیۆ)  →  LinkedIn (بڵاوکردنەوە)
```

---

## ✅ پێش دەستپێکردن — ٤ کلیل پێویستە

| کلیل | لەکوێ بیهێنیت |
|------|--------------|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | @BotFather (تۆکن) + @userinfobot (chat id) |
| `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_PERSON_URN` | بە سکریپتی خوارەوە دروست دەکرێن |
| (LinkedIn) `CLIENT_ID` + `CLIENT_SECRET` | لە ئەپی LinkedIn Developer-ـت |

---

## 🚀 هەنگاوەکانی دامەزراندن

### هەنگاو ١ — ڕیپۆ دروست بکە
1. بچۆ بۆ **github.com** ← هەژمارێک دروست بکە (ئەگەر نییە).
2. ڕیپۆیەکی نوێ دروست بکە (**Private**) ← ناوی `linkedin-ai-autopilot`.
3. هەموو فایلەکانی ئەم فۆڵدەرە بار بکە (دوگمەی **Add file → Upload files**)، یان بە git پاڵی بنێ.

### هەنگاو ٢ — تۆکنی LinkedIn بهێنە (یەکجار)
1. لە ئەپی LinkedIn ← تابی **Auth** ← لە **Authorized redirect URLs** ئەمە زیاد بکە:
   ```
   http://localhost:8000/callback
   ```
2. لەسەر کۆمپیوتەرەکەت (پێویستی بە **Node 22** هەیە)، لەناو فۆڵدەرەکە:
   ```bash
   npm install
   node tools/get-linkedin-token.js <CLIENT_ID> <CLIENT_SECRET>
   ```
3. لینکەکە بکەرەوە ← پەسەند بکە ← سکریپتەکە **ACCESS_TOKEN** و **PERSON_URN**ـت پێدەدات. کۆپیان بکە.

### هەنگاو ٣ — Secrets زیاد بکە
لە ڕیپۆکە: **Settings → Secrets and variables → Actions → New repository secret**. ئەمانە زیاد بکە:

```
GEMINI_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
LINKEDIN_ACCESS_TOKEN
LINKEDIN_PERSON_URN
```
ئارەزوومەندانە (بۆ نوێکردنەوەی خۆکاری تۆکن): `LINKEDIN_REFRESH_TOKEN`، `LINKEDIN_CLIENT_ID`، `LINKEDIN_CLIENT_SECRET`.

### هەنگاو ٤ — تاقی بکەرەوە و چالاکی بکە
1. تابی **Actions** ← ئەگەر پرسیاری کرد، Actions چالاک بکە.
2. **Daily LinkedIn AI Post** هەڵبژێرە ← **Run workflow** (دەستی).
3. چاوەڕێ بکە (~٣–٦ خولەک) ← دەبێت ڤیدیۆکە لە Telegram بۆت بێت، و پۆست لە LinkedIn دەرچێت.
4. ئەگەر باش بوو، هیچ مەکە — هەموو ڕۆژێک خۆکارانە کاردەکات. ✅

---

## ⚙️ ڕێکخستن (Variables — ئارەزوومەندانە)

لە **Settings → Secrets and variables → Actions → Variables**:

| ناو | بەها | کارەکەی |
|-----|------|---------|
| `POST_MODE` | `auto` / `approve` / `off` | `approve` = تەنها بۆ Telegram بنێرە (بەدەستی پۆست بکە) |
| `TTS_VOICE` | `af_heart`, `am_adam`, `bf_emma`… | دەنگی ڤیدیۆ |
| `BRAND_HANDLE` | `@yourname` | لە ژێری ڤیدیۆ پیشان دەدرێت |

**کاتی پۆست بگۆڕە:** لە `.github/workflows/daily.yml` هێڵی `cron: "0 9 * * *"` بگۆڕە (بە UTC).

**ستایلی ڤیدیۆ بگۆڕە:** لە `src/video.js` ڕەنگەکان (`BG_A`, `ACCENT`…) و فۆنت/قەبارە بگۆڕە.

**سەرچاوەی هەواڵ بگۆڕە:** لە `src/run.js` ئەرەیی `FEEDS` دەستکاری بکە.

---

## 🔐 ئاگاداری — سەلامەتی

- ئەو کلیلانەی پێشتر لە سکرینشۆت نیشانت دا، باشترە **دووبارە دروستیان بکەیتەوە** (Gemini, Telegram, LinkedIn secret) و تەنها لێرە لە Secrets دایان بنێ.
- هەرگیز فایلی `.env` یان کلیلەکان **مەخە ناو ڕیپۆ گشتی**. (`.gitignore` پاراستووە.)

## 🩺 چارەسەری کێشە

- **LinkedIn نەیپۆست کرد؟** لەوانەیە پێویست بە وەشانی نوێتری API بێت — لە Variables، `LINKEDIN_VERSION` دابنێ بۆ بەروارێکی نوێتر وەک `202507`. هەروەها دڵنیابە ئەپەکەت پرۆدەکتی «Share on LinkedIn»ـی هەیە.
- **تۆکنی LinkedIn بەسەرچوو (~٦٠ ڕۆژ)؟** سکریپتی هەنگاو ٢ دووبارە بکەرەوە و `LINKEDIN_ACCESS_TOKEN` نوێ بکەرەوە. (یان REFRESH_TOKEN دابنێ بۆ نوێکردنەوەی خۆکار.)
- **Telegram هیچ نەنارد؟** دڵنیابە یەکجار نامەیەکت بۆ بۆتەکەت ناردووە، و `TELEGRAM_CHAT_ID` ڕاستە.
- **ڕێندەر شکست هێنا؟** Actions خۆی Chrome + FFmpeg دادەمەزرێنێت؛ جارێکی تر Run بکە (هەندێک جار یەکەم جار کاتی داگرتنی مۆدێلەکان زیاترە).

---

## 📁 پێکهاتەی فایلەکان

```
linkedin-ai-autopilot/
├── .github/workflows/daily.yml   # کاتی ڕۆژانە + کارەکان
├── src/
│   ├── run.js          # ئۆرکێستراتەر
│   ├── gemini.js       # نووسینی ناوەڕۆک
│   ├── video.js        # HyperFrames: دەنگ + ڤیدیۆ + کاپشن
│   ├── linkedin.js     # بارکردن و بڵاوکردنەوەی ڤیدیۆ
│   └── telegram.js     # ئاگادارکردنەوە
├── tools/get-linkedin-token.js   # هێنانی تۆکن (یەکجار)
├── package.json
├── .env.example
└── README.md
```

خەرجی: **$0/مانگ** · ڤیدیۆ بە HyperFrames (Apache 2.0) · دەنگ Kokoro · کاپشن Whisper.
