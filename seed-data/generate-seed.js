/**
 * Seed script: Load Dimension_Store.csv into D1
 *
 * Usage:
 *   1. Create D1 database:  wrangler d1 create haier-store-visit-db
 *   2. Apply migration:      wrangler d1 migrations apply haier-store-visit-db --local
 *   3. Run this seed:        wrangler d1 execute haier-store-visit-db --file=seed-data/seed-d1.sql
 *
 * This script generates the SQL INSERT statements from the CSV.
 * Run `node seed-data/seed-d1.js` to regenerate seed-d1.sql.
 */

const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'data', 'Dimension_Store.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

const headers = parseCSVLine(lines[0]);
const nameIdx = headers.indexOf('Shop Name');
const codeIdx = headers.indexOf('Shop Code');
const storeIdIdx = headers.indexOf('Store ID');
const channelIdx = headers.indexOf('Channel');
const areaSupIdx = headers.indexOf('Area Sup');
const custNameIdx = headers.indexOf('Customer Name');
const custCodeIdx = headers.indexOf('Customer Code');
const salesOrgIdx = headers.indexOf('Sales Org');
const regionIdx = headers.indexOf('REGION');
const lv1Idx = headers.indexOf('Channel Lv1');
const lv2Idx = headers.indexOf('Channel Lv2');

// Collect unique customers
const customers = new Map();
const storeInserts = [];

for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  if (cols.length < 11) continue;

  const custCode = (cols[custCodeIdx] || '').trim();
  const custName = (cols[custNameIdx] || '').trim();
  if (custCode && custName) {
    customers.set(custCode, custName);
  }

  const shopCode = (cols[codeIdx] || '').trim();
  const shopName = (cols[nameIdx] || '').trim();
  if (!shopCode || !shopName) continue;

  storeInserts.push(
    `INSERT OR IGNORE INTO stores (shop_code, shop_name, store_id, channel, area_sup, customer_code, sales_org, region, channel_lv1, channel_lv2) VALUES (` +
    `'${escapeSQL(shopCode)}', '${escapeSQL(shopName)}', '${escapeSQL((cols[storeIdIdx] || '').trim())}', ` +
    `'${escapeSQL((cols[channelIdx] || '').trim())}', '${escapeSQL((cols[areaSupIdx] || '').trim())}', ` +
    `'${escapeSQL(custCode)}', '${escapeSQL((cols[salesOrgIdx] || '').trim())}', ` +
    `'${escapeSQL((cols[regionIdx] || '').trim())}', '${escapeSQL((cols[lv1Idx] || '').trim())}', ` +
    `'${escapeSQL((cols[lv2Idx] || '').trim())}');`
  );
}

// Generate SQL
let sql = '-- Seed data: Customers and Stores from Dimension_Store.csv\n';
sql += '-- Generated: ' + new Date().toISOString() + '\n\n';

// Customers
sql += '-- Customers\n';
for (const [code, name] of customers) {
  sql += `INSERT OR IGNORE INTO customers (customer_code, customer_name) VALUES ('${escapeSQL(code)}', '${escapeSQL(name)}');\n`;
}

sql += '\n-- Stores\n';
for (const insert of storeInserts) {
  sql += insert + '\n';
}

// Write output
const outPath = path.join(__dirname, 'seed-d1.sql');
fs.writeFileSync(outPath, sql, 'utf-8');
console.log(`Written: ${outPath}`);
console.log(`Customers: ${customers.size}`);
console.log(`Stores: ${storeInserts.length}`);

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escapeSQL(str) {
  return str.replace(/'/g, "''");
}