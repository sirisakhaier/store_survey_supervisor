-- PC Supervisor Store Visit Checklist - D1 Schema
-- Migration 001: Create all tables

-- Customers (from Dimension_Store.csv Customer Code / Customer Name)
CREATE TABLE IF NOT EXISTS customers (
  customer_code TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL
);

-- Stores (dimension data from Dimension_Store.csv)
CREATE TABLE IF NOT EXISTS stores (
  shop_code TEXT PRIMARY KEY,
  shop_name TEXT NOT NULL,
  store_id TEXT DEFAULT '',
  channel TEXT DEFAULT '',
  area_sup TEXT DEFAULT '',
  customer_code TEXT NOT NULL,
  sales_org TEXT DEFAULT '',
  region TEXT DEFAULT '',
  channel_lv1 TEXT DEFAULT '',
  channel_lv2 TEXT DEFAULT '',
  FOREIGN KEY (customer_code) REFERENCES customers(customer_code)
);

-- PC Supervisors
CREATE TABLE IF NOT EXISTS supervisors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Store visits (checklist submissions)
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  supervisor_id INTEGER NOT NULL,
  customer_code TEXT NOT NULL,
  shop_code TEXT NOT NULL,
  channel_zone TEXT DEFAULT '',
  pc_name_at_store TEXT DEFAULT '',
  visit_datetime TEXT NOT NULL,
  note TEXT DEFAULT '',
  form_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_comment TEXT DEFAULT '',
  reviewed_at TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supervisor_id) REFERENCES supervisors(id),
  FOREIGN KEY (shop_code) REFERENCES stores(shop_code),
  FOREIGN KEY (customer_code) REFERENCES customers(customer_code)
);

-- Visit photos (stored in R2, metadata in D1)
CREATE TABLE IF NOT EXISTS visit_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id TEXT NOT NULL,
  category TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  original_name TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (visit_id) REFERENCES visits(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_visits_supervisor_id ON visits(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_visits_shop_code ON visits(shop_code);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_visit_datetime ON visits(visit_datetime);
CREATE INDEX IF NOT EXISTS idx_visits_submitted_at ON visits(submitted_at);
CREATE INDEX IF NOT EXISTS idx_stores_customer_code ON stores(customer_code);
CREATE INDEX IF NOT EXISTS idx_visit_photos_visit_id ON visit_photos(visit_id);