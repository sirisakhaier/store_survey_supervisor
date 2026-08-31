# Haier PC Supervisor — Store Visit Checklist Web App

> **Mobile-first web app** — replaces the paper/Excel "PC Supervisor – Store Visit Checklist" (ใบตรวจเยี่ยมสาขาประจำวัน).

## Architecture

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  Cloudflare Pages    │────▶│  Cloudflare Worker    │────▶│  Cloudflare   │
│  (Frontend: HTML/CSS)│     │  (Backend API)        │     │  D1 Database  │
│                      │     │                      │     │              │
│  dist/index.html     │     │  src/index.js         │     │  visits      │
│  dist/css/style.css  │     │  src/router.js        │     │  stores      │
│  dist/js/app.js      │     │  src/routes.js        │     │  customers   │
│                      │     │  src/admin.js         │     │  supervisors │
│                      │     │  src/auth.js          │     │  visit_photos│
│                      │     │  src/cors.js          │     │              │
│                      │     │  src/db.js            │     └──────────────┘
│                      │     │                       │            │
│                      │     │                       │     ┌──────┴──────┐
│                      │     │                       │     │  Cloudflare  │
│                      │     │                       │     │  R2 (Photos) │
│                      │     └───────────────────────┘     └─────────────┘
└──────────────────────┘
```

## Project Structure

```
haier-store-visit-app/
├── README.md
├── frontend/                    # Cloudflare Pages
│   ├── package.json
│   └── dist/
│       ├── index.html           # Single-page app
│       ├── css/style.css        # Mobile-first CSS
│       └── js/app.js            # App logic (SPA)
├── worker/                      # Cloudflare Worker
│   ├── package.json
│   ├── wrangler.toml
│   └── src/
│       ├── index.js             # Entry point
│       ├── router.js            # Request router
│       ├── routes.js            # Public API handlers
│       ├── admin.js             # Admin API handlers
│       ├── auth.js              # Admin auth
│       ├── cors.js              # CORS helpers
│       └── db.js                # D1 query helpers
├── migrations/
│   └── 001_create_tables.sql    # D1 schema
├── seed-data/
│   ├── package.json
│   ├── generate-seed.js         # CSV → SQL generator
│   └── seed-d1.sql              # Generated seed SQL
└── data/
    └── Dimension_Store.csv      # 266 stores, 40 customers
```

## Setup & Deployment (Step-by-Step)

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- [Git](https://git-scm.com/)
- Cloudflare account (with D1, R2, Pages enabled)
- GitHub account

### 1. Clone & Initialize

```bash
# Clone this repo
git clone <your-repo-url> haier-store-visit
cd haier-store-visit

# Install dependencies
cd worker && npm install && cd ..
cd seed-data && npm install && cd ..
```

### 2. Create Cloudflare D1 Database

```bash
cd worker

# Create the D1 database
wrangler d1 create haier-store-visit-db

# 👆 Copy the database_id from the output, then edit wrangler.toml:
# [[d1_databases]]
# binding = "DB"
# database_name = "haier-store-visit-db"
# database_id = "<paste-your-id>"
```

### 3. Apply Database Schema

```bash
# Apply the migration
wrangler d1 migrations apply haier-store-visit-db --remote

# Verify (optional)
wrangler d1 execute haier-store-visit-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

### 4. Seed Dimension Data

```bash
# Generate seed SQL from CSV
cd ../seed-data
npm run generate

# Apply to D1
cd ../worker
wrangler d1 execute haier-store-visit-db --remote --file=../seed-data/seed-d1.sql

# Verify
wrangler d1 execute haier-store-visit-db --remote --command="SELECT COUNT(*) as stores FROM stores; SELECT COUNT(*) as customers FROM customers;"
```

Expected: 266 stores, 41 customers.

### 5. Create R2 Bucket for Photos

```bash
wrangler r2 bucket create haier-store-visit-photos
```

### 6. Set Admin Password Secret

```bash
wrangler secret put ADMIN_PASSWORD
# Enter a secure password when prompted
```

### 7. Deploy the Worker

```bash
wrangler deploy
```

Note the Worker URL (e.g., `https://haier-store-visit-api.<your-subdomain>.workers.dev`).

### 8. Connect GitHub → Cloudflare Pages (Frontend)

