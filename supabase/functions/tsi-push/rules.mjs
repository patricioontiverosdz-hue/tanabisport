export const CATEGORIES = ['avisos','pagos','proceso','cobertura','comentarios','disponibilidad','horas','carga','autorizaciones'];
export const TABS = ['notif','avisos','comentarios','cobertura','proceso','mipago','pagos','gastos','prestamos'];
export function validEndpoint(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443') || value.length > 4096) return false;
    return u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' ||
      u.hostname === 'web.push.apple.com' || u.hostname.endsWith('.push.apple.com') || u.hostname.endsWith('.notify.windows.com');
  } catch { return false; }
}
export function validSubscription(s) {
  return !!s && validEndpoint(s.endpoint) && /^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth || '');
}
export function validatePreferences(p) {
  if (!p || typeof p.enabled !== 'boolean' || typeof p.quiet_enabled !== 'boolean' ||
      !Array.isArray(p.categories) || p.categories.some(c => !CATEGORIES.includes(c)) ||
      !Number.isInteger(p.quiet_start) || p.quiet_start < 0 || p.quiet_start > 23 ||
      !Number.isInteger(p.quiet_end) || p.quiet_end < 0 || p.quiet_end > 23 ||
      (p.quiet_enabled && p.quiet_start === p.quiet_end) || typeof p.timezone !== 'string') return false;
  try { new Intl.DateTimeFormat('en', { timeZone:p.timezone }).format(); return true; } catch { return false; }
}
export function quietNow(p, date = new Date()) {
  if (!p.quiet_enabled || p.quiet_start === p.quiet_end) return false;
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone:p.timezone, hour:'2-digit', hourCycle:'h23' }).format(date));
  return p.quiet_start < p.quiet_end ? h >= p.quiet_start && h < p.quiet_end : h >= p.quiet_start || h < p.quiet_end;
}
export function nextAllowed(p, date = new Date()) {
  // Avanzar por instantes reales respeta cambios de horario de la zona elegida.
  let d = new Date(date);
  for (let i=0; i<1500 && quietNow(p,d); i++) d = new Date(d.getTime()+60_000);
  return d.toISOString();
}
