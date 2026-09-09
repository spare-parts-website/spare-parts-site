const CACHE='ghyar-market-static-v4'
const STATIC_ASSETS=['/ghyar-market-logo.svg','/ghyar-market-icon.png']
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting())))
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())))
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin||!STATIC_ASSETS.includes(url.pathname))return;event.respondWith(caches.match(event.request).then(cached=>{const network=fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response});return cached||network}))})
self.addEventListener('notificationclick',event=>{event.notification.close();let path='/';try{const requested=new URL(event.notification.data?.url||'/',self.location.origin);if(requested.origin===self.location.origin)path=requested.href}catch{}event.waitUntil(clients.openWindow(path))})
