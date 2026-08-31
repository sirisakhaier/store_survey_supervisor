// Admin authentication middleware
// Uses a shared admin password stored as a Cloudflare secret (ADMIN_PASSWORD)
// On successful login, returns a simple session token valid for the request duration

export function adminLogin(request, env) {
  try {
    const { password } = request.body || {};
    if (!password || !env.ADMIN_PASSWORD) {
      return { success: false, error: 'Invalid credentials' };
    }
    if (password !== env.ADMIN_PASSWORD) {
      return { success: false, error: 'Invalid credentials' };
    }
    // Return a simple token — in production use a real JWT/session
    const token = btoa(`admin:${Date.now()}`);
    return { success: true, token };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function verifyAdmin(request, env) {
  // Check headers first
  const authHeader = request.headers.get('Authorization') || '';
  const tokenHeader = request.headers.get('X-Admin-Token') || '';

  let authToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : tokenHeader;

  // Fallback: check query parameter (used by window.open exports)
  if (!authToken) {
    try {
      const url = new URL(request.url);
      authToken = url.searchParams.get('token') || '';
    } catch {
      // ignore
    }
  }

  if (!authToken) return false;

  // Simple verification: decode and check it's a valid admin token
  try {
    const decoded = atob(authToken);
    return decoded.startsWith('admin:');
  } catch {
    return false;
  }
}

export function requireAdmin(request, env) {
  if (!verifyAdmin(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}