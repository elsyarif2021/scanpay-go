import type {Metadata} from 'next'
import {redirect} from 'next/navigation'
import {auth,googleLoginConfigured} from '../../lib/auth'
import {AppAccount,AppInstall} from '../app-entry'
import {MerchantDashboard} from './merchant-dashboard'

export const metadata:Metadata={
 title:'ScanPay Mitra',manifest:'/mitra.webmanifest',
 appleWebApp:{capable:true,title:'ScanPay Mitra'},
 icons:{icon:'/icons/mitra-192.png',apple:'/icons/mitra-192.png'},
 robots:{index:false,follow:false},referrer:'no-referrer',
}

export default async function Page({searchParams}:{searchParams:Promise<{tagihan?:string|string[]}>}){
 const invoice=(await searchParams).tagihan
 if(typeof invoice==='string'&&invoice)redirect('/tagihan/'+encodeURIComponent(invoice))
 const user=googleLoginConfigured?(await auth())?.user:null
 return <main className="merchant-main">
  <div className="app-toolbar"><AppInstall scope="/mitra"/>{googleLoginConfigured&&<AppAccount signedIn={!!user} destination="/mitra"/>}</div>
  {user?<MerchantDashboard/>:<div className="heading"><div><h1>ScanPay Mitra</h1><p>{googleLoginConfigured?'Masuk untuk mendaftarkan usaha dan mengelola tagihan.':'Login Google belum dikonfigurasi.'}</p></div></div>}
 </main>
}
