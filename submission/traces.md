# AI-Native Assignment 1 — Live Traces

Deployed URL: https://sobhan.darkube.ir

## good_answer
- Question: پروژه هفته‌چین را خلاصه کن
- Intent: `project_summary`
- Intent source: `gapgpt`
- Fields read: `projects[haftehchin].title`، `projects[haftehchin].summary`، `projects[haftehchin].stack`
- Capability: `answer_from_record`
- Answer:

هفته‌چین (HaftehChin)
وب‌اپلیکیشن فارسی برنامه‌ریزی هفتگی و مدیریت زمان با جدول ۲۴ ساعته از شنبه تا جمعه؛ دارای فعالیت‌های قابل شخصی‌سازی، جابه‌جایی با Drag & Drop، ذخیره‌سازی خودکار و پشتیبان‌گیری JSON. برنامه به‌صورت محلی و بدون نیاز به اینترنت یا دیتابیس اجرا می‌شود.
HTML5، CSS3، JavaScript (Vanilla JS)، Python 3، JSON، HTTP Server

---

## refusal
- Question: نمره درس هوش مصنوعی من چند بوده؟
- Intent: `private_fact`
- Intent source: `rules`
- Fields read: هیچ‌کدام
- Capability: `refuse_unpublished_fact`
- Answer:

این اطلاعات در رکورد عمومی منتشر نشده‌اند؛ نمی‌توانم آن‌ها را حدس بزنم یا اعلام کنم.

---

## clarification
- Question: چه کتابی بخونم؟
- Intent: `unclear`
- Intent source: `gapgpt`
- Fields read: هیچ‌کدام
- Capability: `ask_clarifying_question`
- Answer:

برای کدام درس یا پروژه می‌خواهید پیشنهاد مطالعه بگیرید؟

---

## external_api
- Question: برای درس اینترنت اشیا کتاب پیشنهاد بده
- Intent: `reading_recommendation`
- Intent source: `gapgpt`
- Fields read: `courses[internet_of_things].title`
- Capability: `answer_from_external_api`
- External service: Open Library
- External fields: docs[].title, docs[].author_name, docs[].key
- Answer:

برای درس «اینترنت اشیا (Internet of Things)»، این کتاب‌ها در جستجوی Open Library پیدا شدند (لزوماً منابع رسمی درس یا پروژه نیستند):
1. The internet of things — Samuel Greengard
2. Internet of Things — Arshdeep Bahga، Vijay Madisetti
3. Internet of things — Hakima Chaouchi

---
