export type Draft = {store:string, items:Record<string,number>, key:string}
export async function draftDB(value?:Draft):Promise<Draft|undefined> {
 const db = await new Promise<IDBDatabase>((resolve,reject)=>{
  const open=indexedDB.open('scanpay',1)
  open.onupgradeneeded=()=>open.result.createObjectStore('draft')
  open.onsuccess=()=>resolve(open.result)
  open.onerror=()=>reject(open.error)
 })
 try {
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('draft',value?'readwrite':'readonly')
   const store=tx.objectStore('draft')
   const request=value?store.put(value,'cart'):store.get('cart')
   tx.oncomplete=()=>resolve(value?undefined:request.result)
   tx.onerror=()=>reject(tx.error)
   tx.onabort=()=>reject(tx.error)
  })
 } finally {db.close()}
}
