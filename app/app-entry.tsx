'use client'

import {useEffect,useState} from 'react'
import {signIn,signOut} from 'next-auth/react'
import {Download} from 'lucide-react'

type InstallPrompt=Event & {prompt:()=>Promise<void>}

export function AppInstall({scope}:{scope:'/admin'|'/mitra'|'/'}) {
 const [installer,setInstaller]=useState<InstallPrompt|null>(null)
 const [help,setHelp]=useState(false)
 useEffect(()=>{
  if('serviceWorker' in navigator&&process.env.NODE_ENV==='production') {
   void navigator.serviceWorker.register('/sw.js',{scope}).catch(()=>{})
  }
  const offer=(event:Event)=>{event.preventDefault();setInstaller(event as InstallPrompt)}
  window.addEventListener('beforeinstallprompt',offer)
  return ()=>window.removeEventListener('beforeinstallprompt',offer)
 },[scope])
 return <div>
  <button className="secondary" type="button" onClick={()=>{
   if(!installer){setHelp(!help);return}
   void installer.prompt().then(()=>setInstaller(null)).catch(()=>setHelp(true))
  }}><Download size={16}/> Pasang aplikasi</button>
  {help&&<p className="banner">Di Chrome atau Edge, buka menu browser lalu pilih instal aplikasi. Di Safari iPhone, pilih Bagikan → Tambahkan ke Layar Utama.</p>}
 </div>
}

export function AppAccount({signedIn,destination}:{signedIn:boolean;destination:'/admin'|'/mitra'}) {
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 return <>
  <button className={signedIn?'secondary':'primary'} disabled={busy} type="button" onClick={async()=>{
   setBusy(true);setError('')
   try{
    if(signedIn)await signOut({redirectTo:destination})
    else await signIn('google',{redirectTo:destination})
   }catch{setError('Akun belum bisa diproses. Coba lagi.')}
   finally{setBusy(false)}
  }}>{signedIn?'Keluar':'Masuk dengan Google'}</button>
  {error&&<p className="banner" role="alert">{error}</p>}
 </>
}
