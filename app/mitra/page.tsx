import type {Metadata} from 'next'
import {MerchantDashboard} from './merchant-dashboard'

export const metadata:Metadata={title:'Mitra ScanPay',robots:{index:false,follow:false},referrer:'no-referrer'}

export default async function Page({searchParams}:{searchParams:Promise<{tagihan?:string|string[]}>}){
 const invoice=(await searchParams).tagihan
 return <MerchantDashboard invoiceId={typeof invoice==='string'?invoice:undefined}/>
}
