# Haier PC Supervisor — Store Visit Web App

## Project Overview

A mobile-friendly web application for **PC Supervisors** to submit store visit checklists (ใบตรวจเยี่ยมสาขาประจำวัน) with photos, replacing the paper/Excel workflow. Built on **Cloudflare** (Pages + Workers + D1 + R2) with **GitHub** as the source of truth.

---

## Data Model — Dimension Store Analysis

### Source: `Dimension_Store.csv` (266 stores, 40 customers)

| Column | Description | Sample |
|--------|-------------|--------|
| Shop Name | ชื่อร้านค้า | บริษัท บี.ซี.แอร์ ซัพพลาย... |
| Shop Code | **Primary Key** | B000089004, TSP000365 |
| Store ID | Mostly "Not found" — **do not use** | Not found |
| Channel | All "DL" (Dealer) | DL |
| Area Sup | Supervisor area code | BKK, N1, N2, NE1, NE2, S, SIAMCHAI, WE1, WE2 |
| Customer Name | ลูกค้า | บริษัท ทวียนต์มาร์เก็ตติ้ง จำกัด... |
| Customer Code | FK to customer | B000088783, B000088450 |
| Sales Org | All "6560" | 6560 |
| REGION | ภูมิภาค | BKK Central, North, Northeast, South, West&East |
| Channel Lv1 | RT (Retail) / WS (Wholesale) | RT, WS |
| Channel Lv2 | กลุ่มช่องทาง | Direct Retail, Chain Retail, Distribution, AC Special Shop |

### Regional Distribution

```
North ........... 121 stores (45.5%)
BKK Central ..... 54 stores (20.3%)
South ........... 32 stores (12.0%)
West&East ....... 29 stores (10.9%)
Northeast ....... 28 stores (10.5%)
— (unassigned) ... 2 stores (0.8%)
```

### Channel Breakdown

- **RT (Retail):** 234 stores (88%)
  - Chain Retail: 136
  - Direct Retail: 98
- **WS (Wholesale):** 32 stores (12%)
  - Distribution: 30
  - AC Special Shop: 2

### Top Customers by Store Count

| Customer | Stores |
|----------|-------|
| บริษัท ทวียนต์มาร์เก็ตติ้ง จำกัด(สำนักงานใหญ่) | 53 |
| บริษัท สินธานีอีเล็คทรอนิกค์ จำกัด | 30 |
| บริษัท สยามชัย เซอร์วิส จำกัด | 29 |
| บริษัท วี.เอ็น.พี.วอซ์ท แอนด์ อีเล็คทริคจำกัด | 26 |
| บริษัท สตาร์ มันนี่ จำกัด (มหาชน) | 15 |
| บริษัท สหธานีมาร์เก็ตติ้ง จำกัด(สำนักงานใหญ่) | 8 |
| บริษัท นิยมพานิช จำกัด(สำนักงานใหญ่) | 8 |
| บริษัท ไอคิว ไพบูลย์ กรุ๊ป จำกัด | 7 |
| บริษัท เสรีอิเลคทริค จำกัด (สำนักงานใหญ่) | 6 |
| บริษัท ไทยเพิ่มพูลโฮมช็อป จำกัด(สำนักงานใหญ่) | 6 |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | HTML/CSS/JS (vanilla SPA) | Mobile-first form UI |
| Hosting | Cloudflare Pages | Static site hosting |
| Backend API | Cloudflare Worker | REST API |
| Database | Cloudflare D1 (SQLite) | Structured data |
| File Storage | Cloudflare R2 | Photo uploads |
| Version Control | GitHub | Source code, auto-deploy |

---

## App Features

### For PC Supervisors (field users)
- ✅ No login — just pick your name from a list
- ✅ Cascading **Customer Name → Shop Name** dropdowns (dimension data auto-fills)
- ✅ Full 6-section checklist form:
  1. ข้อมูลพนักงานภายในร้าน (Staff on floor — Haier + competitors)
  2. ข้อมูลยอดขาย (Sales data with auto %Ach.)
  3. พื้นที่โชว์สินค้า Haier (Schematic checks with conditional fields)
  4. ปัญหา / คู่แข่ง / การแก้ไข (Issues with multi-select)
  5. เข้าพบ GM / Section Manager (Meeting log)
  6. สรุปภาพรวมร้าน (Summary + trend)
