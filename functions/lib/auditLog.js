// Records a line in admin_actions. Best-effort: a logging failure should
// never block the actual admin operation, so callers don't need to await
// this inside their own try/catch — just fire it after the real change.
export async function logAdminAction(env, action, detail) {
  try {
    await env.DB.prepare(`INSERT INTO admin_actions (action, detail) VALUES (?, ?)`).bind(action, detail).run();
  } catch {
    /* audit logging is best-effort, never fail the request over it */
  }
}
