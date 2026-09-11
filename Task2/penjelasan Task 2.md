# ✦ Penjelasan Task 2

> **Technical Implementation** — memperbaiki scraping halaman kompleks, menangani konten panjang, dan memastikan ringkasan tetap singkat.

---

## 01 — Script awal

Script awal dibuat sederhana dan masih masuk akal untuk halaman website biasa.

```ts
async function scrapeAndSummarize(url: string) {
	const response = await fetch(url);
	const html = await response.text();

	// Mengambil seluruh teks dari HTML
	const text = html
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	const prompt = `
    Ringkas isi website berikut:

    ${text}
  `;

	const summary = await callLLM(prompt);

	return summary;
}
```

Awalnya saya membuat script yang cukup sederhana. Website diambil menggunakan fetch, lalu tag HTML dihapus dan semua teks yang tersisa langsung dikirim ke LLM untuk dibuat ringkasannya.

Untuk halaman yang sederhana, cara ini mungkin masih bisa berjalan. Tetapi ketika halaman website lebih kompleks atau memiliki konten yang panjang, mulai muncul beberapa masalah.

---

## 02 — Bottleneck yang ditemukan

### Masalah pertama: proses scraping

Walaupun tag HTML sudah dihapus, bukan berarti teks yang didapat sudah bersih. Masih bisa ada isi dari:

- navigation
- footer
- sidebar
- menu
- iklan
- script
- bagian lain yang sebenarnya tidak penting untuk diringkas

Jadi LLM bisa menerima banyak teks yang tidak berhubungan dengan isi utama halaman.

### Masalah kedua: panjang konten

Pada script awal, seluruh teks langsung dikirim ke LLM dalam satu kali proses. Kalau website memiliki konten yang sangat panjang, input bisa menjadi terlalu besar dan hasil summary juga bisa menjadi kurang fokus atau terlalu panjang.

> **Bottleneck utama:** scraping terlalu banyak mengambil content yang tidak diperlukan, dan long content langsung dikirim ke LLM sekaligus.

---

## 03 — Perbaikan scraping

Untuk perbaikannya, saya tidak lagi menghapus HTML hanya menggunakan regex. Saya menggunakan Cheerio supaya bisa memilih bagian halaman yang memang diperlukan.

```ts
import * as cheerio from "cheerio";

async function scrapePage(url: string) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error("Gagal mengambil website");
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	// Menghapus bagian yang tidak diperlukan
	$("script, style, nav, footer, header, aside").remove();

	// Mengambil main content terlebih dahulu
	const content = $("main").text() || $("article").text() || $("body").text();

	return content.replace(/\s+/g, " ").trim();
}
```

Di bagian scraping saya ubah supaya sistem tidak mengambil seluruh teks secara mentah. Saya menggunakan Cheerio supaya bisa membuang elemen seperti navigation, footer, script, dan sidebar. Setelah itu sistem lebih memprioritaskan isi dari main atau article. Kalau tidak ditemukan, baru mengambil dari body.

---

## 04 — Menangani konten panjang

Setelah konten sudah lebih bersih, saya tambahkan proses untuk membagi teks menjadi beberapa bagian.

```ts
const MAX_CHUNK_WORDS = 1000;

function splitIntoChunks(text: string) {
	const words = text.replace(/\s+/g, " ").trim().split(" ");
	const chunks: string[] = [];

	for (let i = 0; i < words.length; i += MAX_CHUNK_WORDS) {
		chunks.push(words.slice(i, i + MAX_CHUNK_WORDS).join(" "));
	}

	return chunks;
}
```

Kemudian setiap bagian diringkas terlebih dahulu.

```ts
async function summarizeLongContent(text: string) {
	const chunks = splitIntoChunks(text);
	const summaries: string[] = [];

	for (const chunk of chunks) {
		const summary = await summarizeText(chunk);
		summaries.push(summary);
	}

	const combinedSummary = summaries.join("\n");
	return summarizeText(combinedSummary);
}
```

Untuk konten yang panjang, saya tidak langsung mengirim seluruh isi website ke LLM. Saya bagi dulu menjadi beberapa chunk berdasarkan jumlah kata supaya pemotongannya tidak terjadi di tengah kata. Masing-masing chunk diringkas, lalu hasil ringkasannya digabung dan diringkas sekali lagi menjadi satu final summary.

---

## 05 — Guardrail ringkasan

Karena soal juga meminta agar summary tetap concise, saya tambahkan guardrail. Pertama dari prompt:

```ts
async function summarizeText(text: string) {
	const prompt = `
    Ringkas konten berikut.
    Fokus hanya pada informasi utama.
    Maksimal 150 kata.

    Content:
    ${text}
  `;

	return callLLM(prompt);
}
```

Lalu saya tetap tambahkan pengecekan dari sisi program.

```ts
const MAX_SUMMARY_WORDS = 150;

function applyGuardrail(summary: string) {
	const words = summary.trim().split(/\s+/);

	if (words.length <= MAX_SUMMARY_WORDS) {
		return summary;
	}

	return words.slice(0, MAX_SUMMARY_WORDS).join(" ") + "...";
}
```

Saya tidak hanya meminta LLM membuat summary maksimal 150 kata, tetapi saya juga tetap mengecek hasil akhirnya dari program. Jadi kalau LLM masih menghasilkan jawaban lebih panjang dari batas tersebut, guardrail akan membatasi outputnya.

---

## 06 — Perubahan alur

### Sebelum

```text
Fetch Website
      ↓
Ambil Semua Teks
      ↓
LLM
      ↓
Summary
```

### Sesudah

```text
Fetch Website
      ↓
Parse HTML
      ↓
Buang Elemen yang Tidak Dibutuhkan
      ↓
Ambil Main Content
      ↓
Konten Panjang?
      ↓
Bagi Menjadi Chunk
      ↓
Ringkas Setiap Chunk
      ↓
Gabungkan Hasil
      ↓
Final Summary
      ↓
Guardrail
      ↓
Output
```

---

## 07 — Hasil pengujian

Setelah kedua script selesai, saya mencoba menjalankannya menggunakan website `https://info.cern.ch/`. Website tersebut saya pilih sebagai contoh halaman sederhana supaya hasil dari script awal dan script setelah perbaikan bisa dibandingkan secara langsung.

![Perbandingan hasil Webscrape dan Webscrape2](./Task2.png)

Pada bagian atas gambar, `Webscrape.ts` berhasil mengambil isi website dan menghasilkan ringkasan. Tetapi hasilnya masih cukup panjang dan beberapa informasi ditampilkan kembali dalam bentuk daftar.

Pada bagian bawah gambar, `Webscrape2.ts` menghasilkan jawaban yang lebih singkat dan langsung membahas informasi utama. Hal ini terjadi karena konten sudah dibersihkan terlebih dahulu, diproses melalui alur ringkasan yang lebih terkontrol, lalu dibatasi oleh guardrail.

Dari percobaan tersebut, kedua script sama-sama dapat digunakan. Perbedaannya adalah versi awal lebih cocok untuk halaman sederhana, sedangkan versi kedua lebih siap ketika struktur halaman lebih kompleks atau isi website lebih panjang.
