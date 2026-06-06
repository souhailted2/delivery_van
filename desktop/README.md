# ERP Van Sales — تطبيق Windows سطح المكتب

تطبيق **خفيف على الذاكرة والمعالج** — يشغّل سيرفر Express محلي ويفتح المتصفح تلقائياً.
لا يحتاج Chromium. لا يحتاج Electron.

## كيف يعمل

```
┌──────────────────────────────────────────────┐
│           جهاز Windows (بعد التثبيت)         │
│                                              │
│  C:\Program Files\ERP Van Sales\            │
│    node.exe         ← Node.js 20 runtime     │
│    standalone\server.js  ← نقطة الدخل       │
│    server\          ← Express routes          │
│    node_modules\    ← المكتبات               │
│    renderer\        ← الواجهة المبنية        │
│                                              │
│  %APPDATA%\ERP Van Sales\                   │
│    erp-van-sales.db ← قاعدة البيانات SQLite  │
│    .session-secret  ← مفتاح الجلسة          │
└──────────────────────┬───────────────────────┘
                        │ عند الاتصال بالإنترنت
                        ▼
              deleveri.alllal.com (مزامنة)
```

- يعمل 100% بدون إنترنت
- بيانات في `%APPDATA%\ERP Van Sales\` — سهل النسخ الاحتياطي
- يفتح المتصفح تلقائياً على `http://localhost:37891`
- للاستخدام الشبكي: افتح `http://[IP]:37891` من أي جهاز في الشبكة

---

## تنزيل التطبيق (الطريقة الأسرع)

1. اذهب إلى **[GitHub Releases](https://github.com/souhailted2/delivery_van/releases)**
2. حمّل `ERP-Van-Sales-Setup.exe` من أحدث إصدار
3. شغّله كمسؤول (Run as Administrator)
4. اتبع خطوات التثبيت
5. ستجد اختصار **ERP Van Sales** في قائمة Start وعلى سطح المكتب

---

## بيانات الدخول الافتراضية

| الحقل | القيمة |
|-------|--------|
| المستخدم | `admin` |
| كلمة السر | `admin123` |

> **مهم:** غيّر كلمة السر فور أول تشغيل!

---

## النسخ الاحتياطي

```
%APPDATA%\ERP Van Sales\
├── erp-van-sales.db     ← انسخ هذا الملف للنسخ الاحتياطي
└── .session-secret      ← لا حاجة لنسخه
```

**للنسخ الاحتياطي:** انسخ الملف `erp-van-sales.db` إلى مكان آمن (USB، سحابة، إلخ).

**للاستعادة:** ضع الملف المنسوخ مكان الأصلي ثم أعد تشغيل التطبيق.

---

## بناء ملف التثبيت يدوياً (للمطورين)

### عبر GitHub Actions (تلقائي)
كل `push` إلى الفرع `main` يبني ملف التثبيت تلقائياً وينشره في GitHub Releases.

### يدوياً على Windows

```cmd
:: من مجلد جذر المشروع
npm install -g pnpm
pnpm install

:: بناء الواجهة
pnpm --filter @workspace/erp-van-sales run build

:: نسخ الواجهة المبنية
xcopy /E /I /Y artifacts\erp-van-sales\dist\public\* desktop\renderer\

:: تثبيت مكتبات السيرفر (production فقط)
cd desktop
npm install --omit=dev

:: نسخ node.exe (تحتاج node.js مثبتاً)
copy "%ProgramFiles%\nodejs\node.exe" bundle\node.exe

:: بناء المثبّت (تحتاج NSIS مثبتاً من nsis.sourceforge.io)
mkdir dist-standalone
"C:\Program Files (x86)\NSIS\makensis.exe" standalone\installer.nsi
```

الناتج: `desktop\dist-standalone\ERP-Van-Sales-Setup.exe`

---

## تشغيل السيرفر مباشرة بدون تثبيت (للاختبار)

```cmd
cd desktop
npm install
node standalone\server.js
```

ثم افتح المتصفح على `http://localhost:37891`

---

## هيكل المشروع

```
desktop/
├── standalone/
│   ├── server.js         ← نقطة الدخل الرئيسية (بدون Electron)
│   ├── launcher.vbs      ← مشغّل Windows (يخفي نافذة CMD)
│   └── installer.nsi     ← سكريبت NSIS لبناء المثبّت
├── server/
│   ├── index.js          ← Express server setup
│   ├── db.js             ← SQLite schema + seeding
│   ├── config.js         ← مشاركة userDataPath
│   ├── sync-engine.js    ← مزامنة مع deleveri.alllal.com
│   └── routes/           ← مسارات API الكاملة
├── renderer/             ← الواجهة React المبنية (تُنسخ من dist)
├── bundle/               ← node.exe (يُنسخ في CI)
├── build/
│   ├── icon.ico          ← أيقونة Windows
│   └── icon.png
├── build-renderer.mjs    ← سكريبت بناء الواجهة
└── package.json
```
