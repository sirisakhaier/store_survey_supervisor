// Admin API route handlers
import { queryAll, queryOne, execute } from './db';

// List all visits with filters
export async function handleAdminVisits(db, params) {
  let sql = `
    SELECT v.id, v.supervisor_id, sup.name as supervisor_name,
           v.shop_code, s.shop_name, c.customer_name,
           v.visit_datetime, v.status, v.review_comment, v.revision_count,
           v.submitted_at, v.updated_at
    FROM visits v
    LEFT JOIN supervisors sup ON v.supervisor_id = sup.id
    LEFT JOIN stores s ON v.shop_code = s.shop_code
    LEFT JOIN customers c ON v.customer_code = c.customer_code
    WHERE 1=1`;
  const vals = [];

  if (params.status) {
    sql += ' AND v.status = ?';
    vals.push(params.status);
  }
  if (params.supervisor_id) {
    sql += ' AND v.supervisor_id = ?';
    vals.push(params.supervisor_id);
  }
  if (params.shop_code) {
    sql += ' AND v.shop_code = ?';
    vals.push(params.shop_code);
  }
  if (params.customer_code) {
    sql += ' AND v.customer_code = ?';
    vals.push(params.customer_code);
  }
  if (params.date_from) {
    sql += ' AND v.visit_datetime >= ?';
    vals.push(params.date_from);
  }
  if (params.date_to) {
    sql += ' AND v.visit_datetime <= ?';
    vals.push(params.date_to);
  }
  if (params.region) {
    sql += ' AND s.region = ?';
    vals.push(params.region);
  }

  sql += ' ORDER BY v.submitted_at DESC';

  // Parse limit/offset
  const limit = Math.min(parseInt(params.limit) || 50, 500);
  const offset = parseInt(params.offset) || 0;
  sql += ` LIMIT ${limit} OFFSET ${offset}`;

  const rows = await queryAll(db, sql, vals);
  // Get total count
  const countSql = sql.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM')
                       .replace(/ LIMIT \d+ OFFSET \d+$/, '');
  const total = await queryOne(db, countSql, vals);

  return { visits: rows, total: total?.total || 0, limit, offset };
}

// Admin view single visit detail
export async function handleAdminVisitDetail(db, photos, id) {
  const visit = await queryOne(
    db,
    `SELECT v.*, s.shop_name, s.region, s.channel, s.channel_lv1, s.channel_lv2,
            s.area_sup, s.sales_org, c.customer_name, sup.name as supervisor_name
     FROM visits v
     LEFT JOIN stores s ON v.shop_code = s.shop_code
     LEFT JOIN customers c ON v.customer_code = c.customer_code
     LEFT JOIN supervisors sup ON v.supervisor_id = sup.id
     WHERE v.id = ?`,
    [id]
  );

  if (!visit) return { error: 'Visit not found' };

  const photoRows = await queryAll(
    db,
    'SELECT * FROM visit_photos WHERE visit_id = ? ORDER BY category, id',
    [id]
  );

  return {
    visit: { ...visit, form_json: JSON.parse(visit.form_json || '{}') },
    photos: photoRows,
  };
}

// Approve or reject a visit
export async function handleAdminReview(db, id, body) {
  const { status, review_comment } = body;

  if (!['approved', 'rejected'].includes(status)) {
    return { error: 'Status must be "approved" or "rejected"' };
  }
  if (status === 'rejected' && !review_comment) {
    return { error: 'Review comment is required when rejecting' };
  }

  const now = new Date().toISOString();
  await execute(
    db,
    'UPDATE visits SET status = ?, review_comment = ?, reviewed_at = ?, updated_at = ? WHERE id = ?',
    [status, review_comment || '', now, now, id]
  );

  return { id, status, reviewed_at: now };
}

