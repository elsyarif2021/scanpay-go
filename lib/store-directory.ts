import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {storeLocations, type StoreLocation} from './store-locations'

const connectionString=process.env.DIRECTORY_POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL
export const directoryConfigured=Boolean(connectionString)
const pool=connectionString?new Pool({connectionString,max:3,connectionTimeoutMillis:5000}):null
let ready:Promise<void>|undefined

export function canManageDirectory(email?:string|null) {
 const configured=(process.env.SCANPAY_DIRECTORY_ADMINS||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean)
 return Boolean(email && configured.includes(email.trim().toLowerCase()))
}

async function database(){
 if(!pool)throw new Error('Database direktori belum dikonfigurasi.')
 const db=pool
 ready??=(async()=>{
  await db.query(`CREATE TABLE IF NOT EXISTS scanpay_store_directory (
   id uuid PRIMARY KEY,
   name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
   address text NOT NULL CHECK (length(address) BETWEEN 1 AND 300),
   directions text NOT NULL CHECK (length(directions) <= 2000),
   updated_at timestamptz NOT NULL DEFAULT now()
  )`)
  for(const row of storeLocations) {
   await db.query('INSERT INTO scanpay_store_directory(id,name,address,directions) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',[row.id,row.name,row.address,row.directions])
  }
 })().catch(error=>{ready=undefined;throw error})
 await ready
 return db
}

export async function listLocations():Promise<StoreLocation[]>{
 if(!directoryConfigured)return storeLocations
 const db=await database()
 const result=await db.query<StoreLocation>('SELECT id,name,address,directions FROM scanpay_store_directory ORDER BY lower(name),id')
 return result.rows
}

export function validateLocation(value:unknown) {
 if(!value || typeof value!=='object')return null
 const {id,name,address,directions}=value as Record<string, unknown>
 if(id!==undefined && (typeof id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))return null
 if(typeof name!=='string'||!name.trim()||name.trim().length>100||typeof address!=='string'||!address.trim()||address.trim().length>300)return null
 if(directions!==undefined && (typeof directions!=='string'||directions.trim().length>2000))return null
 const link=typeof directions==='string'?directions.trim():''
 if(link){
  try {
   const url=new URL(link)
   const googleMaps=['www.google.com','maps.google.com','www.google.co.id'].includes(url.hostname) && (url.pathname==='/maps'||url.pathname.startsWith('/maps/')||url.hostname==='maps.google.com')
   const shortLink=url.hostname==='maps.app.goo.gl' && url.pathname.length>1
   if(url.protocol!=='https:'||url.username||url.password||url.port||(!googleMaps&&!shortLink))return null
  }catch{return null}
 }
 return {id:typeof id==='string'?id:undefined,name:name.trim(),address:address.trim(),directions:link}
}

export async function saveLocation(location:NonNullable<ReturnType<typeof validateLocation>>){
 const db=await database()
 const {id,name,address,directions}=location
 const result=id
  ?await db.query<StoreLocation>('UPDATE scanpay_store_directory SET name=$2,address=$3,directions=$4,updated_at=now() WHERE id=$1 RETURNING id,name,address,directions',[id,name,address,directions])
  :await db.query<StoreLocation>('INSERT INTO scanpay_store_directory(id,name,address,directions) VALUES($1,$2,$3,$4) RETURNING id,name,address,directions',[randomUUID(),name,address,directions])
 return result.rows[0]
}
