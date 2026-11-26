import { Pool } from 'pg'
import { openDB,run,InputError } from './db.mjs'

let pool
let schemaReady
let local
async function initialize() {
 await pool.query(`CREATE TABLE IF NOT EXISTS scanpay_demo_snapshot (
   id integer PRIMARY KEY CHECK (id = 1),
   payload bytea
 )`)
 await pool.query('INSERT INTO scanpay_demo_snapshot (id) VALUES (1) ON CONFLICT DO NOTHING')
}
export async function execute(action,input,token) {
 const connectionString=process.env.POSTGRES_URL || process.env.DATABASE_URL
 if(!connectionString) {
  if(process.env.VERCEL!=='1') return run(local??=openDB(),action,input,token)
  if(action==='session') return {role:null,store:null,readOnly:true}
  if(action!=='catalog') throw new InputError('Demo transaksi menunggu konfigurasi database.',503)
  const catalog=openDB(':memory:')
  try { return run(catalog,action,input,token) }
  finally { catalog.close() }
 }
 pool??=new Pool({connectionString,max:3,connectionTimeoutMillis:8000})
 schemaReady??=initialize().catch(error=>{schemaReady=undefined;throw error})
 await schemaReady
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout = '5s'")
  const {rows:[{payload}]}=await client.query('SELECT payload FROM scanpay_demo_snapshot WHERE id = 1 FOR UPDATE')
  const db=openDB(':memory:')
  try {
   if(payload)db.deserialize(payload)
   const counter=db.prepare('SELECT total_changes() AS changes')
   const before=counter.get().changes
   const result=run(db,action,input,token)
   if(!payload || counter.get().changes!==before)await client.query('UPDATE scanpay_demo_snapshot SET payload = $1 WHERE id = 1',[db.serialize()])
   await client.query('COMMIT')
   return result
  }finally{db.close()}
 }catch(error){
  await client.query('ROLLBACK')
  throw error
 }finally{
  client.release()
 }
}
