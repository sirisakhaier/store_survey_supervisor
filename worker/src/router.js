// Router — dispatches API requests to handlers
import { corsHeaders } from './cors';
import { adminLogin, verifyAdmin } from './auth';
import {
  handleGetSupervisors, handleGetCustomers, handleGetStores,
  handleGetStore, handleSubmitVisit, handleGetVisit, handleGetMyVisits,
  handleUploadPhoto,
} from './routes';
import {
  handleAdminVisits, handleAdminVisitDetail, handleAdminReview,
  handleAdminStats, handleAdminSupervisors, handleAdminStores,
  handleAdminImportCSV, handleAdminExport, handleAdminDeleteStore,
  handleAdminUpdateSupervisor, handleAdminDeleteSupervisor,
  handleServePhoto, handleAdminExportStores, handleAdminImportStoresReplace,
  handleAdminExportExcel, handleAdminExportSelected,
} from './admin';

export async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const headers = corsHeaders(request.headers.get('Origin'));

  // Helper to parse JSON body
  const getBody = async () => {
    try {
      return await request.json();
    } catch {
      return {};
    }
  };

  // Helper to build JSON response
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

  // --- Public routes ---

  // Health check
  if (method === 'GET' && path === '/api/health') {
    return json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // List supervisors
  if (method === 'GET' && path === '/api/supervisors') {
    return json(await handleGetSupervisors(env.DB));
  }

  // List customers (for cascading dropdown)
  if (method === 'GET' && path === '/api/customers') {
    return json(await handleGetCustomers(env.DB));
  }

  // List stores by customer code
  if (method === 'GET' && path === '/api/stores') {
    const customerCode = url.searchParams.get('customer_code');
    return json(await handleGetStores(env.DB, customerCode));
  }

  // Get single store detail
  if (method === 'GET' && path.startsWith('/api/store/')) {
    const shopCode = path.replace('/api/store/', '');
    return json(await handleGetStore(env.DB, shopCode));
  }

  // Submit a visit
  if (method === 'POST' && path === '/api/visits') {
    const body = await getBody();
    return json(await handleSubmitVisit(env.DB, body), 201);
  }

  // Get a single visit (public)
  if (method === 'GET' && path.startsWith('/api/visits/') && !path.includes('admin') && !path.includes('my-visit')) {
    const id = path.replace('/api/visits/', '');
    return json(await handleGetVisit(env.DB, env.PHOTOS, id));
  }

  // Get my visit detail (for supervisor viewing their own submission)
  if (method === 'GET' && path.startsWith('/api/my-visit/')) {
    const id = path.replace('/api/my-visit/', '');
    return json(await handleGetVisit(env.DB, env.PHOTOS, id));
  }

  // Get my visits (supervisor's own submissions)
  if (method === 'GET' && path === '/api/my-visits') {
    const supervisorId = url.searchParams.get('supervisor_id');
    const status = url.searchParams.get('status') || '';
    return json(await handleGetMyVisits(env.DB, supervisorId, status));
  }

  // Upload photo
  if (method === 'POST' && path === '/api/upload') {
    return handleUploadPhoto(request, env, ctx);
  }

  // Serve photo from R2
  if (method === 'GET' && path.startsWith('/api/photo/')) {
    const r2Key = decodeURIComponent(path.replace('/api/photo/', ''));
    return handleServePhoto(request, env, r2Key);
  }

  // --- Admin routes ---

  // Admin login
  if (method === 'POST' && path === '/api/admin/login') {
    const body = await getBody();
    return json(adminLogin({ body }, env));
  }

  // Admin list visits
  if (method === 'GET' && path === '/api/admin/visits') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const params = Object.fromEntries(url.searchParams);
    return json(await handleAdminVisits(env.DB, params));
  }

  // Admin stats
  if (method === 'GET' && path === '/api/admin/stats') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    return json(await handleAdminStats(env.DB));
  }

  // Admin export CSV (simple)
  if (method === 'GET' && path === '/api/admin/export') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    return handleAdminExport(env.DB, url.searchParams);
  }

  // Admin export Excel with photos
  if (method === 'GET' && path === '/api/admin/export-excel') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    return handleAdminExportExcel(env.DB, url.searchParams);
  }

  // Admin export selected surveys (POST — multi-sheet or single-sheet)
  if (method === 'POST' && path === '/api/admin/export-selected') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const body = await getBody();
    // body: { ids: [...], mode: 'multi-sheet'|'single-sheet' }
    const response = await handleAdminExportSelected(env.DB, body);
    // Add CORS headers to the Response
    const cors = corsHeaders(request.headers.get('Origin'));
    for (const [key, val] of Object.entries(cors)) {
      response.headers.set(key, val);
    }
    return response;
  }

  // Admin export stores
  if (method === 'GET' && path === '/api/admin/export-stores') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    return handleAdminExportStores(env.DB);
  }

  // Admin import stores (replace all)
  if (method === 'POST' && path === '/api/admin/import-stores-replace') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    return json(await handleAdminImportStoresReplace(request, env.DB));
  }

  // Admin import CSV (upsert)
  if (method === 'POST' && path === '/api/admin/import-csv') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    return json(await handleAdminImportCSV(request, env.DB));
  }

  // Admin manage supervisors
  if (method === 'POST' && path === '/api/admin/supervisors') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const body = await getBody();
    return json(await handleAdminSupervisors(env.DB, body), 201);
  }
  if (method === 'PUT' && path.startsWith('/api/admin/supervisors/')) {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const id = path.replace('/api/admin/supervisors/', '');
    const body = await getBody();
    return json(await handleAdminUpdateSupervisor(env.DB, id, body));
  }
  if (method === 'DELETE' && path.startsWith('/api/admin/supervisors/')) {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const id = path.replace('/api/admin/supervisors/', '');
    return json(await handleAdminDeleteSupervisor(env.DB, id));
  }

  // Admin manage stores
  if (method === 'POST' && path === '/api/admin/stores') {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const body = await getBody();
    return json(await handleAdminStores(env.DB, body));
  }
  if (method === 'DELETE' && path.startsWith('/api/admin/stores/')) {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const shopCode = decodeURIComponent(path.replace('/api/admin/stores/', ''));
    return json(await handleAdminDeleteStore(env.DB, shopCode));
  }

  // Admin review (approve/reject)
  if (method === 'POST' && path.startsWith('/api/admin/visits/') && path.endsWith('/review')) {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const id = path.replace('/api/admin/visits/', '').replace('/review', '');
    const body = await getBody();
    return json(await handleAdminReview(env.DB, id, body));
  }

  // Admin visit detail
  if (method === 'GET' && path.startsWith('/api/admin/visits/')) {
    const unauth = requireAdmin(request, env);
    if (unauth) return unauth;
    const id = path.replace('/api/admin/visits/', '');
    return json(await handleAdminVisitDetail(env.DB, env.PHOTOS, id));
  }

  // 404 for unmatched API routes
  return json({ error: 'Not found' }, 404);
}

function requireAdmin(request, env) {
  if (!verifyAdmin(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(request.headers.get('Origin')), 'Content-Type': 'application/json' },
    });
  }
  return null;
}