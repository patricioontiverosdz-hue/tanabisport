/* TSI push 2.0.4. No cachea páginas, sesiones ni respuestas de Supabase. */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Tanabi Sports', {
    body: payload.body || 'Tienes una actualización en el portal.',
    tag: payload.id || 'tsi-update',
    icon: './icon-192.png', badge: './icon-192.png',
    data: { tab: payload.tab || 'notif' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const allowed = ['notif','avisos','comentarios','cobertura','proceso','mipago','pagos','gastos','prestamos'];
  const tab = allowed.includes(event.notification.data?.tab) ? event.notification.data.tab : 'notif';
  const url = new URL('./', self.registration.scope);
  url.searchParams.set('tsi_tab', tab);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === url.origin && new URL('./', client.url).pathname === url.pathname) {
        await client.focus();
        client.postMessage({ type: 'TSI_OPEN_TAB', tab });
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
