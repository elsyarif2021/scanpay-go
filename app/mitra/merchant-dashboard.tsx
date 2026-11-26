'use client'
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react'
import {ArrowLeft,Banknote,ExternalLink,QrCode,Store} from 'lucide-react'

type Merchant={id:string;name:string;address:string;status:'pending'|'approved';has_qris:boolean}
type Invoice={id:string;amount:number;method:'cash'|'qris';paid_at:string|null}
type Data={merchant:Merchant|null;admin:boolean;invoices:Invoice[];pending:{id:string;name:string;address:string;owner_email:string}[]}
type PublicInvoice=Invoice & {merchant_name:string;qrImage:string|null}
const rupiah=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0})
const methodName={cash:'Tunai',qris:'QRIS'}

async function readResponse<T>(response:Response):Promise<T>{
 const value=await response.json()
 if(!response.ok)throw new Error(value.error||'Permintaan gagal.')
 return value
}

export function MerchantDashboard({invoiceId}:{invoiceId?:string}){
 const [data,setData]=useState<Data|null>(null)
 const [bill,setBill]=useState<PublicInvoice|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const [method,setMethod]=useState<'cash'|'qris'>('cash')
 const [newInvoice,setNewInvoice]=useState('')
 const invoiceDraft=useRef<{id:string;amount:number;method:string}|null>(null)
 const reload=useCallback(async()=>{
  try{
   if(invoiceId)setBill(await readResponse(await fetch('/api/mitra?tagihan='+encodeURIComponent(invoiceId),{cache:'no-store'})))
   else setData(await readResponse(await fetch('/api/mitra',{cache:'no-store'})))
   setError('')
  }catch(error){setError(error instanceof Error?error.message:'Data belum dapat dimuat.')}
 },[invoiceId])
 useEffect(()=>{void reload()},[reload])
 async function act(body:object){
  return readResponse<{id?:string}>(await fetch('/api/mitra',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))
 }
 async function perform(fn:()=>Promise<void>){
  if(busy)return
  setBusy(true);setError('');setNotice('')
  try{await fn();await reload()}catch(error){setError(error instanceof Error?error.message:'Perubahan belum tersimpan.')}
  finally{setBusy(false)}
 }
 function submit(event:FormEvent<HTMLFormElement>,fn:(fields:FormData)=>Promise<void>){
  event.preventDefault()
  const form=new FormData(event.currentTarget)
  void perform(()=>fn(form))
 }
 return <main className="merchant-main">
  <a className="secondary directions" href={invoiceId?'/':'/?view=profil'}><ArrowLeft size={16}/> ScanPay</a>
  <div className="heading"><div><h1>{invoiceId?'Tagihan ScanPay':'Dashboard Mitra'}</h1><p>{invoiceId?'Periksa nama usaha dan nominal sebelum membayar.':'Untuk pemilik toko, warung, dan pedagang.'}</p></div></div>
  {error&&<p className="banner" role="alert">{error}</p>}
  {notice&&<p className="banner" role="status">{notice}</p>}
  {invoiceId?<>
   {bill&&<section className="panel profile">
    <div className="tile-icon">{bill.method==='cash'?<Banknote/>:<QrCode/>}</div>
    <h2>{bill.merchant_name}</h2>
    <p>{methodName[bill.method]} · {bill.paid_at?'Dikonfirmasi penjual':'Menunggu konfirmasi penjual'}</p>
    <h2>{rupiah.format(bill.amount)}</h2>
    {!bill.paid_at&&bill.method==='cash'&&<p>Bayar tunai langsung kepada penjual.</p>}
    {!bill.paid_at&&bill.qrImage&&<div className="qr">
     <img src={bill.qrImage} alt={'QRIS resmi '+bill.merchant_name} width={260} height={260}/>
     <p>Pindai dengan aplikasi yang mendukung QRIS. Masukkan nominal di atas dan periksa nama penerima di aplikasi pembayaran.</p>
    </div>}
    <button className="secondary stretch" onClick={()=>void reload()}>Perbarui status</button>
   </section>}
   {!bill&&!error&&<p role="status">Memuat tagihan…</p>}
  </>:<>
   {!data&&(!error?<p role="status">Memuat dashboard…</p>:<a className="primary directions" href="/?view=profil">Ke Profil</a>)}
   {data&&!data.merchant&&<form className="panel profile" onSubmit={event=>submit(event,async fields=>{
    await act({action:'register',name:fields.get('name'),address:fields.get('address')})
    setNotice('Pendaftaran dikirim ke admin ScanPay.')
   })}>
    <div className="tile-icon"><Store/></div><h2>Daftarkan usaha</h2>
    <label className="field">Nama usaha<input name="name" required maxLength={100}/></label>
    <label className="field">Alamat usaha<input name="address" required maxLength={300}/></label>
    <button className="primary" disabled={busy}>Daftar sebagai mitra</button>
   </form>}
   {data?.merchant?.status==='pending'&&<section className="panel profile"><h2>{data.merchant.name}</h2><p>Menunggu persetujuan admin ScanPay.</p></section>}
   {data?.merchant?.status==='approved'&&<>
    <div className="section-title"><h2>{data.merchant.name}</h2></div>
    <div className="merchant-grid">
     <form className="panel" onSubmit={event=>submit(event,async fields=>{
      const amount=Number(fields.get('amount'))
      if(!invoiceDraft.current||invoiceDraft.current.amount!==amount||invoiceDraft.current.method!==method) invoiceDraft.current={id:crypto.randomUUID(),amount,method}
      const result=await act({action:'invoice',...invoiceDraft.current})
      if(result.id)setNewInvoice(result.id)
      invoiceDraft.current=null
      setNotice('Tagihan siap ditunjukkan atau dibagikan kepada pembeli.')
     })}>
      <h2>Buat tagihan</h2>
      <label className="field">Nominal (Rp)<input name="amount" type="number" min="1" max="10000000" step="1" required/></label>
      <label className="field">Metode bayar<select value={method} onChange={event=>setMethod(event.target.value==='qris'?'qris':'cash')}>
       <option value="cash">Tunai</option><option value="qris" disabled={!data.merchant.has_qris}>QRIS</option>
      </select></label>
      <button className="primary" disabled={busy}>Buat tagihan</button>
      {newInvoice&&<a className="secondary directions stretch" href={'/mitra?tagihan='+newInvoice} target="_blank" rel="noopener noreferrer">Buka tagihan terbaru <ExternalLink size={15}/></a>}
     </form>
     <form className="panel" onSubmit={event=>submit(event,async fields=>{
      const file=fields.get('qris')
      if(!(file instanceof File)||!file.size||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Pilih gambar PNG, JPG, atau WebP hingga 5 MB.')
      const {BrowserQRCodeReader}=await import('@zxing/browser')
      const path=URL.createObjectURL(file)
      let qris
      try{qris=(await new BrowserQRCodeReader().decodeFromImageUrl(path)).getText()}
      catch{throw new Error('Kode QR belum bisa dibaca. Gunakan gambar QRIS resmi yang jelas.')}
      finally{URL.revokeObjectURL(path)}
      await act({action:'qris',qris})
      setNotice('QRIS usaha tersimpan untuk tagihan berikutnya.')
     })}>
      <h2>QRIS usaha</h2>
      <p>{data.merchant.has_qris?'QRIS statis sudah terpasang.':'Gunakan QRIS statis resmi yang diterbitkan untuk usaha ini.'} Cek pembayaran di aplikasi merchant sebelum mengonfirmasi.</p>
      <label className="field">Gambar QRIS<input name="qris" type="file" accept="image/png,image/jpeg,image/webp" required/></label>
      <button className="secondary" disabled={busy}>{data.merchant.has_qris?'Ganti QRIS':'Simpan QRIS'}</button>
     </form>
    </div>
    <div className="section-title"><h2>Tagihan terbaru</h2><button className="secondary" disabled={busy} onClick={()=>void reload()}>Muat ulang</button></div>
    {data.invoices.length===0&&<div className="empty">Belum ada tagihan.</div>}
    <div className="order-list">{data.invoices.map(invoice=><article className="panel merchant-invoice" key={invoice.id}>
     <div><strong>{rupiah.format(invoice.amount)}</strong><p>{methodName[invoice.method]} · {invoice.paid_at?'Dikonfirmasi':'Belum dikonfirmasi'}</p></div>
     <a className="secondary directions" href={'/mitra?tagihan='+invoice.id} target="_blank" rel="noopener noreferrer">Lihat tagihan</a>
     {!invoice.paid_at&&<button className="primary" disabled={busy} onClick={()=>{
      if(window.confirm(invoice.method==='qris'?'Sudah cek dana masuk dengan nominal yang benar di aplikasi merchant?':'Uang tunai sudah diterima dengan nominal yang benar?'))void perform(async()=>{
       await act({action:'confirm',id:invoice.id,received:true});setNotice('Penerimaan pembayaran dicatat.')
      })
     }}>Konfirmasi diterima</button>}
    </article>)}</div>
   </>}
   {data?.admin&&<>
    <div className="section-title"><h2>Pengajuan mitra</h2></div>
    {!data.pending.length&&<div className="empty">Belum ada pengajuan.</div>}
    <div className="order-list">{data.pending.map(item=><article className="panel merchant-invoice" key={item.id}>
     <div><strong>{item.name}</strong><p>{item.address} · {item.owner_email}</p></div>
     <button className="primary" disabled={busy} onClick={()=>{
      if(window.confirm('Setujui '+item.name+' sebagai mitra ScanPay?'))void perform(async()=>{await act({action:'approve',id:item.id});setNotice('Mitra disetujui.')})
     }}>Setujui</button>
    </article>)}</div>
   </>}
  </>}
 </main>
}
