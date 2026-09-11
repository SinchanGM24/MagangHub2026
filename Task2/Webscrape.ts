import { callLLM } from "./callLLM.js";

/**
 * SIMPLE: dapat digunakan untuk halaman sederhana, tetapi seluruh
 * teks HTML dikirim sekaligus sehingga kurang baik untuk halaman kompleks.
 */

export async function scrapeAndSummarize(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil website: HTTP ${response.status}`);
  }

  const html = await response.text();

  // Cara sederhana: hapus tag menggunakan regex dan kirim semuanya ke LLM.
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return callLLM(`
Ringkas isi website berikut dalam maksimal 150 kata.

Content:
${text}
  `.trim());
}

const url = process.argv[2];
if (!url) {
  console.error("Penggunaan: npm run webscrape -- <URL>");
  process.exit(1);
}

try {
  new URL(url);
  console.log(await scrapeAndSummarize(url));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