- ✅ Photo upload with 6 tagged categories (camera/gallery)
- ✅ Client-side image compression (1600px max)
- ✅ My Submissions page with status badges
- ✅ Resubmit on rejection

### For Admin
- ✅ Password-protected dashboard
- ✅ Visit list with filters: status, date range, store, supervisor, region
- ✅ Detail view with full JSON form data
- ✅ Approve / Reject (reject requires a comment)
- ✅ Export filtered results to CSV
- ✅ Dashboard stats: total/pending/approved/rejected, per-store, per-supervisor, region breakdown
- ✅ Manage PC Supervisor list
- ✅ View store dimension data
- ✅ CSV re-import for refreshed `Dimension_Store.csv`

---

## Deployment

### GitHub → Cloudflare Pages (Frontend)
1. Push to GitHub
2. Connect Cloudflare Pages to the repo
3. Set `build output: frontend/dist`
4. Set env var: `API_BASE = <worker-url>`

### Cloudflare Worker (Backend)
1. Create D1 DB: `wrangler d1 create haier-store-visit-db`
2. Apply migration: `wrangler d1 migrations apply`
3. Seed data: `wrangler d1 execute --file=seed-data/seed-d1.sql`
4. Create R2 bucket: `wrangler r2 bucket create haier-store-visit-photos`
5. Set secret: `wrangler secret put ADMIN_PASSWORD`
6. Deploy: `wrangler deploy`

---

## Files Created

```
haier-store-visit-app/
├── README.md                              ← This file
├── frontend/
│   ├── package.json
│   └── dist/
│       ├── index.html                     ← SPA shell (29 KB)
│       ├── css/style.css                  ← Mobile-first CSS (12 KB)
│       └── js/app.js                      ← App logic (35 KB)
├── worker/
│   ├── package.json
│   ├── wrangler.toml                      ← Worker config
│   └── src/
│       ├── index.js                       ← Entry point
│       ├── router.js                      ← API router
│       ├── routes.js                      ← Public API handlers
│       ├── admin.js                       ← Admin API handlers
│       ├── auth.js                        ← Auth middleware
│       ├── cors.js                        ← CORS config
│       └── db.js                          ← D1 helpers
├── migrations/
│   └── 001_create_tables.sql              ← Schema (5 tables + indexes)
├── seed-data/
│   ├── package.json
│   ├── generate-seed.js                   ← CSV → SQL converter
│   └── seed-d1.sql                        ← 266 stores + 41 customers
└── data/
    └── Dimension_Store.csv                ← Source dimension data
```

---

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/supervisors` | List PC supervisors |
| GET | `/api/customers` | List customers (40) |
| GET | `/api/stores?customer_code=X` | List stores (266) |
| GET | `/api/store/:shopCode` | Single store detail |
| POST | `/api/visits` | Submit checklist |
| GET | `/api/visits/:id` | Visit detail |
| GET | `/api/my-visits?supervisor_id=X` | Supervisor's visits |
| POST | `/api/upload` | Upload photo (multipart) |

### Admin (requires X-Admin-Token header)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Get auth token |
| GET | `/api/admin/visits` | List all visits |
| GET | `/api/admin/visits/:id` | Visit detail |
| POST | `/api/admin/visits/:id/review` | Approve/reject |
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/export` | CSV export |
| POST | `/api/admin/supervisors` | Add supervisor |
| DELETE | `/api/admin/supervisors/:id` | Delete supervisor |
| POST | `/api/admin/stores` | Add/edit store |
| DELETE | `/api/admin/stores/:shopCode` | Delete store |
| POST | `/api/admin/import-csv` | CSV re-import |

---

## Branding

- **Haier blue:** `#004EA2`
- **Logo:** White wordmark on blue gradient header
- **Theme:** Applied to all buttons, headers, section titles, links, and accents