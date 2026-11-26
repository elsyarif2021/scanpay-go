import { NextRequest, NextResponse } from 'next/server'
import { InputError } from '../../../lib/db.mjs'
import { execute } from '../../../lib/hosted-db.mjs'
import { auth, googleLoginConfigured } from '../../../lib/auth'
import QRCode from 'qrcode'

export const runtime = 'nodejs'
export async function POST(req: NextRequest, {params}: {params: Promise<{action:string}>}) {
 try {
  const origin=req.headers.get('origin')
  if(origin && new URL(origin).host!==req.headers.get('host')) throw new InputError('Origin tidak valid.',403)
  const raw=await req.text()
  if(raw.length>32000) throw new InputError('Permintaan terlalu besar.',413)
  let body
  try { body=JSON.parse(raw) } catch { throw new InputError('JSON tidak valid.') }
  if(!body || Array.isArray(body) || typeof body!=='object') throw new InputError('Data tidak valid.')
  const {action}=await params
  const hosted=process.env.VERCEL==='1'
  if(action==='session' && hosted) {
   const identity=googleLoginConfigured ? (await auth())?.user : undefined
   return NextResponse.json({
    role:identity?'customer':null,
    store:null,
    name:identity?.name,
    readOnly:true,
    googleLoginConfigured,
   },{headers:{'Cache-Control':'no-store'}})
  }
  if(hosted && action!=='catalog') throw new InputError('Transaksi belum tersedia untuk toko yang belum terhubung.',503)
  const result=await execute(action,body,req.cookies.get('scanpay')?.value)
  if(action==='checkout' && result.status==='pending_payment') result.qrImage=await QRCode.toDataURL(result.qr,{width:200,margin:1})
  if(action==='orders' && Array.isArray(result)) await Promise.all(result.filter(row=>row.qr).map(async row=>{row.qrImage=await QRCode.toDataURL(row.qr,{width:200,margin:1})}))
  const token=action==='login'?result.token:undefined
  if(token) delete result.token
  const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}})
  if(token || action==='logout') response.cookies.set('scanpay',token||'',{httpOnly:true,sameSite:'strict',path:'/',secure:new URL(origin||req.url).protocol==='https:',maxAge:token?86400:0})
  return response
 } catch(error) {
  if(!(error instanceof InputError)) console.error(error)
  return NextResponse.json({error:error instanceof InputError?error.message:'Server sedang bermasalah.'},{status:error instanceof InputError?error.status:500,headers:{'Cache-Control':'no-store'}})
 }
}
