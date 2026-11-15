# دليل النشر (Deployment Guide)

## المتطلبات

- Node.js 20 أو أحدث
- Python 3.10 أو أحدث
- `ffmpeg` على الـ PATH (لتقسيم الصوت الكبير)
- حساب Groq مجاني + API key (للتفريغ السحابي)

## 1. متغيرات البيئة (Environment Variables)

انسخ `.env.example` لـ `.env` وعدّل القيم:

```bash
# ضروري — عنوان السيرفر العام (URL اللي الطالب هيفتحه)
PUBLIC_BASE_URL=https://madar.your-domain.com

# ضروري للنشر — اسمع أي origin (لأن المتصفح هييجي من domain مختلف)
ALLOW_ANY_ORIGIN=1

# ضروري — استمع على كل interfaces
HOST=0.0.0.0

# المنفذ (Render/Railway بتعطي PORT تلقائياً)
PORT=3000

# ضروري للتفريغ السحابي — مفتاح Groq من https://console.groq.com/keys
GROQ_API_KEY=gsk_your_key_here

# اختياري — موديل Whisper على Groq (الافتراضي: whisper-large-v3)
GROQ_WHISPER_MODEL=whisper-large-v3

# اختياري — مفتاح Gemini API (لو عايز Gemini كمان)
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

## 2. الإعداد المحلي (للتجربة قبل النشر)

```bash
# 1. تثبيت Python dependencies
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac
pip install pypdf faster-whisper

# 2. تثبيت Node dependencies (للتطوير بس)
npm install

# 3. شغّل السيرفر
ALLOW_ANY_ORIGIN=1 GROQ_API_KEY=gsk_your_key node server.js

# 4. افتح http://localhost:3000 في المتصفح
```

## 3. النشر على Render.com (مجاني، الأسهل)

### الخطوات:

1. **اعمل push للمشروع على GitHub** (مستودع خاص أو عام)

2. **على Render.com:**
   - New → Web Service
   - اختر مستودع GitHub
   - الإعدادات:
     - **Name**: `madar-lecture-companion`
     - **Environment**: `Node`
     - **Build Command**: `npm install && pip install -r requirements.txt`
     - **Start Command**: `node server.js`
     - **Plan**: Free (أو Starter لو عايز ما ينامش)

3. **Environment Variables** على Render:
   ```
   PUBLIC_BASE_URL=https://your-app.onrender.com
   ALLOW_ANY_ORIGIN=1
   HOST=0.0.0.0
   GROQ_API_KEY=gsk_your_key_here
   ```

4. **Create Web Service** — Render هيبني وينشر تلقائياً.

### ملاحظات Render:
- **الطبقة المجانية بتنام** بعد 15 دقيقة بدون نشاط. أول طلب هيستغرق ~30 ثانية للإيقاظ.
- **الـ disk space مجاني** 1GB بس — كافي للكود بس، مش لملفات الصوت الكبيرة.
- عشان كده الـ jobs بتمسح الـ temp files أوتوماتيك.

## 4. النشر على Railway.app (مجاني للبداية)

```bash
# ثبّت Railway CLI
npm install -g @railway/cli

# Login
railway login

# Init المشروع
railway init

# أضف المتغيرات
railway variables set PUBLIC_BASE_URL=https://your-app.up.railway.app
railway variables set ALLOW_ANY_ORIGIN=1
railway variables set HOST=0.0.0.0
railway variables set GROQ_API_KEY=gsk_your_key

