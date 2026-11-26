import type { Metadata, Viewport } from 'next'
import './style.css'
export const metadata: Metadata = { title:'ScanPay · Scan. Pay. Go.',description:'Belanja, pindai, dan bayar dengan ScanPay.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true},icons:{icon:'/icons/icon-192.png',apple:'/icons/apple.png'} }
export const viewport: Viewport = {themeColor:'#059669'}
export default function Layout({children}:{children:React.ReactNode}) {
 return <html lang="id"><body>{children}</body></html>
}
