const scope = new URL(self.registration.scope).pathname
const buyer = scope === '/'
const CACHE = 'scanpay-shell-v7'
self.addEventListener('install', event => {
 event.waitUntil((async()=>{
  if(buyer){
   const cache=await caches.open(CACHE)
   await cache.addAll(['/','/manifest.webmanifest','/icons/icon-192.png','/hero.webp'])
   const html=await (await cache.match('/')).text()
   const assets=new Set(Array.from(html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g),match=>match[1]))
   await cache.addAll([...assets])
  }
  await self.skipWaiting()
 })())
})
self.addEventListener('activate', event => {
 event.waitUntil((async()=>{
  if(buyer){
   const keys=await caches.keys()
   await Promise.all(keys.filter(key=>key.startsWith('scanpay-shell-')&&key!==CACHE).map(key=>caches.delete(key)))
  }
  await self.clients.claim()
 })())
})
self.addEventListener('fetch', event => {
 const url=new URL(event.request.url)
 if(event.request.method!=='GET'||url.origin!==location.origin)return
 if(event.request.mode==='navigate'){
  if(buyer&&url.pathname==='/'){
   event.respondWith(fetch(event.request).catch(()=>caches.match('/')))
  }else if(!buyer&&url.pathname===scope){
   event.respondWith(fetch(event.request).catch(()=>new Response(
    '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ScanPay offline</title><main><h1>ScanPay sedang offline</h1><p>Sambungkan internet untuk membuka aplikasi.</p><a href="">Muat ulang</a></main></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
   )))
  }
  return
 }
 if(!buyer||(!url.pathname.startsWith('/_next/static/')&&!url.pathname.startsWith('/icons/')&&url.pathname!=='/hero.webp'))return
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const saved=await cache.match(event.request)
  if(saved)return saved
  const response=await fetch(event.request)
  if(response.ok) await cache.put(event.request,response.clone())
  return response
 }))
})
