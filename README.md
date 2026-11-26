# ScanPay · Scan. Pay. Go.

PWA demo marketplace ritel berbahasa Indonesia. Checkout menggunakan reservasi stok dan pembayaran tunai di kasir. Next.js App Router, React, TypeScript, SQLite bawaan Node dan pemindai ZXing.

## Jalankan

Prasyarat Node.js 24 atau lebih baru.

```sh
npm ci
npm run build
npm start -- --hostname 127.0.0.1
```

Buka http://localhost:3000. Untuk pengembangan jalankan `npm run dev -- --hostname 127.0.0.1`. Service worker hanya didaftarkan pada build produksi. Data demo dibuat otomatis saat API pertama dipanggil dan disimpan di `.data/scanpay.sqlite`. Salin `.env.example` ke `.env.local` jika ingin mengubah lokasi database atau menonaktifkan akses demo.

## Coba pembayaran tunai

1. Buka Profil dan pilih **Masuk demo → Pelanggan**. Di cabang FreshMart Kemang, pindai barcode demo `8991002100012` atau pilih produk dari katalog.
2. Tambahkan barang, buka keranjang dan buat pesanan tunai. Biarkan QR pelanggan terbuka.
3. Buka jendela browser privat. Pilih akun demo **Kasir**, cabang FreshMart Kemang. Klik **Scan QR pelanggan** lalu pindai QR atau salin kodenya.
4. Cocokkan barang, centang setiap baris, masukkan uang diterima dan konfirmasi. Buka **Cetak / simpan PDF**. Pembaruan pelanggan tampil dalam 5 detik.
5. Ulangi sebagai manajer atau pemilik untuk pengelolaan inventaris. Super admin dapat mengubah komisi, mengaktifkan cabang, atau melihat log aktivitas.

Barcode contoh tersedia di modal pemindai. Kamera memerlukan localhost atau HTTPS. Pada perangkat iOS, pasang melalui Safari → Bagikan → Tambahkan ke Layar Utama.

## API demo

Semua endpoint menerima `POST /api/<aksi>` dengan JSON. API mengembalikan JSON dengan `Cache-Control: no-store`. Kesalahan memakai bidang `error` serta HTTP 400, 403, 404 atau 409.

| Aksi | Data | Akses |
| --- | --- | --- |
| catalog | `store?` | Publik |
| session | kosong | Publik |
| login | `role, store` | Demo |
| logout | kosong | Sesi saat ini |
| checkout | `store, key (UUID), method: "cash", items: [{code, qty}]` | Pelanggan |
| orders | kosong | Sesuai peran dan cabang |
| cancel | `id` | Pelanggan pemilik pesanan |
| ticket | `qr` | Kasir dan manajer cabang |
| cash | `qr, verified, received` | Kasir dan manajer cabang |
| branches | kosong | Manajer, pemilik, admin |
| inventory | `store` untuk membaca. Tambahkan `code, name, category, price, stock` untuk menyimpan | Manajer, pemilik |
| admin | kosong untuk membaca. `store, active` untuk status cabang. `commission` dalam basis poin | Admin |

Stok tersedia dikurangi saat reservasi dan dikembalikan satu kali pada pembatalan atau saat pembacaan berikutnya setelah pesanan kedaluwarsa. Kode QR tunai memakai token acak, berlaku 15 menit dan hanya dapat diselesaikan di cabang asal. Komisi disimpan saat checkout. Harga selalu dihitung ulang dari data cabang.

## Pengujian

`npm test` memeriksa harga di server, idempotensi, rollback stok, batas akses cabang, pembayaran kasir, penggunaan ulang QR, kedaluwarsa, pembatalan dan akses admin.

Uji Chromium headless mencakup alur pelanggan ke kasir dengan dua sesi, pembaruan struk, pemuatan ulang offline, pemulihan draft IndexedDB, pemblokiran checkout offline dan lebar viewport 390 px. Pemindaian kamera fisik, pemasangan PWA di perangkat nyata dan cetak thermal memerlukan pengujian perangkat.

## Ruang lingkup dan hosting

Versi ini adalah demo lokal dengan pemilihan peran terbuka. Gunakan satu server Node dengan volume persisten dan batasi akses ke lingkungan uji. SQLite lokal tidak cocok untuk fungsi serverless Vercel. Untuk uji lewat perangkat lain gunakan HTTPS di jaringan uji yang aksesnya terbatas.

`supabase/migrations/` berisi rancangan awal PostgreSQL dan kebijakan RLS baca untuk peran yang relevan. Runtime belum menggunakan migrasi itu. Supabase Auth, Realtime, deployment Vercel serta integrasi QRIS, e-wallet, VA, webhook, refund dan settlement masih memerlukan implementasi dan verifikasi. Fitur lanjutan PDF seperti voucher, promosi, onboarding merchant, Web Push dan pelaporan lengkap juga belum tersedia.
