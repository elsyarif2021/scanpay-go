'use client'

import {useEffect,useState} from 'react'
import {StoreDirectoryAdmin} from '../store-directory-admin'
import {storeLocations,type StoreLocation} from '../../lib/store-locations'

type RequestRow={id:string;name:string;address:string;owner_email:string}
export function AdminDashboard({directoryConfigured}:{directoryConfigured:boolean}){
 const [tab,setTab]=useState('Mitra')
 const [locations,setLocations]=useState(storeLocations)
 const [pending,setPending]=useState<RequestRow[]|null>(null)
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 const [error,setError]=useState('')
 useEffect(()=>{
  const controller=new AbortController()
  setError('')
  setStatus('')
  const endpoint=tab==='Mitra'?'/api/mitra?admin=1':'/api/store-directory'
  fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const result=await response.json()
   if(controller.signal.aborted)return
   if(!response.ok)throw new Error(result.error)
   if(tab==='Mitra')setPending(result.pending)
   else setLocations(result)
  }).catch(error=>{if(!controller.signal.aborted)setError(error.message||'Data belum dapat dimuat.')})
  return ()=>controller.abort()
 },[tab])

 async function approve(item:RequestRow){
  if(busy||!window.confirm('Setujui '+item.name+' sebagai mitra ScanPay?'))return
  setBusy(true);setError('');setStatus('')
  try{
   const result=await fetch('/api/mitra',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve',id:item.id})})
   if(!result.ok)throw new Error((await result.json()).error)
   setPending(current=>current?.filter(row=>row.id!==item.id)??[])
   setStatus(item.name+' disetujui.')
  }catch(error){setError(error instanceof Error?error.message:'Persetujuan belum tersimpan.')}
  finally{setBusy(false)}
 }
 return <>
  <nav className="pills" aria-label="Menu admin">{['Mitra','Lokasi toko'].map(name=><button key={name} disabled={busy} type="button" className={tab===name?'chosen':''} aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</nav>
  {error&&<p className="banner" role="alert">{error}</p>}
  {status&&<p className="banner" role="status">{status}</p>}
  {tab==='Mitra'?<>
   <div className="section-title"><h2>Pengajuan mitra</h2></div>
   {!pending&&!error&&<p role="status">Memuat pengajuan…</p>}
   {pending?.length===0&&<div className="empty">Belum ada pengajuan.</div>}
   <div className="order-list">{pending?.map(item=><article className="panel merchant-invoice" key={item.id}>
    <div><strong>{item.name}</strong><p>{item.address} · {item.owner_email}</p></div>
    <button className="primary" disabled={busy} onClick={()=>void approve(item)}>Setujui</button>
   </article>)}</div>
  </>:<StoreDirectoryAdmin locations={locations} configured={directoryConfigured} onSaved={location=>setLocations(current=>[...current.filter(item=>item.id!==location.id),location].sort((a,b)=>a.name.localeCompare(b.name,'id')))}/>}
 </>
}