// Dashboard stats
export async function handleAdminStats(db) {
  const totalVisits = await queryOne(db, 'SELECT COUNT(*) as count FROM visits');
  const pending = await queryOne(db, "SELECT COUNT(*) as count FROM visits WHERE status = 'pending'");
  const approved = await queryOne(db, "SELECT COUNT(*) as count FROM visits WHERE status = 'approved'");
  const rejected = await queryOne(db, "SELECT COUNT(*) as count FROM visits WHERE status = 'rejected'");

  // Visits per store this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const visitsPerStore = await queryAll(
    db,
    `SELECT s.shop_name, s.shop_code, COUNT(*) as visit_count
     FROM visits v
     JOIN stores s ON v.shop_code = s.shop_code
     WHERE v.submitted_at >= ?
     GROUP BY v.shop_code
     ORDER BY visit_count DESC
     LIMIT 10`,
    [monthStart.toISOString()]
  );

  // Visits per supervisor
  const visitsPerSupervisor = await queryAll(
    db,
    `SELECT sup.name, COUNT(*) as visit_count
     FROM visits v
     JOIN supervisors sup ON v.supervisor_id = sup.id
     GROUP BY v.supervisor_id
     ORDER BY visit_count DESC`
  );

  // Region breakdown
  const regionBreakdown = await queryAll(
    db,
    `SELECT s.region, COUNT(*) as visit_count
     FROM visits v
     JOIN stores s ON v.shop_code = s.shop_code
     GROUP BY s.region
     ORDER BY visit_count DESC`
  );

  return {
    total: totalVisits?.count || 0,
    pending: pending?.count || 0,
    approved: approved?.count || 0,
    rejected: rejected?.count || 0,
    visitsPerStore,
    visitsPerSupervisor,
    regionBreakdown,
  };
}

// CRUD: Supervisors
export async function handleAdminSupervisors(db, body) {
  const { name } = body;
  if (!name) return { error: 'Name is required' };
  await execute(db, 'INSERT OR IGNORE INTO supervisors (name) VALUES (?)', [name]);
  const row = await queryOne(db, 'SELECT * FROM supervisors WHERE name = ?', [name]);
  return { supervisor: row };
}

export async function handleAdminUpdateSupervisor(db, id, body) {
  const { name } = body;
  if (!name) return { error: 'Name is required' };
  await execute(db, 'UPDATE supervisors SET name = ? WHERE id = ?', [name, id]);
  const row = await queryOne(db, 'SELECT * FROM supervisors WHERE id = ?', [id]);
  if (!row) return { error: 'Supervisor not found' };
  return { supervisor: row };
}

export async function handleAdminDeleteSupervisor(db, id) {
  await execute(db, 'DELETE FROM supervisors WHERE id = ?', [id]);
  return { success: true };
}

// CRUD: Stores
export async function handleAdminStores(db, body) {
  const { shop_code, shop_name, channel, area_sup, customer_code, sales_org, region, channel_lv1, channel_lv2 } = body;

  if (!shop_code || !shop_name) {
    return { error: 'shop_code and shop_name are required' };
  }

  // Upsert
  await execute(
    db,
    `INSERT INTO stores (shop_code, shop_name, store_id, channel, area_sup, customer_code, sales_org, region, channel_lv1, channel_lv2)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(shop_code) DO UPDATE SET
       shop_name = excluded.shop_name,
       channel = excluded.channel,
       area_sup = excluded.area_sup,
       customer_code = excluded.customer_code,
       sales_org = excluded.sales_org,
       region = excluded.region,
       channel_lv1 = excluded.channel_lv1,
       channel_lv2 = excluded.channel_lv2`,
    [shop_code, shop_name, channel || '', area_sup || '', customer_code || '',
     sales_org || '', region || '', channel_lv1 || '', channel_lv2 || '']
  );

  const row = await queryOne(db, 'SELECT * FROM stores WHERE shop_code = ?', [shop_code]);
  return { store: row };
}

export async function handleAdminDeleteStore(db, shopCode) {
  await execute(db, 'DELETE FROM stores WHERE shop_code = ?', [shopCode]);
  return { success: true };
}

