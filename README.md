# GAS Email API (Serverless Mailer)

Sebuah skrip Google Apps Script (GAS) yang mengubah akun Google Anda menjadi API pengiriman email. Dibuat untuk kebutuhan notifikasi, formulir kontak, atau sistem otomatisasi sederhana tanpa memerlukan server atau layanan email berbayar.

Dilengkapi dengan logging ke Google Sheets, rate limiting, dan endpoint manajemen.



## ✨ Fitur Utama

* **Endpoint API (`doPost`)**: Menerima request JSON untuk mengirim email.
* **Pengiriman Email**: Mendukung email tunggal (`send-email`) dan bulk (`bulk-email`).
* **Logging Lengkap**: Setiap request, email terkirim, dan error dicatat otomatis ke **Google Sheets** (Sheet `api_log`, `email_log`, `error_log`).
* **Manajemen Log**: Endpoint untuk membersihkan log lama secara otomatis (`clear-logs`).
* **Monitoring**: Endpoint `health` untuk cek status dan `usage` untuk melihat statistik penggunaan.
* **Keamanan**: Validasi API Key dan Rate Limiting untuk mencegah penyalahgunaan.
* **Attachment**: Support lampiran dari Google Drive (via File ID) dan Base64 data.
* **Dashboard**: Otomatis membuat sheet `Summary` di file log untuk memantau status API.

## 🚀 Setup & Instalasi

1.  **Buat Proyek Baru**: Buka [script.google.com](https://script.google.com) dan buat proyek baru.
2.  **Salin Kode**: Salin seluruh kode dari `Code.gs` ke dalam proyek Anda.
3.  **Konfigurasi**: Sesuaikan variabel di dalam objek `CONFIG` di bagian atas skrip.
    * `API_KEY`: Ganti dengan API key rahasia Anda (Contoh: `rahasia12345`).
    * `LOG_SPREADSHEET_ID`: Buat Google Sheet baru, ambil ID-nya dari URL, dan masukkan di sini.
4.  **Jalankan Setup**: Dari editor Apps Script, pilih fungsi `setupAPI` dan klik **Run**. Ini akan meminta izin dan secara otomatis membuat sheet yang diperlukan (`api_log`, `email_log`, `error_log`, `Summary`) di Google Sheet Anda.
5.  **Deploy**:
    * Klik **Deploy** > **New deployment**.
    * Pilih **Web app** sebagai tipe deployment.
    * Pada **Execute as**, pilih **Me**.
    * Pada **Who has access**, pilih **Anyone** (Ini penting agar API bisa diakses publik, keamanan ditangani oleh API Key).
    * Klik **Deploy**.
    * Salin **Web app URL** yang diberikan. Itulah URL API Anda.

## 🔧 Konfigurasi (`CONFIG`)

Sesuaikan variabel berikut di dalam skrip:

* `API_KEY`: Kunci rahasia untuk autentikasi.
* `MAX_RECIPIENTS`: Jumlah maksimal penerima dalam satu kali kirim (default: 50).
* `RATE_LIMIT`: Batas total request API per hari (default: 500).
* `ALLOWED_DOMAINS`: (Opsional) Batasi pengiriman hanya ke domain tertentu.
* `LOG_SPREADSHEET_ID`: ID dari Google Sheet yang akan digunakan untuk menyimpan log.
* `ENABLE_SPREADSHEET_LOG`: Set ke `false` jika Anda tidak ingin menggunakan logging ke Sheet.

---
