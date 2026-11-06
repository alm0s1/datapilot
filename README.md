# DataPilot · داتا بايلوت

> منصة ذكاء أعمال تربط قواعد بياناتك، وتحوّل سؤالك بالعربية أو الإنجليزية إلى SQL، وتبني لك لوحات المعلومات.
>
> A business-intelligence platform: connect your databases, ask in plain language, get SQL, charts, and shareable dashboards.

**🔗 العرض الحي · Live demo: [ufuq.fyi](https://ufuq.fyi)** — مستضاف ذاتيًا وقد يكون متوقفًا أحيانًا · self-hosted, may be offline at times

`FastAPI` · `Next.js 15` · `React 19` · `PostgreSQL` · `Redis` · `Celery` · `Docker Compose` · `OpenAI / Ollama`

---

## 🇸🇦 بالعربية

### المشكلة

المحلل ينتقل بين أدوات كثيرة للاستعلام والرسم والمشاركة، وغير التقني لا يستطيع استخراج بياناته بدون SQL، والفرق تعمل على أكثر من محرك قواعد بيانات في الوقت نفسه. أدوات مثل Tableau وPower BI تحلّ جزءًا من هذا لكنها مكلفة.

### ما يقدّمه النظام

- **اتصال بعدة قواعد بيانات** عبر نمط المحوّلات (Adapter): PostgreSQL وMySQL وSQLite وغيرها، وإضافة محرك جديد تعني كتابة محوّل واحد.
- **من السؤال إلى SQL (NL2SQL):** يقرأ بنية قاعدة البيانات ويكتب الاستعلام، ويدعم OpenAI أو نموذجًا محليًا عبر Ollama للتشغيل المغلق.
- **رفع ملفات CSV/XLSX:** تحليل إحصائي للأعمدة، واقتراحات تنظيف، وتخزين الملف كأنه قاعدة بيانات قابلة للاستعلام.
- **منشئ مخططات ولوحات معلومات** بتخطيط سحب وإفلات، ومشاركة عامة برابط.
- **تعاون:** مجموعات استعلامات، تعليقات، سجل إصدارات، وصلاحيات على مستوى المورد (مالك / محرر / مشاهد).
- **تنبيهات** مجدولة على شروط في البيانات.

### الأمان

| القرار | التنفيذ |
|---|---|
| بيانات اتصال قواعد البيانات | مشفّرة بـ Fernet قبل التخزين |
| الدخول | JWT (وصول + تحديث) وOAuth 2.0 مع حماية CSRF بحالة موقّعة |
| كلمات المرور | bcrypt |
| الصلاحيات | أدوار ومشاركة على مستوى المورد |

### المعمارية

```
Next.js ──HTTP──▶ FastAPI ──▶ PostgreSQL (بيانات التطبيق)
                    │──────▶ Redis (تخزين مؤقت + طابور Celery)
                    │──────▶ قواعد بيانات المستخدم الخارجية
                  Celery workers (مهام الخلفية)
```

### التشغيل محليًا

```bash
git clone https://github.com/alm0s1/datapilot && cd datapilot
# أنشئ backend/.env بالمتغيرات الموجودة في .env.prod.example (SECRET_KEY, JWT_SECRET_KEY, DB_ENCRYPTION_KEY ...)
echo 'CLOUDFLARE_TUNNEL_TOKEN=' > .env   # اختياري، للنشر عبر النفق فقط
docker compose up -d
```

الواجهة على `http://localhost:3000` والـAPI على `http://localhost:8000/docs`.

---

## 🇬🇧 In English

### The problem

Analysts hop between tools to query, chart and share. Non-technical teammates can't get their own data without SQL. Teams run several database engines at once. Commercial BI tools solve part of this, at a price.

### What it does

- **Multi-database connectivity** through an adapter pattern — PostgreSQL, MySQL, SQLite and more; adding an engine means writing one adapter.
- **Natural language to SQL (NL2SQL):** reads the schema and writes the query. Works with OpenAI or a local Ollama model for fully offline deployments.
- **CSV/XLSX upload:** column profiling, cleaning suggestions, and storage as a queryable virtual database.
- **Chart builder and dashboards** with drag-and-drop layout and public share links.
- **Collaboration:** query collections, comments, version history, and resource-level permissions (owner / editor / viewer).
- **Scheduled alerts** on data conditions.

### Security

| Decision | Implementation |
|---|---|
| Stored DB credentials | Encrypted with Fernet before storage |
| Auth | JWT (access + refresh) and OAuth 2.0 with signed-state CSRF protection |
| Passwords | bcrypt |
| Authorization | Roles plus resource-level sharing |

### Architecture

```
Next.js ──HTTP──▶ FastAPI ──▶ PostgreSQL (app data)
                    │──────▶ Redis (cache + Celery broker)
                    │──────▶ user's external databases
                  Celery workers (background jobs)
```

### Run locally

```bash
git clone https://github.com/alm0s1/datapilot && cd datapilot
# create backend/.env with the variables listed in .env.prod.example (SECRET_KEY, JWT_SECRET_KEY, DB_ENCRYPTION_KEY ...)
echo 'CLOUDFLARE_TUNNEL_TOKEN=' > .env   # optional, tunnel deployment only
docker compose up -d
```

UI at `http://localhost:3000`, API docs at `http://localhost:8000/docs`.

---

**Salim Hamdan Alhajri** · [GitHub](https://github.com/alm0s1) · [LinkedIn](https://www.linkedin.com/in/salimalhajri)
