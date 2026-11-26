import { DatabaseSync } from 'node:sqlite'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const roles = {customer:'Pelanggan',cashier:'Kasir',manager:'Manajer',owner:'Pemilik',admin:'Admin'}
const seed = [
 ['8991002100012','Susu UHT Full Cream','Minuman',18500,32,'🥛'],
 ['8991002100029','Roti Gandum Panggang','Makanan',22500,24,'🍞'],
 ['8991002100036','Kopi Susu Gula Aren','Minuman',15000,18,'☕'],
 ['8991002100043','Keripik Kentang Original','Camilan',12500,36,'🥔'],
 ['8991002100050','Apel Fuji','Buah & Sayur',28000,25,'🍎'],
 ['8991002100067','Air Mineral 600 ml','Minuman',5000,60,'💧']
]
const hash = value => createHash('sha256').update(value).digest('hex')
export class InputError extends Error {
 constructor(message, status = 400) { super(message); this.status = status }
}
const requireThat = (condition, message, status) => {
 if (!condition) throw new InputError(message,status)
}
export function openDB(path = process.env.SCANPAY_DB || '.data/scanpay.sqlite') {
 if (path !== ':memory:') mkdirSync(dirname(path),{recursive:true})
 const db = new DatabaseSync(path)
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS stores(id TEXT PRIMARY KEY, merchant TEXT NOT NULL, name TEXT NOT NULL, area TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
 CREATE TABLE IF NOT EXISTS products(store TEXT REFERENCES stores(id),code TEXT,name TEXT,category TEXT,price INTEGER CHECK(price>0),stock INTEGER CHECK(stock>=0),icon TEXT,PRIMARY KEY(store,code));
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,role TEXT NOT NULL,store TEXT REFERENCES stores(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer TEXT NOT NULL,store TEXT REFERENCES stores(id),idem TEXT NOT NULL,qr TEXT UNIQUE NOT NULL,status TEXT NOT NULL,payment TEXT NOT NULL,verification TEXT NOT NULL,total INTEGER NOT NULL,created INTEGER,expires INTEGER,items TEXT NOT NULL,received INTEGER,completed INTEGER,commission INTEGER NOT NULL, UNIQUE(customer,idem));
 CREATE INDEX IF NOT EXISTS order_queue ON orders(store,status,created);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor TEXT, action TEXT, entity TEXT, time INTEGER);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
 INSERT OR IGNORE INTO settings VALUES ('commission',200);
 INSERT OR IGNORE INTO stores(id,merchant,name,area) VALUES ('kemang','FreshMart','FreshMart Kemang','Jakarta Selatan'),('tebet','FreshMart','FreshMart Tebet','Jakarta Selatan'),('menteng','DailyGoods','DailyGoods Menteng','Jakarta Pusat');`)
 for (const store of ['kemang','tebet','menteng']) {
  for (const item of seed) db.prepare('INSERT OR IGNORE INTO products VALUES (?,?,?,?,?,?,?)').run(store,...item)
 }
 return db
}
export function tx(db, fn) {
 db.exec('BEGIN IMMEDIATE')
 try { const value = fn(); db.exec('COMMIT'); return value }
 catch(error) { db.exec('ROLLBACK'); throw error }
}
function release(db, row, status) {
 const update = db.prepare('UPDATE products SET stock=stock+? WHERE store=? AND code=?')
 for (const item of JSON.parse(row.items)) update.run(item.qty,row.store,item.code)
 db.prepare('UPDATE orders SET status=?,payment=? WHERE id=?').run(status,status==='expired'?'expired':'unpaid',row.id)
}
function expire(db, now) {
 const stale = db.prepare("SELECT * FROM orders WHERE status='pending_payment' AND expires<=?").all(now)
 for (const row of stale) release(db,row,'expired')
}
function orderView(row, customer) {
 const {customer:_,idem:__,qr,...rest} = row
 return {...rest,items:JSON.parse(row.items),...(customer?{qr}:{})}
}
export function run(db, action, input = {}, token = '', now = Date.now()) {
 const actor = token ? hash(token) : ''
 const user = actor && db.prepare('SELECT role,store FROM sessions WHERE token=? AND expires>?').get(actor,now)
 const authorized = (...allowed) => requireThat(user && allowed.includes(user.role),'Akses tidak diizinkan.',403)
 const audit = (type,id) => db.prepare('INSERT INTO audit(actor,action,entity,time) VALUES (?,?,?,?)').run(user.role,type,id,now)
 const store = () => {
  const row = typeof input.store==='string' && db.prepare('SELECT * FROM stores WHERE id=?').get(input.store)
  requireThat(row,'Cabang tidak ditemukan.',404)
  return row
 }
 switch(action) {
 case 'session': return {role:user?.role||null,store:user?.store||null}
 case 'login': {
  requireThat(process.env.SCANPAY_DEMO !== '0','Akun demo dinonaktifkan.',403)
  requireThat(Object.hasOwn(roles,input.role),'Peran tidak valid.')
  const branch = input.store || 'kemang'
  requireThat(['kemang','tebet','menteng'].includes(branch),'Cabang tidak valid.')
  const next = randomBytes(32).toString('hex')
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(now)
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(next),input.role,branch,now+86400000)
  return {token:next,role:input.role,store:branch}
 }
 case 'logout':
  db.prepare('DELETE FROM sessions WHERE token=?').run(actor)
  return {}
 case 'catalog': return tx(db,()=>{
  expire(db,now)
  const stores = db.prepare('SELECT * FROM stores WHERE active=1 ORDER BY id').all()
  const active = stores.find(s=>s.id===input.store) || stores[0]
  const products = active ? db.prepare('SELECT * FROM products WHERE store=? ORDER BY rowid').all(active.id) : []
  return {stores,active,products}
 })
 case 'checkout':
  authorized('customer')
  return tx(db,()=>{
   expire(db,now)
   requireThat(input.method==='cash','Pembayaran digital belum tersedia.')
   requireThat(typeof input.key==='string' && /^[a-f0-9-]{36}$/i.test(input.key),'Kunci checkout tidak valid.')
   const previous = db.prepare('SELECT * FROM orders WHERE customer=? AND idem=?').get(actor,input.key)
   if(previous) return orderView(previous,true)
   const branch=store()
   requireThat(branch.active,'Cabang sedang tutup.')
   requireThat(Array.isArray(input.items) && input.items.length>0 && input.items.length<=60,'Keranjang tidak valid.')
   const visited=new Set()
   const reserve=db.prepare('UPDATE products SET stock=stock-? WHERE store=? AND code=? AND stock>=?')
   const items=input.items.map(item=>{
    requireThat(item && typeof item.code==='string' && Number.isInteger(item.qty) && item.qty>0 && item.qty<=99 && !visited.has(item.code),'Jumlah atau kode barang tidak valid.')
    visited.add(item.code)
    const product=db.prepare('SELECT * FROM products WHERE store=? AND code=?').get(branch.id,item.code)
    requireThat(product && reserve.run(item.qty,branch.id,item.code,item.qty).changes===1,'Stok berubah. Periksa keranjang.',409)
    return {code:product.code,name:product.name,price:product.price,qty:item.qty}
   })
   const total=items.reduce((sum,item)=>sum+item.price*item.qty,0)
   const id=randomUUID()
   const rate=db.prepare("SELECT value FROM settings WHERE key='commission'").get().value
   db.prepare(`INSERT INTO orders(id,customer,store,idem,qr,status,payment,verification,total,created,expires,items,commission)
     VALUES (?,?,?,?,?,'pending_payment','unpaid','pending',?,?,?,?,?)`).run(id,actor,branch.id,input.key,randomBytes(24).toString('hex'),total,now,now+900000,JSON.stringify(items),Math.floor(total*rate/10000))
   audit('checkout',id)
   return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id),true)
  })
 case 'orders':
  authorized('customer','cashier','manager','owner','admin')
  return tx(db,()=>{
   expire(db,now)
   const base='SELECT orders.* FROM orders JOIN stores ON stores.id=orders.store'
   const order=' ORDER BY created DESC LIMIT 100'
   let rows
   if(user.role==='customer') rows=db.prepare(base+' WHERE customer=?'+order).all(actor)
   else if(user.role==='admin') rows=db.prepare(base+order).all()
   else if(user.role==='owner') rows=db.prepare(base+' WHERE merchant=(SELECT merchant FROM stores WHERE id=?)'+order).all(user.store)
   else rows=db.prepare(base+' WHERE store=?'+order).all(user.store)
   return rows.map(row=>orderView(row,user.role==='customer' && row.status==='pending_payment'))
  })
 case 'cancel':
  authorized('customer')
  return tx(db,()=>{
   expire(db,now)
   const row=db.prepare('SELECT * FROM orders WHERE id=? AND customer=?').get(String(input.id),actor)
   requireThat(row?.status==='pending_payment','Pesanan tidak dapat dibatalkan.',409)
   release(db,row,'cancelled')
   audit('cancel',row.id)
   return {}
  })
 case 'ticket':
  authorized('cashier','manager')
  return tx(db,()=>{
   expire(db,now)
   const row=db.prepare('SELECT * FROM orders WHERE qr=? AND store=?').get(String(input.qr).trim(),user.store)
   requireThat(row?.status==='pending_payment','Kode tidak berlaku di cabang ini atau transaksi sudah ditutup.',404)
   return orderView(row,false)
  })
 case 'cash':
  authorized('cashier','manager')
  return tx(db,()=>{
   expire(db,now)
   const row=db.prepare('SELECT * FROM orders WHERE qr=? AND store=?').get(String(input.qr).trim(),user.store)
   requireThat(row?.status==='pending_payment','Kode tidak berlaku di cabang ini atau transaksi sudah ditutup.',409)
   requireThat(input.verified===true,'Verifikasi semua barang terlebih dahulu.')
   requireThat(Number.isSafeInteger(input.received) && input.received>=row.total && input.received<=1000000000,'Nominal tunai tidak valid.')
   db.prepare("UPDATE orders SET status='completed',payment='paid',verification='verified',received=?,completed=? WHERE id=?").run(input.received,now,row.id)
   audit('cash',row.id)
   return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(row.id),false)
  })
 case 'inventory': {
  authorized('manager','owner')
  const branch=store()
  const own=db.prepare('SELECT * FROM stores WHERE id=?').get(user.store)
  requireThat(user.role==='owner'?own.merchant===branch.merchant:own.id===branch.id,'Cabang di luar akses.',403)
  if(input.code===undefined) return db.prepare('SELECT * FROM products WHERE store=? ORDER BY name').all(branch.id)
  requireThat(typeof input.code==='string' && /^[A-Za-z0-9_.-]{4,64}$/.test(input.code),'Barcode tidak valid.')
  requireThat(typeof input.name==='string' && input.name.trim().length>0 && input.name.length<=100 && typeof input.category==='string' && input.category.trim().length>0 && input.category.length<=50,'Nama dan kategori wajib diisi.')
  requireThat(Number.isSafeInteger(input.price) && input.price>0 && input.price<=100000000 && Number.isSafeInteger(input.stock) && input.stock>=0 && input.stock<=1000000,'Harga atau stok tidak valid.')
  return tx(db,()=>{
   expire(db,now)
   db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,'📦') ON CONFLICT(store,code)
     DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,stock=excluded.stock`).run(branch.id,input.code,input.name.trim(),input.category.trim(),input.price,input.stock)
   audit('inventory',branch.id+'/'+input.code)
   return {}
  })
 }
 case 'branches': {
  authorized('manager','owner','admin')
  if(user.role==='admin') return db.prepare('SELECT * FROM stores ORDER BY merchant,name').all()
  return db.prepare(user.role==='owner'?'SELECT * FROM stores WHERE merchant=(SELECT merchant FROM stores WHERE id=?)':'SELECT * FROM stores WHERE id=?').all(user.store)
 }
 case 'admin':
  authorized('admin')
  return tx(db,()=>{
   if(input.store!==undefined){
    const branch=store()
    requireThat(typeof input.active==='boolean','Status cabang tidak valid.')
    db.prepare('UPDATE stores SET active=? WHERE id=?').run(Number(input.active),branch.id)
    audit('branch-status',branch.id)
   }
   if(input.commission!==undefined){
    requireThat(Number.isInteger(input.commission) && input.commission>=0 && input.commission<=10000,'Komisi tidak valid.')
    db.prepare("UPDATE settings SET value=? WHERE key='commission'").run(input.commission)
    audit('commission','settings')
   }
   return {commission:db.prepare("SELECT value FROM settings WHERE key='commission'").get().value,logs:db.prepare('SELECT action,entity,time,actor FROM audit ORDER BY id DESC LIMIT 20').all()}
  })
 default: throw new InputError('Rute tidak ditemukan.',404)
 }
}
