import "dotenv/config";

/**
 * Adapter LLM bersama untuk kedua web scraper.
 * Prompt dikirim ke Gemini API menggunakan REST generateContent.
 */
export async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const baseUrl = process.env.GEMINI_API_URL
    ?? "https://generativelanguage.googleapis.com/v1beta";

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum tersedia. Tambahkan API key ke file .env.",
    );
  }

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API gagal: HTTP ${response.status} - ${detail}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const result = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!result) throw new Error("Gemini API tidak mengembalikan teks");
  return result;
}
