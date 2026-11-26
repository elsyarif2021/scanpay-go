import {Pool} from 'pg'

const connectionString=process.env.MERCHANT_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL
export const merchantConfigured=Boolean(connectionString)
const pool=connectionString?new Pool({connectionString,max:3,connectionTimeoutMillis:5000}):null
let ready:Promise<void>|undefined

export async function merchantDB(){
 if(!pool)throw new Error('Database mitra belum terhubung.')
 const db=pool
 ready??=(async()=>{
  const client=await db.connect()
  try {
   await client.query('BEGIN')
   await client.query('SELECT pg_advisory_xact_lock(65270183)')
   await client.query(`
    CREATE TABLE IF NOT EXISTS scanpay_merchants (
     id uuid PRIMARY KEY,
     owner_email text NOT NULL UNIQUE,
     name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
     address text NOT NULL CHECK (length(address) BETWEEN 1 AND 300),
     status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
     qris text,
     created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS scanpay_merchant_invoices (
     id uuid PRIMARY KEY,
     merchant_id uuid NOT NULL REFERENCES scanpay_merchants(id),
     merchant_name text NOT NULL,
     amount integer NOT NULL CHECK (amount BETWEEN 1 AND 10000000),
     method text NOT NULL CHECK (method IN ('cash','qris')),
     qris text,
     paid_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     CHECK ((method='qris')=(qris IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS scanpay_merchant_invoices_owner ON scanpay_merchant_invoices(merchant_id,created_at DESC)
   `)
   await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
 })().catch(error=>{ready=undefined;throw error})
 await ready
 return db
}

export function isUUID(value:unknown):value is string {
 return typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
}

export function validStaticQris(payload:unknown):payload is string {
 if(typeof payload!=='string'||payload.length>1024||!/^[\x20-\x7e]+$/.test(payload))return false
 const fields=new Map<string,string>()
 for(let i=0;i<payload.length;){
  const id=payload.slice(i,i+2),length=payload.slice(i+2,i+4)
  if(!/^\d{2}$/.test(id)||!/^\d{2}$/.test(length)||fields.has(id))return false
  const end=i+4+Number(length)
  if(end>payload.length||end===i+4)return false
  fields.set(id,payload.slice(i+4,end))
  i=end
 }
 if(fields.get('00')!=='01'||fields.get('01')!=='11'||fields.get('53')!=='360'||fields.get('58')!=='ID'||fields.has('54')||!fields.get('59')||!payload.slice(-8).startsWith('6304'))return false
 if(![...fields].some(([tag,value])=>Number(tag)>=26&&Number(tag)<=51&&/^00\d{2}(ID\.|COM\.)/.test(value)))return false
 let crc=0xffff
 for(const char of payload.slice(0,-4)){
  crc^=char.charCodeAt(0)<<8
  for(let bit=0;bit<8;bit++)crc=crc&0x8000?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff
 }
 return crc.toString(16).padStart(4,'0').toUpperCase()===payload.slice(-4).toUpperCase()
}