1. Push this repo to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<your-username>/haier-store-visit.git
   git push -u origin main
   ```

2. In Cloudflare Dashboard:
   - Go to **Workers & Pages** → **Pages** → **Connect to Git**
   - Select your GitHub repo
   - **Build settings:**
     - Framework preset: **None**
     - Build command: *(leave empty)*
     - Build output directory: `frontend/dist`
   - **Environment variables (advanced):**
     - `API_BASE`: `https://haier-store-visit-api.<your-subdomain>.workers.dev`
   - Click **Save and Deploy**

3. Every push to `main` auto-deploys the frontend.

### 9. Verify

Open the Pages URL in a browser. You should see the Haier-branded landing page with:
- PC Supervisor dropdown
- Customer Name → Shop Name cascading dropdowns
- Start Visit button

## D1 Schema Overview

```sql
customers       — 40 rows from Dimension_Store.csv
stores          — 266 rows, keyed on Shop Code
supervisors     — PC Supervisor names (manageable via admin)
visits          — Checklist submissions (form data in form_json JSON blob)
visit_photos    — Photo metadata, R2 keys
```

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | — | Health check |
| GET | `/api/supervisors` | — | List PC supervisors |
| GET | `/api/customers` | — | List customers |
| GET | `/api/stores?customer_code=X` | — | List stores (filtered) |
| GET | `/api/store/:shopCode` | — | Single store detail |
| POST | `/api/visits` | — | Submit a visit |
| GET | `/api/visits/:id` | — | Get visit detail |
| GET | `/api/my-visits?supervisor_id=X` | — | Supervisor's submissions |
| POST | `/api/upload` | — | Upload photo |
| POST | `/api/admin/login` | — | Admin auth |
| GET | `/api/admin/visits` | Admin | List all visits |
| GET | `/api/admin/stats` | Admin | Dashboard stats |
| GET | `/api/admin/export` | Admin | Export CSV |
| POST | `/api/admin/visits/:id/review` | Admin | Approve/reject |
| POST | `/api/admin/supervisors` | Admin | Add supervisor |
| DELETE | `/api/admin/supervisors/:id` | Admin | Delete supervisor |
| POST | `/api/admin/import-csv` | Admin | Re-import Dimension_Store.csv |

## Dimension Store Data (from Dimension_Store.csv)

| Metric | Value |
|--------|-------|
| **Total stores** | 266 |
| **Unique customers** | 40 |
| **REGIONs** | BKK Central (54), North (121), Northeast (28), South (32), West&East (29), — (2) |
| **Channel Lv1** | RT (Retail, 234), WS (Wholesale, 32) |
| **Channel Lv2** | Direct Retail (98), Chain Retail (136), Distribution (30), AC Special Shop (2) |
| **Area Sup groups** | N2 (106), BKK (38), SIAMCHAI (34), S (30), WE1 (17), NE1 (13), N1 (12), NE2 (12), WE2 (4) |

All stores have `Channel: DL` and `Sales Org: 6560`.

## Admin Features

- **Dashboard:** Total visits, pending/approved/rejected counts, per-store/supervisor/region breakdowns
- **Filter & search:** By status, date range, store, supervisor, region
- **Approve/Reject:** Reject requires a comment (shown to the supervisor)
- **Export CSV:** One row per visit
- **Manage supervisors:** Add/remove
- **View store data:** All 266 stores with dimension fields
- **CSV re-import:** Drop in a refreshed `Dimension_Store.csv`

## Supervisor Features

- **Name picker** (no login required)
- **Cascading Customer → Shop** dropdowns
- **Full checklist form** with all 6 sections
- **Photo upload** with 6 tagged categories, thumbnails, remove
- **Client-side validation** (required fields only)
- **Offline-resilient:** State kept in localStorage until confirmed
- **My Submissions** page with status badges
- **Rejected visits** show admin comment

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors | Check `ALLOWED_ORIGINS` in `worker/src/cors.js` |
| D1 not found | Run `wrangler d1 create` and update `database_id` in `wrangler.toml` |
| Photos not uploading | Verify R2 bucket exists: `wrangler r2 bucket list` |
| Admin login fails | Set `ADMIN_PASSWORD` secret: `wrangler secret put ADMIN_PASSWORD` |
| 404 on API | Worker might not be deployed — run `wrangler deploy` |
| Frontend data not loading | Set `API_BASE` env var in Cloudflare Pages settings |