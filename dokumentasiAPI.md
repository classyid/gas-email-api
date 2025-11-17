File ini khusus untuk menjelaskan cara *menggunakan* API-nya (untuk developer).

````markdown
# Dokumentasi API GAS Mailer

Seluruh request dikirimkan ke URL Web App yang Anda dapatkan saat deployment.

## Autentikasi

API ini menggunakan autentikasi berbasis API Key. Sertakan `api_key` Anda di dalam setiap *body* request JSON.

```json
{
  "api_key": "classy2025"
}
````

## Endpoints (POST)

Semua fungsi utama diakses melalui metode `POST` dengan menentukan `endpoint` di dalam JSON body.

### 1\. Kirim Email Tunggal

  * `endpoint`: `send-email`

**Body Request:**

```json
{
  "api_key": "classy2025",
  "endpoint": "send-email",
  "to": "penerima@example.com",
  "subject": "Ini Subjek Emailnya",
  "body": "Ini isi email versi teks biasa.",
  "html_body": "<h1>Halo!</h1><p>Ini isi email versi <strong>HTML</strong>.</p>",
  "from_name": "Classy Mailer",
  "cc": "cc@example.com",
  "bcc": ["bcc1@example.com", "bcc2@example.com"],
  "reply_to": "support@classy.id"
}
```

### 2\. Kirim Email Bulk

  * `endpoint`: `bulk-email`

Mengirim beberapa email berbeda dalam satu request (dibatasi 10 per request oleh skrip).

**Body Request:**

```json
{
  "api_key": "classy2025",
  "endpoint": "bulk-email",
  "emails": [
    {
      "to": "user1@example.com",
      "subject": "Email untuk User 1",
      "body": "Isi email pertama."
    },
    {
      "to": "user2@example.com",
      "subject": "Email untuk User 2",
      "body": "Isi email kedua."
    }
  ]
}
```

### 3\. Menggunakan Attachment

Anda bisa menambahkan *array* `attachments` pada request `send-email`.

**a. Attachment dari Google Drive:**

```json
"attachments": [
  {
    "drive_file_id": "ID_FILE_GOOGLE_DRIVE_ANDA"
  }
]
```

**b. Attachment dari Base64:**

```json
"attachments": [
  {
    "filename": "laporan.pdf",
    "mime_type": "application/pdf",
    "base64_data": "JVBERi0xLjQKJ..."
  }
]
```

## Endpoints (GET)

Endpoint ini digunakan untuk manajemen dan monitoring.

  * `GET .../exec?path=health`

      * **Deskripsi**: Cek status kesehatan API (koneksi ke Gmail, Sheets, dll).
      * **Response**: JSON berisi status "healthy".

  * `GET .../exec?path=usage`

      * **Deskripsi**: Melihat statistik penggunaan harian dan total log.
      * **Response**: JSON berisi `requests_today`, `rate_limit`, dll.

  * `GET .../exec?path=logs&api_key=classy2025`

      * **Deskripsi**: (Perlu API Key) Melihat jumlah log di setiap sheet.
      * **Response**: JSON berisi `email_log`, `api_log`, `error_log`.

  * `GET .../exec?path=clear-logs&api_key=classy2025&days=30`

      * **Deskripsi**: (Perlu API Key) Menghapus log yang lebih tua dari `days` (default 30 hari).
      * **Response**: JSON berisi jumlah log yang dihapus.

## Contoh Response

**Sukses (200):**

```json
{
  "success": true,
  "data": {
    "messageId": "msg_1763167293_abcdef123",
    "timestamp": "2025-11-17T07:21:33.000Z",
    "recipients": "penerima@example.com",
    "processing_time_ms": 520
  },
  "meta": { ... }
}
```

**Error (400/401/500):**

```json
{
  "success": false,
  "error": {
    "code": 401,
    "message": "Invalid API key",
    "details": "Please provide a valid API key",
    "timestamp": "2025-11-17T07:22:01.000Z"
  },
  "meta": { ... }
}
```

```
