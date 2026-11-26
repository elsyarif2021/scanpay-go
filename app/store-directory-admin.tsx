'use client'
import {useState,type FormEvent} from 'react'
import {Plus,Store} from 'lucide-react'
import type {StoreLocation} from '../lib/store-locations'

export function StoreDirectoryAdmin({locations,configured,onSaved}:{
 locations:StoreLocation[]
 configured:boolean
 onSaved:(location:StoreLocation)=>void
}){
 const [editing,setEditing]=useState<StoreLocation|null>(null)
 const [formKey,setFormKey]=useState(0)
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 function select(location:StoreLocation|null) {
  setEditing(location)
  setFormKey(key=>key+1)
  setStatus('')
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(busy||!configured)return
  const fields=new FormData(event.currentTarget)
  setBusy(true)
  setStatus('')
  try {
   const result=await fetch('/api/store-directory',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:editing?.id,name:fields.get('name'),address:fields.get('address'),directions:fields.get('directions')}),
   })
   const data=await result.json()
   if(!result.ok)throw new Error(data.error)
   onSaved(data)
   if(!editing)setFormKey(key=>key+1)
   else setEditing(data)
   setStatus(editing?'Perubahan tersimpan.':'Toko berhasil ditambahkan.')
  }catch(error){setStatus(error instanceof Error?error.message:'Lokasi belum tersimpan.')}
  finally{setBusy(false)}
 }
 return <>
  <div className="heading"><div><h1>Kelola Toko</h1><p>Tambah dan perbarui lokasi di direktori publik ScanPay.</p></div><button className="secondary" type="button" disabled={busy} onClick={()=>select(null)}><Plus size={17}/> Tambah toko</button></div>
  {!configured&&<p className="banner">Hubungkan database direktori untuk menyimpan perubahan.</p>}
  <form key={formKey} className="panel profile" onSubmit={save}>
   <h2>{editing?'Edit lokasi':'Lokasi baru'}</h2>
   <label className="field">Nama toko<input name="name" required maxLength={100} defaultValue={editing?.name}/></label>
   <label className="field">Alamat cabang<input name="address" required maxLength={300} defaultValue={editing?.address}/></label>
   <label className="field">Tautan Google Maps (opsional)<input name="directions" type="url" maxLength={2000} defaultValue={editing?.directions}/></label>
   <button className="primary" disabled={busy||!configured}>{busy?'Menyimpan…':'Simpan toko'}</button>
   {status&&<p role="status">{status}</p>}
  </form>
  <div className="section-title"><h2>Lokasi yang tampil</h2></div>
  <div className="order-list">{locations.map(location=><button className="order-row" type="button" key={location.id} disabled={busy} onClick={()=>select(location)}>
   <Store size={20}/><span><strong>{location.name}</strong><small>{location.address}</small></span><b>Edit</b>
  </button>)}</div>
 </>
}