// CSV Import
export async function handleAdminImportCSV(request, db) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return { error: 'No file uploaded' };

  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' };

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const requiredFields = ['Shop Name', 'Shop Code', 'Customer Name', 'Customer Code'];
  const missing = requiredFields.filter(f => !headers.includes(f));
  if (missing.length > 0) {
    return { error: `Missing required columns: ${missing.join(', ')}` };
  }

  const nameIdx = headers.indexOf('Shop Name');
  const codeIdx = headers.indexOf('Shop Code');
  const custNameIdx = headers.indexOf('Customer Name');
  const custCodeIdx = headers.indexOf('Customer Code');
  const channelIdx = headers.indexOf('Channel');
  const areaSupIdx = headers.indexOf('Area Sup');
  const salesOrgIdx = headers.indexOf('Sales Org');
  const regionIdx = headers.indexOf('REGION');
  const lv1Idx = headers.indexOf('Channel Lv1');
  const lv2Idx = headers.indexOf('Channel Lv2');
  const storeIdIdx = headers.indexOf('Store ID');

  let imported = 0;
  let errors = [];

  // Process in batches
  const statements = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 4) continue;

    const shopCode = (cols[codeIdx] || '').trim();
    const shopName = (cols[nameIdx] || '').trim();
    const custName = (cols[custNameIdx] || '').trim();
    const custCode = (cols[custCodeIdx] || '').trim();

    if (!shopCode || !shopName) continue;

    // Upsert customer
    statements.push(
      db.prepare(
        'INSERT OR IGNORE INTO customers (customer_code, customer_name) VALUES (?, ?)'
      ).bind(custCode, custName)
    );

    // Upsert store
    statements.push(
      db.prepare(
        `INSERT INTO stores (shop_code, shop_name, store_id, channel, area_sup, customer_code, sales_org, region, channel_lv1, channel_lv2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(shop_code) DO UPDATE SET
           shop_name = excluded.shop_name, store_id = excluded.store_id,
           channel = excluded.channel, area_sup = excluded.area_sup,
           customer_code = excluded.customer_code, sales_org = excluded.sales_org,
           region = excluded.region, channel_lv1 = excluded.channel_lv1,
           channel_lv2 = excluded.channel_lv2`
      ).bind(
        shopCode, shopName,
        (cols[storeIdIdx] || '').trim(),
        (cols[channelIdx] || '').trim(),
        (cols[areaSupIdx] || '').trim(),
        custCode,
        (cols[salesOrgIdx] || '').trim(),
        (cols[regionIdx] || '').trim(),
        (cols[lv1Idx] || '').trim(),
        (cols[lv2Idx] || '').trim()
      )
    );

    imported++;

    // Batch every 50 statements
    if (statements.length >= 50) {
      await db.batch(statements);
      statements.length = 0;
    }
  }

  // Flush remaining
  if (statements.length > 0) {
    await db.batch(statements);
  }

  return { imported, errors };
}

// CSV Export
export async function handleAdminExport(db, params) {
  let sql = `
    SELECT v.id, sup.name as supervisor_name, c.customer_name,
           s.shop_name, s.shop_code, s.region, s.channel, s.channel_lv1, s.channel_lv2,
           v.visit_datetime, v.status, v.review_comment, v.submitted_at
    FROM visits v
    LEFT JOIN supervisors sup ON v.supervisor_id = sup.id
    LEFT JOIN stores s ON v.shop_code = s.shop_code
    LEFT JOIN customers c ON v.customer_code = c.customer_code
    WHERE 1=1`;
  const vals = [];

  if (params.get('status')) {
    sql += ' AND v.status = ?';
    vals.push(params.get('status'));
  }
  if (params.get('date_from')) {
    sql += ' AND v.visit_datetime >= ?';
    vals.push(params.get('date_from'));
  }
  if (params.get('date_to')) {
    sql += ' AND v.visit_datetime <= ?';
    vals.push(params.get('date_to'));
  }

  sql += ' ORDER BY v.submitted_at DESC';

  const rows = await queryAll(db, sql, vals);

  // Build CSV
  const header = 'ID,Supervisor,Customer,Store,Shop Code,Region,Channel,Channel Lv1,Channel Lv2,Visit Date,Status,Review Comment,Submitted At';
  const csvRows = rows.map(r =>
    `"${r.id}","${r.supervisor_name}","${r.customer_name}","${r.shop_name}","${r.shop_code}","${r.region}","${r.channel}","${r.channel_lv1}","${r.channel_lv2}","${r.visit_datetime}","${r.status}","${r.review_comment || ''}","${r.submitted_at}"`
  );

  const csv = [header, ...csvRows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="store-visits-export.csv"',
    },
  });
}

// Simple CSV line parser (handles quoted fields)
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