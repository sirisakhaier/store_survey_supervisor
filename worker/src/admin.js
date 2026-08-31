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

// ====== NEW: Serve photo from R2 ======
export async function handleServePhoto(request, env, r2Key) {
  try {
    const object = await env.PHOTOS.get(r2Key);
    if (!object) {
      return new Response('Photo not found', { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');
    return new Response(object.body, { headers });
  } catch (err) {
    return new Response('Error serving photo', { status: 500 });
  }
}

// ====== NEW: Export stores as CSV ======
export async function handleAdminExportStores(db) {
  const rows = await queryAll(db, 'SELECT * FROM stores ORDER BY shop_name ASC');

  const header = 'Shop Name,Shop Code,Store ID,Channel,Area Sup,Customer Name,Customer Code,Sales Org,REGION,Channel Lv1,Channel Lv2';

  const csvRows = rows.map(r => {
    // Find customer name
    const custName = (r.customer_name || '').replace(/"/g, '""');
    const shopName = (r.shop_name || '').replace(/"/g, '""');
    return `"${shopName}","${r.shop_code}","${r.store_id || ''}","${r.channel || ''}","${r.area_sup || ''}","${custName}","${r.customer_code}","${r.sales_org || ''}","${r.region || ''}","${r.channel_lv1 || ''}","${r.channel_lv2 || ''}"`;
  });

  const csv = [header, ...csvRows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="dimension-stores-export.csv"',
    },
  });
}

// ====== NEW: Import stores with replace-all ======
export async function handleAdminImportStoresReplace(request, db) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return { error: 'No file uploaded' };

  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' };

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

  // Step 1: Delete all existing stores and customers
  await execute(db, 'DELETE FROM stores');
  await execute(db, 'DELETE FROM customers');

  // Step 2: Insert new data
  let imported = 0;
  const statements = [];
  const seenCustomers = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 4) continue;

    const shopCode = (cols[codeIdx] || '').trim();
    const shopName = (cols[nameIdx] || '').trim();
    const custName = (cols[custNameIdx] || '').trim();
    const custCode = (cols[custCodeIdx] || '').trim();

    if (!shopCode || !shopName) continue;

    // Insert customer (deduplicate)
    if (custCode && custName && !seenCustomers.has(custCode)) {
      seenCustomers.add(custCode);
      statements.push(
        db.prepare(
          'INSERT INTO customers (customer_code, customer_name) VALUES (?, ?)'
        ).bind(custCode, custName)
      );
    }

    // Insert store
    statements.push(
      db.prepare(
        `INSERT INTO stores (shop_code, shop_name, store_id, channel, area_sup, customer_code, sales_org, region, channel_lv1, channel_lv2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

    if (statements.length >= 50) {
      await db.batch(statements);
      statements.length = 0;
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return { imported, customers: seenCustomers.size };
}

// ====== NEW: Export visits as Excel (HTML format with photo thumbnails) ======
export async function handleAdminExportExcel(db, params) {
  let sql = `
    SELECT v.id, sup.name as supervisor_name, c.customer_name,
           s.shop_name, s.shop_code, s.region, s.channel, s.channel_lv1, s.channel_lv2,
           v.visit_datetime, v.status, v.review_comment, v.submitted_at,
           v.form_json
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

  // Build HTML table that Excel can open (.xls)
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
                xmlns:x="urn:schemas-microsoft-com:office:excel"
                xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
  <x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
  </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    table { border-collapse: collapse; font-size: 11px; font-family: Arial; }
    th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
    th { background: #004EA2; color: white; }
    .thumb { width: 80px; height: 80px; object-fit: cover; }
  </style>
  </head><body><table>
  <tr>
    <th>ID</th><th>Supervisor</th><th>Customer</th><th>Store</th><th>Shop Code</th>
    <th>Region</th><th>Visit Date</th><th>Status</th><th>Review Comment</th>
    <th>Channel/Zone</th><th>PC Name</th><th>Note</th>
    <th>%Ach.</th><th>Haier Trend</th><th>Situation</th>
    <th>Key Finding</th><th>Action</th><th>Follow Up</th>
    <th>Issue</th><th>Cause</th><th>Solution</th><th>Responsible</th>
    <th>GM Meeting</th><th>Photos</th>
  </tr>`;

  for (const row of rows) {
    const fj = JSON.parse(row.form_json || '{}');
    const s2 = fj.section2 || {};
    const s6 = fj.section6 || {};
    const s4 = fj.section4 || {};
    const s5 = fj.section5 || {};
    const header = fj.header || {};

    // Get photos for this visit
    const photoRows = await queryAll(
      db,
      'SELECT * FROM visit_photos WHERE visit_id = ? ORDER BY category, id',
      [row.id]
    );

    const photoHtml = photoRows.map(p =>
      `<img src="/api/photo/${encodeURIComponent(p.r2_key)}" class="thumb" alt="photo">`
    ).join('&nbsp;');

    const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[row.status] || row.status;

    html += `<tr>
      <td>${row.id}</td>
      <td>${row.supervisor_name || ''}</td>
      <td>${row.customer_name || ''}</td>
      <td>${row.shop_name || ''}</td>
      <td>${row.shop_code || ''}</td>
      <td>${row.region || ''}</td>
      <td>${row.visit_datetime || ''}</td>
      <td>${statusLabel}</td>
      <td>${(row.review_comment || '').replace(/</g, '&lt;')}</td>
      <td>${(header.channel_zone || '').replace(/</g, '&lt;')}</td>
      <td>${(header.pc_name || '').replace(/</g, '&lt;')}</td>
      <td>${(header.note || '').replace(/</g, '&lt;')}</td>
      <td>${s2.haier_ach || ''}</td>
      <td>${s6.haier_trend || ''}</td>
      <td>${s6.store_situation || ''}</td>
      <td>${(s6.key_finding || '').replace(/</g, '&lt;')}</td>
      <td>${(s6.opportunity || '').replace(/</g, '&lt;')}</td>
      <td>${(s6.follow_up || '').replace(/</g, '&lt;')}</td>
      <td>${(s4.issue_detail || '').replace(/</g, '&lt;')}</td>
      <td>${(s4.cause || '').replace(/</g, '&lt;')}</td>
      <td>${(s4.solution || '').replace(/</g, '&lt;')}</td>
      <td>${(s4.responsible || '').replace(/</g, '&lt;')}</td>
      <td>${s5.met || ''}</td>
      <td>${photoHtml}</td>
    </tr>`;
  }

  html += '</table></body></html>';

  return new Response(html, {
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': 'attachment; filename="store-visits-export.xls"',
    },
  });
}

// ====== NEW: Export selected surveys (POST) ======
// mode: 'multi-sheet' = 1 file, 1 sheet per survey (full detail)
//       'single-sheet' = 1 file, 1 flat table with all surveys as rows
export async function handleAdminExportSelected(db, body) {
  const { ids, mode } = body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: 'No visit IDs provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!['multi-sheet', 'single-sheet'].includes(mode)) {
    return new Response(JSON.stringify({ error: 'mode must be "multi-sheet" or "single-sheet"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch all selected visits
  const placeholders = ids.map(() => '?').join(',');
  const rows = await queryAll(
    db,
    `SELECT v.id, v.supervisor_id, sup.name as supervisor_name, c.customer_name,
            s.shop_name, s.shop_code, s.region, s.channel, s.channel_lv1, s.channel_lv2,
            v.visit_datetime, v.status, v.review_comment, v.submitted_at,
            v.form_json
     FROM visits v
     LEFT JOIN supervisors sup ON v.supervisor_id = sup.id
     LEFT JOIN stores s ON v.shop_code = s.shop_code
     LEFT JOIN customers c ON v.customer_code = c.customer_code
     WHERE v.id IN (${placeholders})
     ORDER BY v.submitted_at DESC`,
    ids
  );

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'No visits found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helper: render one survey as a single-row flat table (same as single-sheet format)
  function renderSurveyFlatRow(row, idx) {
    const fj = JSON.parse(row.form_json || '{}');
    const s2 = fj.section2 || {}; const s6 = fj.section6 || {};
    const s4 = fj.section4 || {}; const s5 = fj.section5 || {};
    const header = fj.header || {};
    const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[row.status] || row.status;

    return `<table>
      <tr>
        <th>#</th><th>ID</th><th>Supervisor</th><th>Customer</th><th>Store</th><th>Shop Code</th>
        <th>Region</th><th>Visit Date</th><th>Status</th><th>Review Comment</th>
        <th>Channel/Zone</th><th>PC Name</th><th>Note</th>
        <th>%Ach.</th><th>Haier Trend</th><th>Situation</th>
        <th>Key Finding</th><th>Action</th><th>Follow Up</th>
        <th>Issue</th><th>Cause</th><th>Solution</th><th>Responsible</th>
        <th>GM Meeting</th>
      </tr>
      <tr>
        <td>${idx}</td>
        <td>${esc(row.id)}</td>
        <td>${esc(row.supervisor_name || '')}</td>
        <td>${esc(row.customer_name || '')}</td>
        <td>${esc(row.shop_name || '')}</td>
        <td>${row.shop_code || ''}</td>
        <td>${row.region || ''}</td>
        <td>${row.visit_datetime || ''}</td>
        <td>${statusLabel}</td>
        <td>${esc(row.review_comment || '')}</td>
        <td>${esc(header.channel_zone || '')}</td>
        <td>${esc(header.pc_name || '')}</td>
        <td>${esc(header.note || '')}</td>
        <td>${s2.haier_ach || ''}</td>
        <td>${esc(s6.haier_trend || '')}</td>
        <td>${esc(s6.store_situation || '')}</td>
        <td>${esc(s6.key_finding || '')}</td>
        <td>${esc(s6.opportunity || '')}</td>
        <td>${esc(s6.follow_up || '')}</td>
        <td>${esc(s4.issue_detail || '')}</td>
        <td>${esc(s4.cause || '')}</td>
        <td>${esc(s4.solution || '')}</td>
        <td>${esc(s4.responsible || '')}</td>
        <td>${esc(s5.met || '')}</td>
      </tr>
    </table>`;
  }

  function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  if (mode === 'multi-sheet') {
    // One sheet per survey — each sheet has the same flat table with 1 data row
    let sheets = rows.map((row, i) => {
      const sheetName = `Survey ${i+1} - ${(row.shop_name || row.shop_code || '').slice(0, 25)}`;
      const table = renderSurveyFlatRow(row, i + 1);
      return { name: sheetName, table };
    });

    // Build multi-sheet HTML
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
                xmlns:x="urn:schemas-microsoft-com:office:excel"
                xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
    ${sheets.map((s) => `<x:ExcelWorksheet><x:Name>${s.name}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>`).join('')}
    </x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>
      table { border-collapse: collapse; font-size: 10px; font-family: Arial; }
      th, td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; }
      th { background: #004EA2; color: white; }
    </style>
    </head><body>
    ${sheets.map(s => s.table).join('<br/><br/>')}
    </body></html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="selected-surveys-multi-sheet.xls"`,
      },
    });
  } else {
    // Single-sheet mode: flat table, one row per survey
    const statusLabel = (s) => ({ pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[s] || s);

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
                xmlns:x="urn:schemas-microsoft-com:office:excel"
                xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
    <x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>
      table { border-collapse: collapse; font-size: 10px; font-family: Arial; }
      th, td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; }
      th { background: #004EA2; color: white; }
    </style>
    </head><body><table>
    <tr>
      <th>#</th><th>ID</th><th>Supervisor</th><th>Customer</th><th>Store</th><th>Shop Code</th>
      <th>Region</th><th>Visit Date</th><th>Status</th><th>Review Comment</th>
      <th>Channel/Zone</th><th>PC Name</th><th>Note</th>
      <th>%Ach.</th><th>Haier Trend</th><th>Situation</th>
      <th>Key Finding</th><th>Action</th><th>Follow Up</th>
      <th>Issue</th><th>Cause</th><th>Solution</th><th>Responsible</th>
      <th>GM Meeting</th>
    </tr>`;

    rows.forEach((row, i) => {
      const fj = JSON.parse(row.form_json || '{}');
      const s2 = fj.section2 || {}; const s6 = fj.section6 || {};
      const s4 = fj.section4 || {}; const s5 = fj.section5 || {};
      const header = fj.header || {};
      const issues = s4.main_issues || [];

      html += `<tr>
        <td>${i+1}</td>
        <td>${row.id}</td>
        <td>${esc(row.supervisor_name || '')}</td>
        <td>${esc(row.customer_name || '')}</td>
        <td>${esc(row.shop_name || '')}</td>
        <td>${row.shop_code || ''}</td>
        <td>${row.region || ''}</td>
        <td>${row.visit_datetime || ''}</td>
        <td>${statusLabel(row.status)}</td>
        <td>${esc(row.review_comment || '')}</td>
        <td>${esc(header.channel_zone || '')}</td>
        <td>${esc(header.pc_name || '')}</td>
        <td>${esc(header.note || '')}</td>
        <td>${s2.haier_ach || ''}</td>
        <td>${esc(s6.haier_trend || '')}</td>
        <td>${esc(s6.store_situation || '')}</td>
        <td>${esc(s6.key_finding || '')}</td>
        <td>${esc(s6.opportunity || '')}</td>
        <td>${esc(s6.follow_up || '')}</td>
        <td>${esc(s4.issue_detail || '')}</td>
        <td>${esc(s4.cause || '')}</td>
        <td>${esc(s4.solution || '')}</td>
        <td>${esc(s4.responsible || '')}</td>
        <td>${esc(s5.met || '')}</td>
      </tr>`;
    });

    html += '</table></body></html>';

    return new Response(html, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': 'attachment; filename="selected-surveys-single-sheet.xls"',
      },
    });
  }
}