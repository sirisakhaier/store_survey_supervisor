// Public API route handlers
import { queryAll, queryOne, execute } from './db';

export async function handleGetSupervisors(db) {
  const rows = await queryAll(db, 'SELECT * FROM supervisors ORDER BY name ASC');
  return { supervisors: rows };
}

export async function handleGetCustomers(db) {
  const rows = await queryAll(db, 'SELECT * FROM customers ORDER BY customer_name ASC');
  return { customers: rows };
}

export async function handleGetStores(db, customerCode) {
  if (!customerCode) {
    const rows = await queryAll(db, 'SELECT * FROM stores ORDER BY shop_name ASC');
    return { stores: rows };
  }
  const rows = await queryAll(
    db,
    'SELECT * FROM stores WHERE customer_code = ? ORDER BY shop_name ASC',
    [customerCode]
  );
  return { stores: rows };
}

export async function handleGetStore(db, shopCode) {
  const row = await queryOne(db, 'SELECT * FROM stores WHERE shop_code = ?', [shopCode]);
  if (!row) return { error: 'Store not found' };
  return { store: row };
}

export async function handleSubmitVisit(db, body) {
  const { supervisor_id, customer_code, shop_code, channel_zone, pc_name_at_store,
          visit_datetime, note, form_json } = body;

  if (!supervisor_id || !shop_code || !visit_datetime) {
    return { error: 'Missing required fields: supervisor_id, shop_code, visit_datetime' };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    db,
    `INSERT INTO visits (id, supervisor_id, customer_code, shop_code, channel_zone,
      pc_name_at_store, visit_datetime, note, form_json, status, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, supervisor_id, customer_code || '', shop_code, channel_zone || '',
     pc_name_at_store || '', visit_datetime, note || '', JSON.stringify(form_json || {}), now, now]
  );

  return { id, status: 'pending', submitted_at: now };
}

export async function handleGetVisit(db, photos, id) {
  const visit = await queryOne(
    db,
    `SELECT v.*, s.shop_name, s.region, s.channel_lv1, s.channel_lv2, s.area_sup,
            c.customer_name, sup.name as supervisor_name
     FROM visits v
     LEFT JOIN stores s ON v.shop_code = s.shop_code
     LEFT JOIN customers c ON v.customer_code = c.customer_code
     LEFT JOIN supervisors sup ON v.supervisor_id = sup.id
     WHERE v.id = ?`,
    [id]
  );

  if (!visit) return { error: 'Visit not found' };

  // Get photos
  const photoRows = await queryAll(
    db,
    'SELECT * FROM visit_photos WHERE visit_id = ? ORDER BY category, id',
    [id]
  );

  return { visit: { ...visit, form_json: JSON.parse(visit.form_json || '{}') }, photos: photoRows };
}

export async function handleGetMyVisits(db, supervisorId, statusFilter) {
  if (!supervisorId) return { error: 'supervisor_id is required' };

  let sql = `SELECT v.id, v.shop_code, s.shop_name, c.customer_name,
             v.visit_datetime, v.status, v.review_comment, v.revision_count,
             v.submitted_at, v.updated_at
             FROM visits v
             LEFT JOIN stores s ON v.shop_code = s.shop_code
             LEFT JOIN customers c ON v.customer_code = c.customer_code
             WHERE v.supervisor_id = ?`;
  const params = [supervisorId];

  if (statusFilter) {
    sql += ' AND v.status = ?';
    params.push(statusFilter);
  }

  sql += ' ORDER BY v.submitted_at DESC';

  const rows = await queryAll(db, sql, params);
  return { visits: rows };
}

export async function handleUploadPhoto(request, env, ctx) {
  try {
    const formData = await request.formData();
    const file = formData.get('photo');
    const visitId = formData.get('visit_id');
    const category = formData.get('category');

    if (!file || !visitId || !category) {
      return new Response(JSON.stringify({ error: 'Missing required fields: photo, visit_id, category' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const r2Key = `${visitId}/${category}/${Date.now()}.${ext}`;

    // Upload to R2
    await env.PHOTOS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name, visitId, category },
    });

    // Save metadata to D1
    await execute(
      env.DB,
      `INSERT INTO visit_photos (visit_id, category, r2_key, original_name, file_size)
       VALUES (?, ?, ?, ?, ?)`,
      [visitId, category, r2Key, file.name, file.size]
    );

    return new Response(JSON.stringify({ r2_key: r2Key, url: `https://r2.haier-visit.com/${r2Key}` }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upload failed', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}