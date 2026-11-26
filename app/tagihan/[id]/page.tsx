import type {Metadata} from 'next'
import {BuyerInvoice} from './buyer-invoice'

export const metadata:Metadata={title:'Tagihan · ScanPay Pembeli',robots:{index:false,follow:false},referrer:'no-referrer'}

export default async function Page({params}:{params:Promise<{id:string}>}){
 return <BuyerInvoice id={(await params).id}/>
}
