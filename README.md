# EL48 AI Image

Web app buat & edit gambar dengan AI (Replicate). Dark premium, PWA, bisa di-Install ke layar utama.

- **Buat Gambar** — teks jadi gambar (Flux 1.1 Pro / Dev / Schnell)
- **Edit Gambar** — unggah foto + perintah ubah (Flux Kontext Pro / Max)

---

## Isi folder

```
index.html        → tampilan (HTML+CSS+JS jadi satu)
api/generate.js   → penghubung ke Replicate (API key disembunyikan di sini)
package.json      → agar fungsi jalan sebagai ES Module
vercel.json       → menaikkan batas waktu fungsi jadi 60 detik
manifest.json     → info PWA (nama, ikon)
sw.js             → service worker (PWA)
```

---

## Langkah deploy (sekitar 10 menit)

### 1. Ambil API Token Replicate
1. Daftar / masuk di **replicate.com**.
2. Buka **Account → API tokens**, klik **Create token**, salin token-nya (diawali `r8_...`).
3. Penting: di **Billing**, tambahkan kartu / metode bayar. Model Flux Pro & Kontext berbayar per gambar (~$0,04). Tanpa billing aktif, panggilan akan ditolak.

> Mau coba gratis dulu? Ganti model "Buat Gambar" ke **Flux Schnell** (sangat murah, ~$0,003/gambar). Replicate juga memberi sedikit kredit awal.

### 2. Upload ke GitHub
1. Buat repository baru di **github.com** (boleh public/private).
2. Upload semua file **dengan struktur folder yang sama**. Yang sering keliru: file `generate.js` harus berada di dalam folder **`api/`**, bukan di luar.

### 3. Deploy ke Vercel
1. Masuk ke **vercel.com** pakai akun GitHub.
2. **Add New → Project → Import** repository tadi.
3. Biarkan semua setelan default, klik **Deploy**. Tunggu selesai.

### 4. Pasang API Key (langkah paling penting)
1. Di project Vercel: **Settings → Environment Variables**.
2. Tambahkan:
   - **Key:** `REPLICATE_API_TOKEN`
   - **Value:** token `r8_...` dari langkah 1
3. Save, lalu buka tab **Deployments → ⋯ → Redeploy** agar variabel terbaca.

### 5. Selesai
Buka URL Vercel-mu. Di HP, ketuk menu browser → **Tambahkan ke layar utama** supaya terasa seperti aplikasi.

---

## Kalau ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| "REPLICATE_API_TOKEN belum diset" | Variabel belum dibuat / belum redeploy. Ulangi langkah 4. |
| "Gagal memanggil Replicate. Cek API token & saldo" | Token salah atau billing belum aktif. Cek langkah 1. |
| Tombol tidak melakukan apa-apa | File `api/generate.js` tidak di dalam folder `api/`. |
| Edit gambar lama / timeout | Gambar terlalu besar — app sudah otomatis mengompres; coba foto lebih kecil. |

---

## Ganti model / harga (opsional)

Edit pilihan model langsung di `index.html` (cari `<select id="genModel">` dan `id="editModel">`).
Daftar model & harga ada di **replicate.com/black-forest-labs**.

Dibuat oleh ELPADRI
