import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openDB,run } from '../lib/db.mjs'

const store='kemang',code='8991002100012',now=Date.now()
function setup(t) {
 const db=openDB(':memory:')
 t.after(()=>db.close())
 const call=(action,input,token,time=now)=>run(db,action,input,token,time)
 const login=(role,branch=store)=>call('login',{role,store:branch}).token
 const create=(token,qty=2,key=randomUUID())=>call('checkout',{store,key,method:'cash',items:[{code,qty,price:1}]},token)
 const left=(time=now)=>call('catalog',{store},'',time).products.find(p=>p.code===code).stock
 return {call,login,create,left}
}
test('checkout menggunakan harga server dan idempotensi',t=>{
 const {login,create,left}=setup(t)
 const customer=login('customer'),key=randomUUID()
 const first=create(customer,2,key)
 assert.equal(first.total,37000)
 assert.equal(first.commission,740)
 assert.equal(first.id,create(customer,2,key).id)
 assert.equal(left(),30)
})
test('stok tidak menjadi negatif dan kegagalan tidak mengurangi stok',t=>{
 const {login,create,left,call}=setup(t)
 const a=login('customer'),b=login('customer')
 assert.throws(()=>call('checkout',{store,key:randomUUID(),method:'cash',items:[{code,qty:2},{code:'absent',qty:1}]},a),{status:409})
 assert.equal(left(),32)
 create(a,30)
 assert.throws(()=>create(b,3),{status:409})
 assert.equal(left(),2)
})
test('kasir dibatasi cabang dan QR ditolak setelah lunas',t=>{
 const {call,login,create,left}=setup(t)
 const customer=login('customer'), cashier=login('cashier'), other=login('cashier','tebet')
 const order=create(customer)
 assert.equal(call('orders',{},other).length,0)
 assert.equal(call('orders',{},cashier)[0].qr,undefined)
 assert.throws(()=>call('ticket',{qr:order.qr},other),{status:404})
 assert.throws(()=>call('cash',{qr:order.qr,received:50000,verified:true},customer),{status:403})
 assert.throws(()=>call('cash',{qr:order.qr,received:50000,verified:false},cashier),{status:400})
 assert.equal(call('ticket',{qr:order.qr},cashier).items.length,1)
 const receipt=call('cash',{qr:order.qr,received:50000,verified:true},cashier)
 assert.equal(receipt.payment,'paid')
 assert.equal(receipt.verification,'verified')
 assert.equal(receipt.received-receipt.total,13000)
 assert.equal(left(),30)
 assert.throws(()=>call('cash',{qr:order.qr,received:50000,verified:true},cashier),{status:409})
})
test('pembatalan serta kedaluwarsa melepas reservasi satu kali',t=>{
 const {call,login,create,left}=setup(t)
 const token=login('customer')
 call('cancel',{id:create(token).id},token)
 assert.equal(left(),32)
 create(token,3)
 assert.equal(left(),29)
 assert.equal(left(now+900001),32)
 assert.equal(left(now+900002),32)
 assert.equal(call('orders',{},token,now+900002).filter(o=>o.status==='expired').length,1)
})
test('akses admin, inventaris dan checkout digital dibatasi',t=>{
 const {call,login,create}=setup(t)
 const owner=login('owner'), admin=login('admin'), customer=login('customer')
 assert.throws(()=>call('inventory',{store:'menteng'},owner),{status:403})
 assert.throws(()=>call('admin',{commission:100},owner),{status:403})
 assert.throws(()=>call('checkout',{store,key:randomUUID(),method:'qris'},customer),{status:400})
 call('admin',{store,active:false},admin)
 assert.throws(()=>create(customer),{status:400})
})
