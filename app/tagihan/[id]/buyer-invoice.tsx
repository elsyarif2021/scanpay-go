'use client'

import {useCallback,useEffect,useState} from 'react'
import {ArrowLeft,Banknote,QrCode} from 'lucide-react'

type Bill={merchant_name:string;amount:number;method:'cash'|'qris';paid_at:string|null;qrImage:string|null}
const rupiah=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0})

export function BuyerInvoice({id}:{id:string}){
 const [bill,setBill]=useState<Bill|null>(null)
 const [error,setError]=useState('')
 const reload=useCallback(async()=>{
  try{
   const response=await fetch('/api/mitra?tagihan='+encodeURIComponent(id),{cache:'no-store'})
   const result=await response.json()
   if(!response.ok)throw new Error(result.error)
   setBill(result);setError('')
  }catch(error){setError(error instanceof Error?error.message:'Tagihan tidak dapat dimuat.')}
 },[id])
 useEffect(()=>{
  if('serviceWorker' in navigator&&process.env.NODE_ENV==='production')void navigator.serviceWorker.register('/sw.js').catch(()=>{})
  void reload()
 },[reload])
 return <main className="merchant-main">
  <a className="secondary directions" href="/"><ArrowLeft size={16}/> ScanPay Pembeli</a>
  <div className="heading"><div><h1>Tagihan ScanPay</h1><p>Periksa nama usaha dan nominal sebelum membayar.</p></div></div>
  {error&&<p className="banner" role="alert">{error}</p>}
  {!bill&&!error&&<p role="status">Memuat tagihan…</p>}
  {bill&&<section className="panel profile">
   <div className="tile-icon">{bill.method==='cash'?<Banknote/>:<QrCode/>}</div>
   <h2>{bill.merchant_name}</h2>
   <p>{bill.method==='cash'?'Tunai':'QRIS'} · {bill.paid_at?'Dikonfirmasi penjual':'Menunggu konfirmasi penjual'}</p>
   <h2>{rupiah.format(bill.amount)}</h2>
   {!bill.paid_at&&bill.method==='cash'&&<p>Bayar tunai langsung kepada penjual.</p>}
   {!bill.paid_at&&bill.qrImage&&<div className="qr">
    <img src={bill.qrImage} alt={'QRIS resmi '+bill.merchant_name} width={260} height={260}/>
    <p>Pindai dengan aplikasi yang mendukung QRIS. Masukkan nominal di atas dan periksa nama penerima di aplikasi pembayaran.</p>
   </div>}
   <button className="secondary stretch" onClick={()=>void reload()}>Perbarui status</button>
  </section>}
 </main>
}
