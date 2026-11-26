import type {Metadata} from 'next'
import {auth,googleLoginConfigured} from '../../lib/auth'
import {canManageDirectory,directoryConfigured} from '../../lib/store-directory'
import {AppAccount,AppInstall} from '../app-entry'
import {AdminDashboard} from './admin-dashboard'

export const dynamic='force-dynamic'

export const metadata:Metadata={
 title:'ScanPay Admin',manifest:'/admin.webmanifest',
 appleWebApp:{capable:true,title:'ScanPay Admin'},
 icons:{icon:'/icons/admin-192.png',apple:'/icons/admin-192.png'},
 robots:{index:false,follow:false},referrer:'no-referrer',
}

export default async function Page(){
 const user=googleLoginConfigured?(await auth())?.user:null
 const allowed=canManageDirectory(user?.email)
 return <main className="merchant-main">
  <div className="app-toolbar"><AppInstall scope="/admin"/>{googleLoginConfigured&&<AppAccount signedIn={!!user} destination="/admin"/>}</div>
  <div className="heading"><div><h1>ScanPay Admin</h1><p>Kelola lokasi toko dan persetujuan mitra.</p></div></div>
  {allowed?<AdminDashboard directoryConfigured={directoryConfigured}/>:<div className="panel profile">
   <p>{!googleLoginConfigured?'Login Google belum dikonfigurasi.':user?'Akun ini tidak memiliki akses admin.':'Masuk dengan akun Google yang ditetapkan sebagai admin.'}</p>
  </div>}
 </main>
}
