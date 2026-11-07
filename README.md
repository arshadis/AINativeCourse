# تمرین ۱ — پروفایل شخصی AI-Native با Context-aware Intent Routing

یک صفحه شخصی مبتنی بر `profile.json` برای پاسخ به سؤال درباره پروژه‌های ثبت‌شده، درس‌ها، مهارت‌ها، پیشنهاد مطالعه و تناسب شغلی. نسخه عمومی پروژه روی هم‌روش در نشانی https://sobhan.darkube.ir مستقر شده و در تست‌های انجام‌شده، اتصال GapGPT و Open Library پاسخ موفق داده‌اند. هر تغییر جدید، از جمله اصلاحیه اعتبارسنجی Schema، باید جداگانه Commit و Deploy شود.

## ساختار و Context

- **Policy context**: اجازه‌های `limits.published_fields` و `limits.allowed_actions`، تصمیم قطعی سرور است. سؤال درباره نمره، شماره تماس و عملیات ممنوع قبل از ارسال به مدل متوقف می‌شود.
- **Profile context**: `server/context.js` فقط شناسه و نام عمومی پروژه‌ها، درس‌ها و فهرست مهارت‌ها را برای طبقه‌بندی به GapGPT می‌فرستد؛ نه فایل کامل JSON یا اطلاعات خصوصی.
- **Conversation context**: مرورگر تنها `next_state` محدودِ سؤال روشن‌سازی را به درخواست بعدی می‌فرستد. سرور هر بار آن را اعتبارسنجی می‌کند؛ هیچ مکالمه دائمی ذخیره نمی‌شود.
- **External context**: اطلاعات واقعی کتاب از Open Library، فقط بعد از مشخص‌شدن درس/پروژه، دریافت می‌شود. شناسه و عبارت جستجو از فهرست کنترل‌شده در `server/external.js` انتخاب می‌شود.

`server/llm.js` برای GapGPT یک خروجی JSON می‌خواهد: `intent`, `subject`, `entity_id`, `focus`, `needs_clarification`. مدل فقط پرسش را **طبقه‌بندی** می‌کند؛ پاسخ نهایی را `server/resolve.js` از اطلاعات منتشرشده می‌سازد. خروجی مدل در `server/context.js` اعتبارسنجی می‌شود و اجازه دسترسی به فیلد منتشرنشده یا انجام کار ممنوع ندارد. در صورت خطای مدل، Ruleهای حداقلی فقط مسیر جایگزین‌اند.

## JSON Schema و اعتبارسنجی خودکار داده

- `profile.schema.json`: قرارداد نوع داده‌ها و ساختار مشخص رکورد، با اعلان JSON Schema Draft 2020-12.
- `profile.json`: رکورد تکمیل‌شده با چهار درس ثبت‌شده، یک پروژه مستند، مهارت‌های عمومی و سیاست انتشار.
- `scripts/schema-validator.mjs`: اعتبارسنج **بدون وابستگی npm** برای کلیدواژه‌هایی که در Schema فعلی استفاده می‌شوند: `type`، `required`، `properties`، `additionalProperties`، `items`، `minLength`، `minItems`، `uniqueItems`. کلیدواژه ناشناخته با خطا متوقف می‌شود تا هیچ محدودیتی به‌صورت ناخواسته نادیده گرفته نشود.
- `scripts/validate-profile.mjs`: رابط فرمان برای بررسی فایل رکورد در برابر قرارداد و نمایش مسیر دقیق خطاها.
- `tests/schema.test.js`: آزمون رکورد صحیح و نمونه‌های خراب؛ `npm test` قبل از سایر تست‌ها اعتبارسنجی پروفایل را اجرا می‌کند.

```powershell
npm run validate:profile
npm test
```

نتیجه مطلوب: `PASS: profile.json conforms ...` و موفقیت تمام تست‌ها. برای تست فایل دلخواه می‌توان از `node scripts/validate-profile.mjs PATH_TO_PROFILE PATH_TO_SCHEMA` استفاده کرد.

**دامنه اعتبارسنجی:** این اعتبارسنج کوچک برای محدودیت‌های مورد استفاده در Schema فعلی نوشته شده و یک پیاده‌سازی عمومی از **تمام** قابلیت‌های JSON Schema Draft 2020-12 نیست. اگر در آینده قواعد پیشرفته‌تری مثل `oneOf`، `$ref`، `pattern` یا `format` اضافه شود، باید از یک اعتبارسنج استاندارد کامل مانند Ajv استفاده شود یا پشتیبانی و تست مناسب به کد اضافه گردد. برای آزمون فعلی هیچ بسته خارجی نیاز نیست.

## اجرای محلی در PowerShell

نیازمندی: **Node.js 20+**؛ بسته npm خارجی لازم نیست. دستورها از ریشه پروژه:

