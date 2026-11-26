const CACHE = 'scanpay-shell-v5'
self.addEventListener('install', event => {
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE)
  await cache.addAll(['/','/manifest.webmanifest','/icons/icon-192.png','/hero.webp'])
  const html=await (await cache.match('/')).text()
  const assets=new Set(Array.from(html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g),match=>match[1]))
  await cache.addAll([...assets])
  await self.skipWaiting()
 })())
})
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('scanpay-shell-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))
})
self.addEventListener('fetch', event => {
 const url=new URL(event.request.url)
 if(event.request.method!=='GET'||url.origin!==location.origin)return
 if(event.request.mode==='navigate' && url.pathname==='/'){
  event.respondWith(fetch(event.request).catch(()=>caches.match('/')))
  return
 }
 if(!url.pathname.startsWith('/_next/static/')&&!url.pathname.startsWith('/icons/')&&url.pathname!=='/hero.webp')return
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const saved=await cache.match(event.request)
  if(saved)return saved
  const response=await fetch(event.request)
  if(response.ok) await cache.put(event.request,response.clone())
  return response
 }))
})
