import {randomUUID} from 'node:crypto'
import QRCode from 'qrcode'
import {auth,googleLoginConfigured} from '../../../lib/auth'
import {canManageDirectory} from '../../../lib/store-directory'
import {isUUID,merchantConfigured,merchantDB,validStaticQris} from '../../../lib/merchant-payments'

export const runtime='nodejs'
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
const fail=(error:string,status:number)=>response({error},status)
const identity=async()=>googleLoginConfigured?(await auth())?.user?.email?.trim().toLowerCase():undefined

export async function GET(req:Request){
 const bill=new URL(req.url).searchParams.get('tagihan')
 try{
  if(bill!==null){
   if(!isUUID(bill))return fail('Tagihan tidak ditemukan.',404)
   if(!merchantConfigured)return fail('Database mitra belum terhubung.',503)
   const db=await merchantDB()
   const {rows:[row]}=await db.query('SELECT id, merchant_name, amount, method, qris, paid_at FROM scanpay_merchant_invoices WHERE id=$1',[bill])
   if(!row)return fail('Tagihan tidak ditemukan.',404)
   const {qris,...publicBill}=row
   return response({...publicBill,qrImage:qris&&!row.paid_at?await QRCode.toDataURL(qris,{width:300,margin:4}):null})
  }
  const email=await identity()
  if(!email)return fail('Masuk dengan Google untuk membuka Dashboard Mitra.',401)
  if(!merchantConfigured)return fail('Database mitra belum terhubung.',503)
  const db=await merchantDB()
  const {rows:[merchant]}=await db.query('SELECT id,name,address,status,(qris IS NOT NULL) AS has_qris FROM scanpay_merchants WHERE owner_email=$1',[email])
  const admin=canManageDirectory(email)
  const invoices=merchant?.status==='approved'?(await db.query('SELECT id,amount,method,paid_at,created_at FROM scanpay_merchant_invoices WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 50',[merchant.id])).rows:[]
  const pending=admin?(await db.query("SELECT id,name,address,owner_email FROM scanpay_merchants WHERE status='pending' ORDER BY created_at LIMIT 100")).rows:[]
  return response({merchant:merchant??null,admin,invoices,pending})
 }catch{return fail('Data mitra belum dapat dimuat.',503)}
}

export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return fail('Asal permintaan tidak valid.',403)
 const email=await identity()
 if(!email)return fail('Masuk dengan Google terlebih dahulu.',401)
 if(!merchantConfigured)return fail('Database mitra belum terhubung.',503)
 const raw=await req.text()
 if(raw.length>5000)return fail('Permintaan terlalu panjang.',413)
 let data
 try{data=JSON.parse(raw)}catch{return fail('Data tidak valid.',400)}
 if(!data||typeof data!=='object'||Array.isArray(data))return fail('Data tidak valid.',400)
 try{
  const db=await merchantDB()
  if(data.action==='register'){
   const name=typeof data.name==='string'?data.name.trim():''
   const address=typeof data.address==='string'?data.address.trim():''
   if(!name||name.length>100||!address||address.length>300)return fail('Nama dan alamat usaha wajib diisi.',400)
   await db.query('INSERT INTO scanpay_merchants(id,owner_email,name,address) VALUES($1,$2,$3,$4) ON CONFLICT(owner_email) DO NOTHING',[randomUUID(),email,name,address])
   return response({ok:true})
  }
  if(data.action==='approve'){
   if(!canManageDirectory(email))return fail('Akses admin diperlukan.',403)
   if(!isUUID(data.id))return fail('ID mitra tidak valid.',400)
   const result=await db.query("UPDATE scanpay_merchants SET status='approved' WHERE id=$1",[data.id])
   return result.rowCount?response({ok:true}):fail('Mitra tidak ditemukan.',404)
  }
  const {rows:[merchant]}=await db.query("SELECT id FROM scanpay_merchants WHERE owner_email=$1 AND status='approved'",[email])
  if(!merchant)return fail('Usaha perlu disetujui sebelum menerima pembayaran.',403)
  if(data.action==='qris'){
   if(!validStaticQris(data.qris))return fail('Gunakan gambar QRIS statis resmi usaha yang berlaku tanpa nominal tetap.',400)
   await db.query('UPDATE scanpay_merchants SET qris=$1 WHERE id=$2',[data.qris,merchant.id])
   return response({ok:true})
  }
  if(data.action==='invoice'){
   if(!isUUID(data.id)||!Number.isSafeInteger(data.amount)||data.amount<1||data.amount>10000000||!['cash','qris'].includes(data.method))return fail('Masukkan nominal Rp1–Rp10.000.000 dan metode yang valid.',400)
   const result=await db.query(`
    INSERT INTO scanpay_merchant_invoices(id,merchant_id,merchant_name,amount,method,qris)
    SELECT $1,id,name,$2,$3::text,CASE WHEN $3::text='qris' THEN qris ELSE NULL END
    FROM scanpay_merchants WHERE id=$4 AND ($3::text='cash' OR qris IS NOT NULL)
    ON CONFLICT (id) DO NOTHING
   `,[data.id,data.amount,data.method,merchant.id])
   if(result.rowCount)return response({id:data.id},201)
   const existing=await db.query('SELECT id FROM scanpay_merchant_invoices WHERE id=$1 AND merchant_id=$2 AND amount=$3 AND method=$4',[data.id,merchant.id,data.amount,data.method])
   return existing.rowCount?response({id:data.id}):fail('Tagihan tidak bisa dibuat. Periksa konfigurasi QRIS.',409)
  }
  if(data.action==='confirm'){
   if(!isUUID(data.id)||data.received!==true)return fail('Konfirmasi penerimaan pembayaran diperlukan.',400)
   const result=await db.query('UPDATE scanpay_merchant_invoices SET paid_at=COALESCE(paid_at,now()) WHERE id=$1 AND merchant_id=$2',[data.id,merchant.id])
   return result.rowCount?response({ok:true}):fail('Tagihan tidak ditemukan.',404)
  }
  return fail('Aksi tidak dikenal.',400)
 }catch{return fail('Perubahan belum tersimpan. Coba lagi.',503)}
}
