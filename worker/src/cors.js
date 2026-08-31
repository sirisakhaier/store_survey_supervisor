// CORS helpers — echoes back the request's origin if allowed, or the first allowed origin
const ALLOWED_ORIGINS = [
  'http://localhost:8787',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://store-survey-supervisor.pages.dev',
  // Add your custom domain here
];

function resolveOrigin(requestOrigin) {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  // If not in the list, return the first one (safe fallback)
  return ALLOWED_ORIGINS[0];
}

export function corsHeaders(requestOrigin) {
  const allowed = resolveOrigin(requestOrigin);
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(request) {
  const origin = request?.headers?.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}