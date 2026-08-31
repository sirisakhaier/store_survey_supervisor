// Database helpers for Cloudflare D1
export async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = await (params.length > 0 ? stmt.bind(...params).all() : stmt.all());
  return result.results || [];
}

export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = await (params.length > 0 ? stmt.bind(...params).first() : stmt.first());
  return result || null;
}

export async function execute(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = await (params.length > 0 ? stmt.bind(...params).run() : stmt.run());
  return result;
}

export async function batchExecute(db, statements) {
  return await db.batch(statements);
}