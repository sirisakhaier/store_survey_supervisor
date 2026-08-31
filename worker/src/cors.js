// CORS helpers
const ALLOWED_ORIGINS = [
  'http://localhost:8787',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://store-survey-supervisor.pages.dev',
  // Add your custom domain here
];

export function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}