import {auth,googleLoginConfigured} from '../../../lib/auth'
import {canManageDirectory,directoryConfigured,listLocations,saveLocation,validateLocation} from '../../../lib/store-directory'

export const runtime='nodejs'
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})

export async function GET(){
 try{return reply(await listLocations())}
 catch{return reply({error:'Daftar toko sementara tidak dapat dimuat.'},503)}
}

export async function POST(req:Request){
 const origin=req.headers.get('origin')
 if(origin!==new URL(req.url).origin)return reply({error:'Asal permintaan tidak valid.'},403)
 const email=googleLoginConfigured?(await auth())?.user?.email:undefined
 if(!canManageDirectory(email))return reply({error:'Akses admin toko diperlukan.'},403)
 if(!directoryConfigured)return reply({error:'Database direktori belum terhubung.'},503)
 const raw=await req.text()
 if(raw.length>8000)return reply({error:'Data toko terlalu panjang.'},413)
 let payload
 try{payload=JSON.parse(raw)}catch{return reply({error:'Data toko tidak valid.'},400)}
 const location=validateLocation(payload)
 if(!location)return reply({error:'Periksa nama, alamat, dan tautan HTTPS Google Maps.'},400)
 try {
  const result=await saveLocation(location)
  return result?reply(result,location.id?200:201):reply({error:'Lokasi toko tidak ditemukan.'},404)
 } catch{return reply({error:'Perubahan toko belum tersimpan. Coba lagi.'},503)}
}