# انشر
railway up
```

## 5. النشر على Vercel (للواجهة فقط، مش للسيرفر)

Vercel مش مناسب عشان:
- الـ server بيحتاج Python + ffmpeg
- jobs طويلة الأمد (minutes)
- Vercel بيمحدد مدة الـ function لـ 60 ثانية في الطبقة المجانية

## 6. إعداد Groq

1. **اعمل حساب على** https://console.groq.com
2. **API Keys** → Create API Key
3. **انسخ الـ key** (يبدأ بـ `gsk_`)
4. **ضعه في متغيرات البيئة**: `GROQ_API_KEY=gsk_...`

### حدود Groq المجانية:
- 7,200 ثانية صوت/ساعة (~2 ساعة)
- 28,800 ثانية/يوم (~8 ساعات)
- 25 ميجابايت لكل ملف (بنقسمهاتوماتيكياً لو أكبر)
- ~0.04$/ساعة للطبقة المدفوعة

## 7. كيف يعمل الـ Background Jobs (مهم للموبايل)

```
الموبايل: POST /api/transcribe (audio file)
       ← 202 Accepted + jobId (فوراً)
       
الموبايل: GET /api/jobs/{jobId} (كل 2 ثانية)
       ← { status: 'running', progress: 15, label: 'جارٍ التفريغ…' }
       
(لو الشاشة نامت، الـ poll الجاي هيكمل من حيث ما وقف)

الموبايل: GET /api/jobs/{jobId}
       ← { status: 'done', result: { segments: [...], language: 'ar' } }
```

**الميزة**: لو الموبايل فقد الاتصال أو الشاشة نامت، الـ job بيكمل على السيرفر، والموبايل بيكمل polling لما يصحى.

## 8. الحفظ على الموبايل

- **IndexedDB** بيشتغل على معظم المتصفحات
- **Safari iOS** بيمسح بعد 7 أيام إلا لو الطالب عمل "Add to Home Screen"
- الـ keys بتتحفظ مع الجلسة (per user request)

## 9. اختبار بعد النشر

```bash
# 1. Health check
curl https://your-app.onrender.com/api/health
# expected: {"ok":true,"host":"0.0.0.0","port":3000,"transcription":"groq"}

# 2. Providers list
curl https://your-app.onrender.com/api/providers

# 3. ابدأ transcribe job
echo -n "fake audio" | curl -X POST https://your-app.onrender.com/api/transcribe \
  -H "Content-Type: audio/wav" -H "x-file-name: test.wav" --data-binary @-
# expected: {"jobId":"...","status":"running"}

# 4. Poll على الـ job
curl https://your-app.onrender.com/api/jobs/{jobId}
```

## 10. مشاكل شائعة

### "EADDRINUSE: address already in use"
- في process تاني شغال على نفس الـ port
- `pkill -f "node server.js"` أو غيّر الـ PORT

### "python: can't open file 'transcribe_local.py'"
- لازم تكون شغّال السيرفر من جذر المشروع
- أو ضع الـ scripts في نفس المجلد

### "GROQ_API_KEY غير مضبوط"
- متغير البيئة مش متعرف على الـ host
- على Render/Railway: تأكد إنك أضفته في Environment Variables

### "تعذر الاتصال بـ Groq"
- راجع الـ API key
- راجع حدود الاستخدام (لو وصلت للحد اليومي)

### "ffmpeg not found"
- ثبّت ffmpeg على الـ host:
  - **Ubuntu/Debian**: `sudo apt install ffmpeg`
  - **Render/Railway**: بيكون متثبت افتراضياً
  - **Windows**: حمّل من https://ffmpeg.org

## 11. حدود معروفة

1. **الـ jobs في memory** — لو السيرفر أعاد التشغيل، الـ jobs النشطة بتضيع. للحل المستقبلي: استخدم Redis أو DB.
2. **حفظ الجلسات في المتصفح** — مش على السيرفر. لو الطالب مسح بيانات الموقع، الجلسات بتروح.
3. **حصة Groq اليومية** — 8 ساعات صوت/يوم لكل key. لو محتاج أكتر، استخدم multiple keys أو ادفع.

## 12. الخطوة التالية (اختياري)

لو حابة تحسّن الأداء:
- **Redis** للـ jobs queue بدل الـ in-memory
- **Supabase** للـ auth + DB لحفظ الجلسات
- **Cloudflare R2** لتخزين الملفات الكبيرة بدل tmp
