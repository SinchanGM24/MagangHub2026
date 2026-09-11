import * as cheerio from "cheerio";
import { callLLM } from "./callLLM.js";

const MAX_CHUNK_WORDS = 1_000;
const MAX_SUMMARY_WORDS = 150;
const REQUEST_TIMEOUT_MS = 15_000;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function scrapePage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "ContentSummarizer/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil website: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("URL tidak mengembalikan halaman HTML");
  }

  const $ = cheerio.load(await response.text());

  $(
    "script, style, noscript, nav, footer, header, aside, iframe, form, " +
      "[aria-hidden='true'], .advertisement, .ads, .cookie-banner",
  ).remove();

  // Pertahankan pemisah antarelemen sebelum teks diekstrak.
  $("br, p, div, section, article, h1, h2, h3, h4, li").append(" ");

  const selectors = [
    "main",
    "article",
    "[role='main']",
    ".main-content",
    ".content",
  ];

  const candidates = selectors
    .map((selector) => normalizeText($(selector).first().text()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const content = candidates[0] ?? normalizeText($("body").text());
  if (!content) throw new Error("Konten utama tidak ditemukan");

  return content;
}

function splitIntoChunks(text: string): string[] {
  const words = normalizeText(text).split(" ");
  const chunks: string[] = [];

  for (let index = 0; index < words.length; index += MAX_CHUNK_WORDS) {
    chunks.push(words.slice(index, index + MAX_CHUNK_WORDS).join(" "));
  }

  return chunks;
}

async function summarizeText(text: string, maxWords: number): Promise<string> {
  return callLLM(`
Ringkas konten berikut dalam Bahasa Indonesia.
Fokus hanya pada informasi utama dan jangan menambahkan fakta baru.
Gunakan maksimal ${maxWords} kata.

Content:
${text}
  `.trim());
}

function applyGuardrail(summary: string): string {
  const normalized = normalizeText(summary);
  if (!normalized) throw new Error("LLM menghasilkan ringkasan kosong");

  const words = normalized.split(" ");
  if (words.length <= MAX_SUMMARY_WORDS) return normalized;

  return `${words.slice(0, MAX_SUMMARY_WORDS).join(" ")}...`;
}

export async function scrapeAndSummarize(url: string): Promise<string> {
  const content = await scrapePage(url);
  const chunks = splitIntoChunks(content);
  const partialSummaries: string[] = [];

  for (const chunk of chunks) {
    partialSummaries.push(await summarizeText(chunk, 100));
  }

  const finalSummary = await summarizeText(
    partialSummaries.join("\n"),
    MAX_SUMMARY_WORDS,
  );

  return applyGuardrail(finalSummary);
}

const url = process.argv[2];
if (!url) {
  console.error("Penggunaan: npm run webscrape2 -- <URL>");
  process.exit(1);
}

try {
  new URL(url);
  console.log(await scrapeAndSummarize(url));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
