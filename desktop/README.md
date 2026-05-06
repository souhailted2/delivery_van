# ERP Van Sales — تطبيق Windows سطح المكتب

تطبيق Electron كامل يعمل بدون إنترنت مع دعم المزامنة مع السيرفر الرئيسي.

## كيف يعمل

```
┌──────────────────────────────────────┐
│         جهاز Windows                │
│                                      │
│  ┌─────────────┐   ┌──────────────┐ │
│  │  واجهة React│←→│ Express محلي │ │
│  └─────────────┘   └──────┬───────┘ │
│                            │          │
│                    ┌───────▼───────┐  │
│                    │  SQLite محلي  │  │
│                    └───────────────┘  │
└──────────────────────┬────────────────┘
                        │ عند الإنترنت
                        ▼
              deleveri.alllal.com
```

- يعمل 100% بدون إنترنت
- صور المنتجات تُحفظ محلياً في AppData
- زر "مزامنة" يرفع البيانات للسيرفر عند الاتصال

---

## بيانات الدخول الافتراضية

- **المستخدم:** `admin`
- **كلمة السر:** `admin123`

> غيّر كلمة السر فور أول تشغيل!

---

## مكان حفظ البيانات

| النوع | المسار |
|-------|--------|
| قاعدة البيانات | `%APPDATA%\ERP Van Sales\erp-van-sales.db` |
| صور المنتجات | `%APPDATA%\ERP Van Sales\uploads\` |

---

## ملاحظة: بناء .exe يتطلب Windows

> ملف NSIS `.exe` **لا يمكن بناؤه على Linux أو Replit**.
> بديل للاختبار على Replit/Linux:
> ```bash
> cd desktop && npm install --ignore-scripts && npx electron-builder --dir
> ```
> ينتج مجلداً غير محزوم في `dist-installer/linux-unpacked/` (للتحقق من البنية فقط).
> للملف `.exe` الحقيقي: اتبع تعليمات Windows أدناه، أو أنشئ GitHub Actions Workflow.

---

## بناء ملف التثبيت (.exe) على Windows

### المتطلبات

1. **Node.js 18+** — https://nodejs.org/en/download
2. **pnpm** — `npm install -g pnpm`
3. **Python 3** — https://www.python.org/downloads/
4. **Visual Studio Build Tools** — https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
   - اختر: "Desktop development with C++"

### خطوات البناء الكاملة (من الصفر)

```cmd
:: من مجلد جذر المشروع
pnpm install

:: الدخول إلى مجلد الديسكتوب
cd desktop
npm install

:: بناء الواجهة
node build-renderer.mjs

:: بناء ملف الإعداد
npm run dist
```

الناتج: `desktop\dist-installer\ERP Van Sales Setup 1.0.0.exe`

### طريقة أسرع (الـ renderer مبني مسبقاً)

مجلد `renderer/` يحتوي على الواجهة الجاهزة. يكفيك:

```cmd
cd desktop
npm install
npm run dist
```

---

## تثبيت التطبيق على أجهزة العملاء

1. انسخ `ERP Van Sales Setup 1.0.0.exe` للعميل
2. شغّله كمسؤول (Run as Administrator)
3. اتبع خطوات التثبيت
4. يظهر في قائمة البرامج وعلى سطح المكتب

---

## تشغيل في وضع التطوير

```cmd
cd desktop
npm install
npm start
```

---

## المزامنة مع السيرفر الرئيسي

زر "مزامنة" في التطبيق يرسل إلى `deleveri.alllal.com`:
- الفئات → المنتجات → الموردين → العملاء → الشاحنات → الفواتير → المرتجعات

الترتيب صحيح ومضمون. السجلات المزامَنة مسبقاً تُتخطى (idempotent).

---

## هيكل المشروع

```
desktop/
├── main.js              ← Electron main process
├── preload.js           ← IPC bridge
├── build-renderer.mjs   ← سكريبت بناء الواجهة
├── package.json         ← إعدادات + electron-builder
├── build/
│   ├── icon.ico         ← أيقونة Windows
│   └── icon.png
├── renderer/            ← واجهة React مبنية
└── server/
    ├── index.js         ← Express server
    ├── db.js            ← SQLite schema + seeding
    ├── config.js        ← مشاركة userDataPath
    └── routes/
        ├── auth.js
        ├── products.js  ← يشمل رفع الصور محلياً
        ├── categories.js
        ├── clients.js
        ├── invoices.js
        ├── returns.js
        ├── trucks.js
        ├── stock.js
        ├── suppliers.js
        ├── purchases.js
        ├── cash.js
        ├── users.js
        ├── reports.js
        └── sync.js      ← مزامنة مع deleveri.alllal.com
```
