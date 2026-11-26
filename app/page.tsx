'use client'
import {useState,useEffect,useRef,useCallback, type FormEvent} from 'react'
import {ScanLine, LayoutGrid, Store, History, UserRound, ShoppingBag, ChevronDown, Search, ArrowRight, MapPin, Plus, Minus, Sun, Moon, PanelLeftClose, Menu, X, Camera, Barcode, CreditCard, Banknote, ReceiptText, Download, CircleCheck, ShieldCheck, WifiOff, Package, Coffee, Apple, Sandwich, ChevronRight, QrCode} from 'lucide-react'
import {draftDB,type Draft} from '../lib/draft'
type Product={store:string;code:string;name:string;category:string;price:number;stock:number;icon:string}
type Branch={id:string;name:string;merchant:string;area:string;active:number}
type Order={id:string;store:string;status:string;payment:string;verification:string;total:number;commission:number;received:number|null;created:number;expires:number;qr?:string;qrImage?:string;items:{code:string;name:string;price:number;qty:number}[]}
type Session={role:string|null;store:string|null;readOnly?:boolean}
type InstallEvent=Event & {prompt:()=>Promise<void>}
type AdminData={commission:number;logs:{action:string;entity:string;time:number;actor:string}[]}
const money=(v:number)=>'Rp'+new Intl.NumberFormat('id-ID').format(v)
const date=(ms:number)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(ms)
const labels:Record<string,string>={customer:'Pelanggan',cashier:'Kasir',manager:'Manajer',owner:'Pemilik merchant',admin:'Super admin',pending_payment:'Menunggu pembayaran',completed:'Selesai',cancelled:'Dibatalkan',expired:'Kedaluwarsa'}
const nav=[['Beranda',LayoutGrid],['Toko',Store],['Scan',ScanLine],['Riwayat',History],['Profil',UserRound]] as const
const categories=[['Semua',LayoutGrid],['Makanan',Sandwich],['Minuman',Coffee],['Camilan',Package],['Buah & Sayur',Apple]] as const
const sample=['8991002100012','8991002100029','8991002100036']
async function api<T>(action:string,data:object={}):Promise<T>{
 const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store'})
 const payload=await r.json()
 if(!r.ok) throw new Error(payload.error)
 return payload
}
function exportCSV(rows:Order[]) {
 const lines=['Nomor,Cabang,Status,Total IDR,Komisi IDR',...rows.map(o=>[o.id,o.store,o.status,o.total,o.commission].join(','))]
 const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}))
 const a=document.createElement('a');a.href=url;a.download='transaksi-scanpay.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function Scanner({detected}:{detected:(code:string)=>void}) {
 const video=useRef<HTMLVideoElement>(null)
 const controls=useRef<{stop:()=>void}|null>(null)
 const generation=useRef(0)
 const [camera,setCamera]=useState(false)
 const [error,setError]=useState('')
 const [code,setCode]=useState('')
 useEffect(()=>()=>{generation.current++;controls.current?.stop()},[])
 async function start(){
  setError('');setCamera(true)
  const id=++generation.current
  try{
   const {BrowserMultiFormatReader}=await import('@zxing/browser')
   if(id!==generation.current || !video.current) return
   const reader=new BrowserMultiFormatReader()
   const stop=await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},video.current,(result,_,controller)=>{
    if(!result||generation.current!==id) return
    generation.current++;controller.stop();setCamera(false);detected(result.getText())
   })
   if(id!==generation.current) stop.stop();else controls.current=stop
  } catch{if(id===generation.current){setCamera(false);setError('Kamera tidak tersedia. Izinkan akses kamera atau masukkan kode manual.')}}
 }
 return <>
  <div className="viewfinder">{camera?<video ref={video} muted playsInline/>:<ScanLine size={64}/>}<i/></div>
  {error&&<p className="error">{error}</p>}
  <button className="secondary stretch" onClick={()=>camera?(generation.current++,controls.current?.stop(),setCamera(false)):void start()}><Camera size={17}/>{camera?'Matikan kamera':'Aktifkan kamera'}</button>
  <form className="inline" onSubmit={e=>{e.preventDefault();detected(code.trim())}}>
   <input aria-label="Kode barcode atau QR" placeholder="Masukkan kode manual" value={code} onChange={e=>setCode(e.target.value)} required maxLength={64}/>
   <button className="primary">Cari</button>
  </form>
 </>
}
export default function Page(){
 const [view,setView]=useState('Beranda')
 const [session,setSession]=useState<Session>({role:null,store:null})
 const [stores,setStores]=useState<Branch[]>([])
 const [products,setProducts]=useState<Product[]>([])
 const [draft,setDraft]=useState<Draft|null>(null)
 const [orders,setOrders]=useState<Order[]>([])
 const [branches,setBranches]=useState<Branch[]>([])
 const [admin,setAdmin]=useState<AdminData|null>(null)
 const [stock,setStock]=useState<Product[]>([])
 const [branch,setBranch]=useState('kemang')
 const [staffBranch,setStaffBranch]=useState('kemang')
 const [category,setCategory]=useState('Semua')
 const [query,setQuery]=useState('')
 const [modal,setModal]=useState('')
 const [selected,setSelected]=useState<Product|null>(null)
 const [qty,setQty]=useState(1)
 const [receipt,setReceipt]=useState<Order|null>(null)
 const [ticket,setTicket]=useState<Order|null>(null)
 const [qr,setQR]=useState('')
 const [verified,setVerified]=useState<string[]>([])
 const [received,setReceived]=useState('')
 const [toast,setToast]=useState('')
 const [failure,setFailure]=useState('')
 const [online,setOnline]=useState(true)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [dark,setDark]=useState(false)
 const [compact,setCompact]=useState(false)
 const [install,setInstall]=useState<InstallEvent|null>(null)
 const [edit,setEdit]=useState<Product|null>(null)
 const [filter,setFilter]=useState('all')
 const staff=!!session.role&&session.role!=='customer'
 const active=stores.find(s=>s.id===branch)
 const notify=useCallback((message:string)=>setToast(message),[])
 const reload=useCallback(async(id:string)=>{
  const data=await api<{stores:Branch[];active?:Branch;products:Product[]}>('catalog',{store:id})
  setStores(data.stores);setProducts(data.products);setBranch(data.active?.id||id);setFailure('')
 },[])
 useEffect(()=>{
  let cancelled=false
  draftDB().catch(()=>undefined).then(async saved=>{
   if(cancelled)return
   const id=saved?.store||'kemang'
   setDraft(saved||{store:id,items:{},key:crypto.randomUUID()})
   try{const result=await api<Session>('session');if(!cancelled){setSession(result);if(result.store)setStaffBranch(result.store);if(result.role&&result.role!=='customer')setView('Dashboard')}await reload(id)}
   catch(e){if(!cancelled)setFailure((e as Error).message)}
   finally{if(!cancelled)setLoading(false)}
  })
  const connectivity=()=>{setOnline(navigator.onLine)}
  connectivity();window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity)
  const prompt=(e:Event)=>{e.preventDefault();setInstall(e as InstallEvent)}
  window.addEventListener('beforeinstallprompt',prompt)
  setDark(localStorage.getItem('scanpay-theme')==='dark')
  if('serviceWorker' in navigator && process.env.NODE_ENV==='production') navigator.serviceWorker.register('/sw.js').catch(()=>{})
  return ()=>{cancelled=true;window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);window.removeEventListener('beforeinstallprompt',prompt)}
 },[reload])
 useEffect(()=>{if(draft)draftDB(draft).catch(()=>{})},[draft])
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('scanpay-theme',dark?'dark':'light')},[dark])
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3600);return ()=>clearTimeout(t)},[toast])
 const refreshOrders=useCallback(async()=>{if(session.role){const data=await api<Order[]>('orders');setOrders(data);setReceipt(current=>current?data.find(row=>row.id===current.id)||current:current)}},[session.role])
 useEffect(()=>{
  if(!session.role||!online)return
  refreshOrders().catch(()=>{})
  const timer=setInterval(()=>refreshOrders().catch(()=>{}),5000)
  return ()=>clearInterval(timer)
 },[refreshOrders,session.role,online])
 useEffect(()=>{
  if(!online||!session.role||session.role==='customer'||session.role==='cashier')return
  api<Branch[]>('branches').then(setBranches).catch(e=>notify(e.message))
  if(session.role==='admin')api<AdminData>('admin').then(setAdmin).catch(e=>notify(e.message))
 },[session.role,session.store,online,notify])
 useEffect(()=>{
  if((session.role==='owner'||session.role==='manager')&&online)api<Product[]>('inventory',{store:staffBranch}).then(setStock).catch(e=>notify(e.message))
 },[staffBranch,session.role,online,notify])
 useEffect(()=>{if(online&&failure)void reload(branch).catch(()=>{})},[online,branch,failure,reload])
 const items=draft?.store===branch?draft.items:{}
 const count=Object.values(items).reduce((sum,n)=>sum+n,0)
 const cart=products.filter(p=>items[p.code])
 const total=cart.reduce((sum,p)=>sum+p.price*items[p.code],0)
 const matching=products.filter(p=>(category==='Semua'||p.category===category)&&[p.name,p.category,p.code].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
 const filteredOrders=orders.filter(o=>filter==='all'||filter===o.status)
 const done=orders.filter(o=>o.status==='completed')
 const sales=done.reduce((sum,o)=>sum+o.total,0)
 const commission=done.reduce((sum,o)=>sum+o.commission,0)
 function go(next:string){setQuery('');setCategory('Semua');setView(next);if(next==='Scan')setModal('scan')}
 function quantity(product:Product,value:number){
  const next={...items}
  if(value>(items[product.code]||0)&&(value>product.stock||value>99)){notify('Jumlah melebihi stok tersedia.');return}
  if(value<=0)delete next[product.code];else next[product.code]=value
  setDraft({store:branch,items:next,key:crypto.randomUUID()})
 }
 async function perform(fn:()=>Promise<void>){
  if(busy)return
  setBusy(true)
  try{await fn()}catch(e){notify((e as Error).message||'Permintaan gagal. Coba lagi.')}finally{setBusy(false)}
 }
 async function selectBranch(id:string){
  if(id===branch)return
  if(count&&!window.confirm('Pindah cabang akan mengosongkan keranjang saat ini. Lanjutkan?'))return
  await perform(async()=>{await reload(id);setDraft({store:id,items:{},key:crypto.randomUUID()});go('Beranda')})
 }
 function lookup(code:string){
  if(loading){notify('Katalog sedang dimuat. Coba lagi sebentar.');return}
  const found=products.find(p=>p.code===code)
  const branchQR=stores.find(s=>'scanpay:store:'+s.id===code)
  if(branchQR){setModal('');void selectBranch(branchQR.id);return}
  if(!found){notify('Barcode tidak ditemukan di cabang ini.');return}
  setSelected(found);setQty(1);setModal('product')
 }
 async function signIn(role:string){
  await perform(async()=>{
   const result=await api<Session>('login',{role,store:staffBranch})
   setSession(result);setOrders([]);setReceipt(null);setTicket(null);setQR('');setFilter('all');setModal(role==='customer'&&modal==='login-checkout'?'checkout':'');setView(role==='customer'?'Beranda':'Dashboard')
  })
 }
 async function checkout(){
  await perform(async()=>{
   if(!online)throw new Error('Checkout membutuhkan koneksi internet.')
   if(!session.role){setModal('login-checkout');notify('Pilih akun pelanggan demo untuk checkout.');return}
   const next=await api<Order>('checkout',{store:branch,key:draft?.key,method:'cash',items:Object.entries(items).map(([code,qty])=>({code,qty}))})
   setDraft({store:branch,items:{},key:crypto.randomUUID()});setReceipt(next);setModal('receipt');go('Riwayat');void refreshOrders().catch(()=>{});void reload(branch).catch(()=>{})
  })
 }
 function inspect(code:string){
  void perform(async()=>{const result=await api<Order>('ticket',{qr:code});setQR(code);setTicket(result);setVerified([]);setReceived('');setModal('cash')})
 }
 async function complete(e:FormEvent){
  e.preventDefault()
  if(!ticket)return
  await perform(async()=>{
   const result=await api<Order>('cash',{qr,received:Number(received),verified:verified.length===ticket.items.length})
   setReceipt(result);setModal('receipt');setTicket(null);await refreshOrders();notify('Pesanan selesai.')
  })
 }
 async function saveProduct(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const data=new FormData(e.currentTarget)
  await perform(async()=>{await api('inventory',{store:staffBranch,code:data.get('code'),name:data.get('name'),category:data.get('category'),price:Number(data.get('price')),stock:Number(data.get('stock'))});setStock(await api('inventory',{store:staffBranch}));setModal('');notify('Produk disimpan.')})
 }
 const openReceipt=(o:Order)=>{setReceipt(o);setModal('receipt')}
 const showProduct=(p:Product)=>{setSelected(p);setQty(1);setModal('product')}
 const storeName=(id:string)=>[...stores,...branches].find(s=>s.id===id)?.name||id
 return <div className={'shell '+(compact?'compact':'')}>
 <aside className="side">
  <button className="brand" onClick={()=>go(staff?'Dashboard':'Beranda')}><span><ScanLine size={24}/></span><strong>Scan<b>Pay</b><small>SCAN. PAY. GO.</small></strong></button>
  <div className="nav-label">MENU UTAMA</div>
  {(staff?([['Dashboard',LayoutGrid],['Riwayat',History],['Profil',UserRound]] as const):nav).map(([name,Icon])=><button key={name} className={'nav-item '+(view===name?'current':'')} onClick={()=>go(name)} title={name}><Icon size={20}/><span>{name}</span>{name==='Scan'&&<kbd>↗</kbd>}</button>)}
  <div className="side-bottom"><div className="connection">{online?<i/>:<WifiOff size={15}/>}<span>{online?'Terhubung':'Offline'}</span></div><button className="nav-item" onClick={()=>go('Profil')}><span className="avatar">{session.role?labels[session.role][0]:'T'}</span><span>{session.role?labels[session.role]:'Tamu'}</span><ChevronRight size={15}/></button></div>
 </aside>
 <div className="main">
  <header className="top">
   <div className="top-left"><button className="icon desktop" aria-label="Ciutkan navigasi" onClick={()=>setCompact(!compact)}>{compact?<Menu size={19}/>:<PanelLeftClose size={19}/>}</button><div className="mobile-brand"><ScanLine size={23}/> Scan<span>Pay</span></div>
   {!staff&&<label className="location"><MapPin size={17}/><span><small>CABANG AKTIF</small><select aria-label="Cabang aktif" value={branch} onChange={e=>void selectBranch(e.target.value)}>{stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></span><ChevronDown size={15}/></label>}
   {staff&&<strong className="staff-title">{labels[session.role!]}</strong>}</div>
   <div className="top-actions"><button className="icon" aria-label="Ganti tema" onClick={()=>setDark(!dark)}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>
   {!staff&&<button className="icon bag" aria-label={'Keranjang, '+count+' barang'} onClick={()=>setModal('cart')}><ShoppingBag size={20}/>{count>0&&<b>{count}</b>}</button>}</div>
  </header>
  <main>
  {session.readOnly&&<div className="banner">Katalog tersedia. Checkout dan akun demo menunggu konfigurasi database.</div>}
  {!online&&<div className="banner"><WifiOff size={17}/> Sedang offline. Draft keranjang tersimpan di perangkat.</div>}
  {failure&&<div className="banner">{failure}<button className="link" onClick={()=>void perform(()=>reload(branch))}>Coba lagi</button></div>}
  {!staff&&(view==='Beranda'||view==='Scan')&&<>
   <div className="heading"><div><h1>Selamat datang!</h1><p>Belanja lebih praktis di cabang pilihanmu.</p></div><label className="search"><Search size={18}/><input placeholder="Cari produk atau barcode…" aria-label="Cari produk" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <section className="hero"><div className="hero-body"><div className="eyebrow"><Barcode size={16}/> SCAN &amp; GO</div><h2>Scan. Pay. Go.</h2><p>Pindai barang pilihanmu, bayar, lalu lanjutkan harimu.</p><button onClick={()=>setModal('scan')}><ScanLine size={19}/> Pindai barcode <ArrowRight size={17}/></button></div><div className="hero-art" aria-hidden="true"/></section>
   <div className="section-title"><h2>Pilihan produk</h2><span>{matching.length} produk</span></div>
   <div className="pills">{categories.map(([name,Icon])=><button className={category===name?'chosen':''} key={name} onClick={()=>setCategory(name)}><Icon size={16}/>{name}</button>)}</div>
   <div className="products">{loading?Array.from({length:4},(_,i)=><div className="skeleton" key={i}/>):matching.map((p,i)=><article className="product" key={p.code}><button className={'product-art art-'+i%6} aria-label={'Detail '+p.name} onClick={()=>showProduct(p)}><span>{p.icon}</span></button><div className="product-info"><small>{p.category}</small><button className="product-name" onClick={()=>showProduct(p)}>{p.name}</button><div><strong>{money(p.price)}</strong><button aria-label={'Tambah '+p.name} className="add" disabled={!p.stock} onClick={()=>{quantity(p,(items[p.code]||0)+1);if((items[p.code]||0)<p.stock)notify(p.name+' ditambahkan.')}}><Plus size={19}/></button></div></div></article>)}</div>
   {!loading&&!matching.length&&<div className="empty"><Package/> Produk tidak ditemukan.</div>}
  </>}
  {!staff&&view==='Toko'&&<><div className="heading"><div><h1>Pilih toko</h1><p>Cari merchant dan cabang yang tersedia.</p></div><label className="search"><Search size={18}/><input aria-label="Cari toko" placeholder="Cari nama atau lokasi…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="store-grid">{stores.filter(s=>(s.name+' '+s.area).toLowerCase().includes(query.toLowerCase())).map(s=><article className="panel" key={s.id}><div className="tile-icon"><Store/></div><h2>{s.name}</h2><p><MapPin size={15}/> {s.area}</p><button disabled={s.id===branch||busy} className="secondary" onClick={()=>void selectBranch(s.id)}>{s.id===branch?'Cabang aktif':'Pilih cabang'}<ArrowRight size={16}/></button></article>)}</div>{!stores.some(s=>(s.name+' '+s.area).toLowerCase().includes(query.toLowerCase()))&&<div className="empty">Toko tidak ditemukan.</div>}</>}
  {view==='Riwayat'&&<><div className="heading"><div><h1>Riwayat transaksi</h1><p>Lihat status dan buka detail transaksi.</p></div>{staff&&<button className="secondary" onClick={()=>exportCSV(filteredOrders)}><Download size={17}/> Ekspor CSV</button>}</div>
   {session.role?<><select className="filter" aria-label="Filter status transaksi" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Semua status</option>{['pending_payment','completed','cancelled','expired'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select><div className="order-list">{filteredOrders.map(o=><button className="order-row" key={o.id} onClick={()=>openReceipt(o)}><ReceiptText/><span><strong>{o.id.slice(0,8).toUpperCase()}</strong><small>{storeName(o.store)} · {date(o.created)}</small></span><span className="badge">{labels[o.status]}</span><b>{money(o.total)}</b><ChevronRight size={16}/></button>)}</div>{!filteredOrders.length&&<div className="empty"><History/> Belum ada transaksi.</div>}</>:<div className="empty"><History/> Masuk untuk melihat transaksi.<button className="primary" onClick={()=>setModal('login')}>Masuk demo</button></div>}
  </>}
  {view==='Profil'&&<><div className="heading"><div><h1>Profil</h1><p>Kelola sesi, tampilan, dan pemasangan ScanPay.</p></div></div><div className="panel profile"><div className="tile-icon"><UserRound/></div><h2>{session.role?labels[session.role]:'Tamu'}</h2><p>Lingkungan uji coba ScanPay</p><div className="inline"><button className="primary" disabled={busy} onClick={()=>session.role?void perform(async()=>{await api('logout');setSession({role:null,store:null});setOrders([]);setReceipt(null);setTicket(null);setModal('');go('Beranda')}):setModal('login')}>{session.role?'Keluar':'Masuk demo'}</button><button className="secondary" onClick={()=>install?void install.prompt().then(()=>setInstall(null)).catch(()=>setModal('install')):setModal('install')}><Download size={17}/> Instal ScanPay</button></div></div></>}
  {staff&&view==='Dashboard'&&<>
   <div className="heading"><div><h1>Dashboard {labels[session.role!].toLowerCase()}</h1><p>{session.role==='admin'?'Pantau transaksi dan pengaturan marketplace.':storeName(session.store||'')}</p></div>{['cashier','manager'].includes(session.role!)&&<button className="primary" onClick={()=>setModal('ticket')}><QrCode size={19}/> Scan QR pelanggan</button>}</div>
   <div className="metrics">{[['Penjualan tercatat',money(sales)],['Menunggu pembayaran',orders.filter(o=>o.status==='pending_payment').length],['Selesai',done.length],['Komisi transaksi selesai',money(commission)]].map(([label,value])=><article className="panel" key={label}><small>{label}</small><h2>{value}</h2></article>)}</div>
   {['cashier','manager'].includes(session.role!)&&<><div className="section-title"><h2>Antrean transaksi</h2><span>Pembaruan tiap 5 detik</span></div><div className="order-list">{orders.filter(o=>o.status==='pending_payment').map(o=><button onClick={()=>openReceipt(o)} className="order-row" key={o.id}><ReceiptText/><span><strong>{o.id.slice(0,8).toUpperCase()}</strong><small>{date(o.created)}</small></span><b>{money(o.total)}</b><ChevronRight size={16}/></button>)}</div>{!orders.some(o=>o.status==='pending_payment')&&<div className="empty">Antrean kosong.</div>}</>}
   {['owner','manager'].includes(session.role!)&&<><div className="section-title"><h2>Inventaris cabang</h2><button className="primary" onClick={()=>{setEdit(null);setModal('inventory')}}><Plus size={17}/> Produk</button></div><select className="filter" aria-label="Cabang inventaris" value={staffBranch} onChange={e=>setStaffBranch(e.target.value)}>{branches.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><div className="order-list">{stock.map(p=><button key={p.code} className="order-row" onClick={()=>{setEdit(p);setModal('inventory')}}><Package/><span><strong>{p.name}</strong><small>{p.code}</small></span><span className="badge">{p.stock} stok</span><b>{money(p.price)}</b><ChevronRight size={16}/></button>)}</div></>}
   {session.role==='admin'&&admin&&<><div className="section-title"><h2>Cabang dan komisi</h2></div><div className="panel"><form className="inline" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void perform(async()=>{setAdmin(await api('admin',{commission:Math.round(Number(data.get('rate'))*100)}));notify('Komisi diperbarui.')})}}><label>Komisi (%) <input name="rate" type="number" min="0" max="100" step=".01" required defaultValue={admin.commission/100}/></label><button className="primary" disabled={busy}>Simpan</button></form>{branches.map(s=><div className="row" key={s.id}><span>{s.name}</span><button className="secondary" disabled={busy} onClick={()=>void perform(async()=>{setAdmin(await api('admin',{store:s.id,active:!s.active}));setBranches(await api('branches'));void reload(branch).catch(()=>{})})}>{s.active?'Nonaktifkan':'Aktifkan'}</button></div>)}</div><div className="section-title"><h2>Log aktivitas</h2></div><div className="panel">{admin.logs.map((log,i)=><div className="row" key={i}><span>{log.action} · {labels[log.actor]}</span><small>{date(log.time)}</small></div>)}{!admin.logs.length&&<p>Belum ada aktivitas.</p>}</div></>}
  </>}
  </main>
  <nav className="bottom">{(staff?([['Dashboard',LayoutGrid],['Riwayat',History],['Profil',UserRound]] as const):nav).map(([name,Icon])=><button key={name} className={(view===name?'current ':'')+(name==='Scan'?'central':'')} onClick={()=>go(name)}><Icon size={22}/><span>{name}</span></button>)}</nav>
 </div>
 {modal&&<div className="overlay" onClick={()=>{if(!busy)setModal('')}}><section className="dialog" role="dialog" aria-modal="true" aria-label="Detail ScanPay" tabIndex={-1} ref={node=>{if(node&&!node.contains(document.activeElement))node.focus()}} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setModal('');if(e.key==='Tab'){const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]'));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}} onClick={e=>e.stopPropagation()}>
 <button className="icon close" aria-label="Tutup" disabled={busy} onClick={()=>setModal('')}><X size={21}/></button>
 {modal==='scan'&&<><h2>Pindai produk</h2><p>{active?.name||'Pilih cabang aktif'}</p><Scanner detected={lookup}/><p className="muted">Coba barcode demo</p><div className="pills">{sample.map(code=><button key={code} disabled={loading} onClick={()=>lookup(code)}>{code}</button>)}</div></>}
 {modal==='product'&&selected&&<><h2>{selected.name}</h2><div className="product-art detail-art">{selected.icon}</div><p>{selected.category} · {selected.code} · {selected.stock} tersedia</p><div className="row"><strong>{money(selected.price)}</strong><div className="step"><button aria-label="Kurangi jumlah" onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={17}/></button>{qty}<button aria-label="Tambah jumlah" disabled={qty>=selected.stock} onClick={()=>setQty(qty+1)}><Plus size={17}/></button></div></div><button className="primary stretch" disabled={qty+(items[selected.code]||0)>selected.stock} onClick={()=>{quantity(selected,(items[selected.code]||0)+qty);setModal('');notify('Produk ditambahkan.')}}><ShoppingBag size={18}/> Tambahkan ke keranjang</button></>}
 {['cart','checkout'].includes(modal)&&<><h2>{modal==='cart'?'Keranjang':'Checkout'}</h2><p>{active?.name||branch}</p>{cart.map(p=><div className="row cart-row" key={p.code}><span>{p.icon} <b>{p.name}</b><small>{money(p.price)} per barang</small></span>{modal==='cart'?<div className="step"><button aria-label={'Kurangi '+p.name} onClick={()=>quantity(p,items[p.code]-1)}><Minus size={16}/></button>{items[p.code]}<button aria-label={'Tambah '+p.name} onClick={()=>quantity(p,items[p.code]+1)}><Plus size={16}/></button></div>:<b>× {items[p.code]}</b>}</div>)}
 {count===0&&<div className="empty"><ShoppingBag/> Keranjang kosong.</div>}{Object.entries(items).filter(([code])=>!cart.some(p=>p.code===code)).map(([code,n])=><div key={code} className="row"><span>{code} × {n}</span><button className="secondary" onClick={()=>{const next={...items};delete next[code];setDraft({store:branch,items:next,key:crypto.randomUUID()})}}>Hapus</button></div>)}
 <div className="row total"><strong>Total</strong><strong>{cart.length?money(total):'—'}</strong></div>
 {modal==='checkout'&&<><div className="method"><Banknote size={21}/> Bayar tunai di kasir <CircleCheck size={18}/></div><div className="method muted"><CreditCard size={21}/> QRIS, e-wallet, VA belum tersedia</div></>}
 <button className="primary stretch" disabled={session.readOnly||!count||!online||busy||!cart.length} onClick={()=>modal==='cart'?setModal('checkout'):void checkout()}>{modal==='cart'?'Lanjut checkout':'Buat pesanan tunai'}<ArrowRight size={17}/></button></>}
 {['login','login-checkout'].includes(modal)&&<><h2>Masuk akun demo</h2><p>Pilih peran dan cabang untuk mencoba ScanPay.</p><select className="filter stretch" value={staffBranch} aria-label="Cabang akun demo" onChange={e=>setStaffBranch(e.target.value)}><option value="kemang">FreshMart Kemang</option><option value="tebet">FreshMart Tebet</option><option value="menteng">DailyGoods Menteng</option></select><div className="role-grid">{Object.entries(labels).slice(0,5).map(([role,name])=><button className="secondary" disabled={session.readOnly||busy||!online} key={role} onClick={()=>void signIn(role)}>{name}<ArrowRight size={16}/></button>)}</div></>}
 {modal==='install'&&<><h2>Instal ScanPay</h2><p>Di Safari iPhone, buka Bagikan dan pilih Tambahkan ke Layar Utama. Di browser desktop atau Android, buka menu browser lalu pilih Instal aplikasi jika tersedia.</p></>}
 {modal==='ticket'&&<><h2>Scan QR pelanggan</h2><p>Pindai QR atau masukkan kode dari layar pelanggan.</p><Scanner detected={inspect}/></>}
 {modal==='cash'&&ticket&&<form onSubmit={complete}><h2>Verifikasi &amp; terima tunai</h2><p>Centang setiap baris setelah mencocokkan barang fisik.</p>{ticket.items.map(item=><label className="row check" key={item.code}><span>{item.name} × {item.qty}</span><input type="checkbox" checked={verified.includes(item.code)} onChange={e=>setVerified(e.target.checked?[...verified,item.code]:verified.filter(code=>code!==item.code))}/></label>)}<div className="row total"><b>Total</b><b>{money(ticket.total)}</b></div><label className="field">Uang diterima<input type="number" min={ticket.total} max={1000000000} step="1" required value={received} onChange={e=>setReceived(e.target.value)}/></label><div className="row"><b>Kembalian</b><b>{money(Math.max(0,Number(received)-ticket.total))}</b></div><button className="primary stretch" disabled={busy||!online||verified.length!==ticket.items.length}>Konfirmasi pembayaran tunai</button></form>}
 {modal==='receipt'&&receipt&&<div className="receipt"><h2>{receipt.status==='completed'?'Struk ScanPay':'Detail pesanan'}</h2><p>{storeName(receipt.store)} · {date(receipt.created)}</p><div className="row"><b>#{receipt.id.slice(0,8).toUpperCase()}</b><span className="badge">{labels[receipt.status]}</span></div>{receipt.items.map(item=><div className="row" key={item.code}><span>{item.name} × {item.qty}</span><b>{money(item.price*item.qty)}</b></div>)}<div className="row total"><b>Total tunai</b><b>{money(receipt.total)}</b></div>{receipt.received!==null&&<div className="row"><span>Kembalian</span><b>{money(receipt.received-receipt.total)}</b></div>}
 {receipt.status==='pending_payment'&&receipt.qrImage&&<div className="qr"><p>Tunjukkan QR ke kasir sebelum {date(receipt.expires)}.</p><img src={receipt.qrImage} width="150" height="150" alt="QR pesanan"/><code>{receipt.qr}</code><button className="secondary no-print" disabled={busy||!online} onClick={()=>void perform(async()=>{await api('cancel',{id:receipt.id});setModal('');await refreshOrders();void reload(branch).catch(()=>{});notify('Pesanan dibatalkan.')})}>Batalkan pesanan</button></div>}
 {receipt.status==='completed'&&<button className="primary stretch no-print" onClick={()=>window.print()}><ReceiptText size={18}/> Cetak / simpan PDF</button>}</div>}
 {modal==='inventory'&&<form onSubmit={saveProduct}><h2>{edit?'Edit produk':'Tambah produk'}</h2><label className="field">Barcode<input name="code" defaultValue={edit?.code} readOnly={!!edit} required minLength={4} maxLength={64}/></label><label className="field">Nama<input name="name" defaultValue={edit?.name} required maxLength={100}/></label><label className="field">Kategori<input name="category" defaultValue={edit?.category} required maxLength={50}/></label><label className="field">Harga (Rp)<input type="number" name="price" defaultValue={edit?.price} min="1" max="100000000" required/></label><label className="field">Stok tersedia<input type="number" name="stock" defaultValue={edit?.stock} min="0" max="1000000" required/></label><button className="primary stretch" disabled={busy||!online}>Simpan produk</button></form>}
 </section></div>}
 {toast&&<div className="toast" role="status"><ShieldCheck size={19}/>{toast}<button aria-label="Tutup notifikasi" onClick={()=>setToast('')}><X size={16}/></button></div>}
 </div>
}
