/**
 * PC Supervisor Store Visit Checklist — Cloudflare Worker Backend
 *
 * Routes:
 *   GET  /api/health
 *   GET  /api/supervisors
 *   GET  /api/customers
 *   GET  /api/stores?customer_code=XXX
 *   GET  /api/store/:shopCode
 *   POST /api/visits              (submit a new visit)
 *   GET  /api/visits/:id           (get a single visit)
 *   GET  /api/my-visits?supervisor_id=X&status=Y  (supervisor's own visits)
 *   POST /api/upload              (upload photo, returns presigned URL)
 *   POST /api/admin/login         (admin auth)
 *   GET  /api/admin/visits        (list all visits with filters)
 *   GET  /api/admin/visits/:id    (admin view of a visit)
 *   POST /api/admin/visits/:id/review  (approve/reject)
 *   GET  /api/admin/stats         (dashboard stats)
 *   POST /api/admin/supervisors   (add supervisor)
 *   DELETE /api/admin/supervisors/:id
 *   PUT  /api/admin/supervisors/:id
 *   POST /api/admin/stores        (add/edit store)
 *   DELETE /api/admin/stores/:shopCode
 *   POST /api/admin/import-csv    (re-import dimension CSV)
 *   GET  /api/admin/export        (export filtered visits as CSV)
 */

import { handleApiRequest } from './router';
import { corsHeaders, handleOptions } from './cors';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Route API requests
    if (path.startsWith('/api/')) {
      try {
        const response = await handleApiRequest(request, env, ctx);
        return response;
      } catch (err) {
        console.error('Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error', detail: err.message }), {
          status: 500,
          headers: { ...corsHeaders(request.headers.get('Origin')), 'Content-Type': 'application/json' },
        });
      }
    }

    // 404 for non-API routes
    return new Response('Not found', { status: 404 });
  },
};