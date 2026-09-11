# ✦ Penjelasan Task 3

> Agent sederhana yang bisa menjawab berdasarkan satu dokumen, mengingat percakapan, dan menggunakan calculator jika diperlukan.

---

## 01 — Ide awal

Untuk task ini saya membuat sebuah agent sederhana yang bisa menjawab pertanyaan berdasarkan satu sample document. Saya menggunakan dokumen tentang **lowongan Frontend Developer di PT Nusa Digital** yang berisi informasi seperti tanggung jawab pekerjaan, teknologi yang digunakan, persyaratan, gaji, sistem kerja, dan proses seleksi.

Saya memilih menggunakan **raw Gemini API calls** karena alurnya masih cukup sederhana. Menurut saya belum perlu menggunakan framework seperti LangGraph atau CrewAI, karena di task ini hanya ada satu agent, satu dokumen, dan satu tool. Dengan cara ini alur program juga lebih mudah dibaca dan dijelaskan.

Sample document yang saya gunakan ada di file [`sample-document.md`](./sample-document.md).

---

## 02 — Menjawab berdasarkan dokumen

Isi sample document saya baca dari file, lalu saya masukkan ke dalam **system instruction**. Di bagian tersebut saya memberi instruksi supaya agent hanya menggunakan dokumen sebagai sumber ketika menjawab pertanyaan tentang lowongan Frontend Developer.

Kalau informasi yang ditanyakan memang ada di dokumen, agent bisa langsung memberikan jawaban. Contohnya ketika user bertanya tentang teknologi yang digunakan, agent akan menjawab **HTML, CSS, TypeScript, React, dan Git**.

Kalau jawabannya tidak ada di dokumen, agent diarahkan untuk mengatakan bahwa informasi tersebut tidak tersedia. Saya menambahkan aturan ini supaya agent tidak membuat informasi sendiri di luar dokumen yang diberikan.

---

## 03 — Conversation memory

Requirement berikutnya adalah agent harus mempunyai **conversation memory**. Untuk bagian ini saya menyimpan pesan user dan jawaban model ke dalam array `history`.

Setiap ada pertanyaan baru, history tersebut dikirim lagi ke Gemini bersama pertanyaan terbaru. Dengan begitu agent masih bisa melihat konteks percakapan sebelumnya.

Saya juga menambahkan variabel `rememberedName` untuk menyimpan nama yang diperkenalkan oleh user. Contohnya seperti ini:

```text
User  : Nama saya Andi.
Agent : Halo Andi, ada yang bisa saya bantu?

User  : Siapa nama saya?
Agent : Nama Anda Andi.
```

Pada contoh tersebut, pertanyaan kedua tidak menyebutkan nama lagi. Tetapi agent tetap bisa menjawab karena nama dan percakapan sebelumnya masih tersimpan.

Memory yang saya buat masih bersifat **in-memory**, jadi hanya bertahan selama program dijalankan. Kalau program ditutup, history akan kembali kosong. Menurut saya ini sudah cukup untuk requirement agent sederhana. Kalau nantinya digunakan untuk aplikasi yang lebih besar, memory bisa disimpan ke database.

---

## 04 — Calculator tool

Selain memory, agent juga harus mempunyai sebuah tool yang hanya dipanggil ketika diperlukan. Saya memilih membuat **calculator tool** karena mudah menunjukkan perbedaan antara pertanyaan biasa dan pertanyaan yang membutuhkan perhitungan.

Calculator saya daftarkan ke Gemini sebagai **function declaration**. Di deskripsinya saya jelaskan bahwa calculator hanya digunakan untuk pertanyaan matematika. Setelah itu Gemini yang memutuskan apakah tool perlu dipanggil atau tidak.

Misalnya user bertanya:

```text
Apa saja teknologi yang digunakan?
```

Untuk pertanyaan tersebut Gemini tidak perlu memanggil calculator karena jawabannya bisa langsung diambil dari dokumen.

Tetapi ketika user bertanya:

```text
Berapa total gaji selama masa percobaan?
```

Gemini akan melihat dari dokumen bahwa gajinya adalah Rp7.500.000 per bulan dan masa percobaannya berlangsung selama tiga bulan. Setelah itu Gemini meminta program memanggil calculator dengan ekspresi:

```text
7500000 * 3
```

Program menjalankan perhitungan tersebut, lalu hasilnya dikirim kembali ke Gemini untuk dibuat menjadi jawaban akhir. Hasilnya adalah total gaji selama masa percobaan sebesar **Rp22.500.000**.

---

## 05 — Pengecekan keamanan calculator

Untuk menjalankan perhitungan saya tidak menggunakan `eval`, karena `eval` bisa menjalankan kode JavaScript yang tidak seharusnya dijalankan.

Sebagai gantinya, saya membuat parser aritmetika sederhana. Calculator hanya menerima:

- angka;
- tanda kurung;
- penjumlahan dan pengurangan;
- perkalian dan pembagian; serta
- operator modulo.

Kalau Gemini mengirim karakter atau ekspresi di luar aturan tersebut, calculator akan menolaknya. Jadi tool hanya bisa digunakan untuk perhitungan dan tidak bisa menjalankan kode lain.

---

## 06 — Alur program

Secara keseluruhan, alur agent yang saya buat seperti ini:

```text
User memberikan pertanyaan
        ↓
Pertanyaan disimpan ke conversation history
        ↓
Sample document dan history dikirim ke Gemini
        ↓
Gemini memeriksa apakah calculator diperlukan
        ↓
┌──────────────────────┬─────────────────────────┐
│ Tidak diperlukan     │ Diperlukan              │
│ Jawab dari dokumen   │ Panggil calculator      │
└──────────────────────┴─────────────────────────┘
        ↓
Jawaban disimpan ke history
        ↓
Jawaban ditampilkan kepada user
```

Jadi pada implementasi ini Gemini mempunyai tiga tugas utama. Pertama, memahami pertanyaan user. Kedua, mencari jawaban berdasarkan sample document dan konteks percakapan. Ketiga, memutuskan kapan calculator memang perlu digunakan.

Sedangkan program tetap bertanggung jawab untuk menyimpan memory, menjalankan calculator, dan mengirim hasil tool kembali ke Gemini.

---