```powershell
npm run validate:profile
npm test
$env:GAPGPT_MODEL = 'gpt-4o-mini'
$env:GAPGPT_BASE_URL = 'https://api.gapgpt.app/v1'
$secret = Read-Host 'GapGPT API Key' -AsSecureString
$env:GAPGPT_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password.Trim()
npm start
```

اگر Paste امن در ترمینال ویندوز درست عمل نکرد، کلید را در یک فایل متنی موقت **خارج از پوشه Git** قرار دهید، با `Get-Content -Raw` به متغیر محیطی انتقال دهید، و فایل را بعد از تست پاک کنید. کلید را هرگز داخل کد، `.env` قابل‌Commit، GitHub یا خروجی Trace قرار ندهید. استفاده از مدل انتخاب‌شده مستلزم دسترسی واقعی حساب GapGPT به آن است.

صفحه: `http://localhost:3000`؛ سلامت: `http://localhost:3000/health`.

## تست‌های دستی پیشنهادی

| سؤال | مسیر مورد انتظار |
|---|---|
| `What courses have you taken?` | `list_courses`؛ فقط اسامی ثبت‌شده، بدون ادعای قبولی |
| `What skills do you have?` | `list_skills`؛ از `skills[]` |
| `هفته‌چین چه قابلیت‌هایی دارد؟` | `project_details`، ترجیحاً فیلد `features` |
| `پروژه هفته‌چین را خلاصه کن` | `project_summary` از رکورد |
| `برای پروژه هفته‌چین کتاب پیشنهاد بده` | `reading_recommendation` با Open Library |
| `چه کتابی بخونم؟` و سپس `اینترنت اشیا` | سؤال روشن‌سازی و پاسخ کتاب با حفظ زمینه |
| `I have skill on python` | روشن‌سازی درباره منظور از جمله و صاحب مهارت |
| `آیا برای شغل React مناسبم؟` | قضاوت محدود به مهارت‌های مستند |
| `نمره درس من چنده؟` | امتناع، بدون فراخوانی GapGPT |
| `هوای تهران چطوره؟` | خارج از محدوده |

## عیب‌یابی Latency

Trace اطلاعات زیر را جداگانه ثبت می‌کند:

- `Intent source`: `gapgpt` برای پاسخ مدل، `rules_fallback` برای خطا، `rules` برای حالت بدون مدل/کنترل امنیتی.
- `Model status`: `ok`، `timeout`، `http_error`، `invalid_model_json`، `invalid_intent`، `network_error`، `skipped_policy` و ... .
- `Model HTTP status`: وضعیت HTTP مانند 200، 401 یا 429 (اگر پاسخ HTTP وجود داشته باشد).
- `GapGPT latency`، `External API latency` و `Total server latency` بر حسب میلی‌ثانیه.

خطای خام سرور مدل، درخواست کامل، کلید API یا محتوای خصوصی در پاسخ Trace قرار نمی‌گیرد. زمان پیش‌فرض پاسخ GapGPT برابر ۱۰ ثانیه است؛ فقط برای عیب‌یابی می‌توان `GAPGPT_TIMEOUT_MS` را تغییر داد. جستجوی کتاب Open Library تا ۶ ثانیه محدود شده است. اتصال زنده به سرویس‌ها با mock در تست‌ها جایگزین شده و باید با کلید خودتان روی لوکال بررسی شود.

## انتشار و تحویل

آدرس عمومی فعلی: **https://sobhan.darkube.ir**. مخزن پروژه: **https://github.com/arshadis/AINativeCourse**. فایل `Dockerfile` و پورت `3000` تغییر نمی‌کنند. هر اصلاحیه را بعد از `npm run validate:profile` و `npm test`، Commit و Push کرده و نتیجه Build/Deploy را در Hamravesh / Darkube بررسی کنید. کلید GapGPT فقط در **متغیرهای محیطی/Secret** هم‌روش نگه داشته شود؛ هرگز در Git قرار نگیرد. وجود آدرس عمومی جایگزین آزمایش واقعی بعد از هر Deploy نیست.

تست‌های عمومی بعد از استقرار:

```bash
npm run check:live -- https://sobhan.darkube.ir
```

گزارش `submission/traces.md` را از URL **عمومی** تولید کنید، نه URL لوکال. برای تحویل، سه Trace جواب درست، امتناع و سؤال روشن‌سازی به همراه لینک عمومی و Schema لازم است.

## محدودیت‌های داده

`profile.json` و `profile.schema.json` از نسخه اولیه بدون تغییر مانده‌اند. رکورد چهار **درس ثبت‌شده** دارد، اما وضعیت گذراندن/قبولی و نمره مشخص نیست؛ `courses[].topics` خالی است؛ `about.display_name` و `about.headline` نیز `null` هستند. هیچ‌یک نباید با حدس پر شود. پروفایل درباره دیگر افراد، اخبار، هواشناسی و موضوعات عمومی پاسخ نمی‌دهد.
