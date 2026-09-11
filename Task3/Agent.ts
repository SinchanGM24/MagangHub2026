import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type FunctionCall = {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
};

type Part = {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
};

type Content = {
  role: "user" | "model";
  parts: Part[];
};

type GeminiResponse = {
  candidates?: Array<{ content?: Content }>;
};

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const baseUrl = process.env.GEMINI_API_URL
  ?? "https://generativelanguage.googleapis.com/v1beta";

if (!apiKey) {
  throw new Error("GEMINI_API_KEY belum tersedia di file .env");
}

const calculatorDeclaration = {
  name: "calculator",
  description:
    "Menghitung ekspresi aritmetika. Gunakan hanya ketika pertanyaan membutuhkan perhitungan matematika; jangan gunakan untuk pertanyaan faktual biasa.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Ekspresi berisi angka, tanda kurung, +, -, *, /, atau %.",
      },
    },
    required: ["expression"],
  },
};

class ArithmeticParser {
  private position = 0;

  constructor(private readonly expression: string) {}

  parse(): number {
    const result = this.parseExpression();
    this.skipSpaces();
    if (this.position !== this.expression.length || !Number.isFinite(result)) {
      throw new Error("Ekspresi matematika tidak valid");
    }
    return result;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      if (this.consume("+")) value += this.parseTerm();
      else if (this.consume("-")) value -= this.parseTerm();
      else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (true) {
      this.skipSpaces();
      if (this.consume("*")) value *= this.parseFactor();
      else if (this.consume("/")) value /= this.parseFactor();
      else if (this.consume("%")) value %= this.parseFactor();
      else return value;
    }
  }

  private parseFactor(): number {
    this.skipSpaces();
    if (this.consume("+")) return this.parseFactor();
    if (this.consume("-")) return -this.parseFactor();

    if (this.consume("(")) {
      const value = this.parseExpression();
      this.skipSpaces();
      if (!this.consume(")")) throw new Error("Tanda kurung tidak lengkap");
      return value;
    }

    const remainder = this.expression.slice(this.position);
    const number = remainder.match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
    if (!number) throw new Error("Angka tidak ditemukan");
    this.position += number.length;
    return Number(number);
  }

  private skipSpaces(): void {
    while (/\s/.test(this.expression[this.position] ?? "")) this.position++;
  }

  private consume(character: string): boolean {
    if (this.expression[this.position] !== character) return false;
    this.position++;
    return true;
  }
}

function calculate(expression: string): number {
  if (!/^[\d\s+\-*/().%]+$/.test(expression)) {
    throw new Error("Calculator hanya menerima ekspresi aritmetika");
  }
  return new ArithmeticParser(expression).parse();
}

class DocumentAgent {
  private readonly history: Content[] = [];
  private rememberedName?: string;

  constructor(private readonly document: string) {}

  async ask(question: string): Promise<string> {
    this.rememberName(question);
    this.history.push({ role: "user", parts: [{ text: question }] });

    for (let step = 0; step < 3; step++) {
      const modelContent = await this.generate();
      this.history.push(modelContent);

      const functionCall = modelContent.parts
        .map((part) => part.functionCall)
        .find((call): call is FunctionCall => Boolean(call));

      if (!functionCall) {
        const answer = modelContent.parts
          .map((part) => part.text ?? "")
          .join("")
          .trim();
        if (!answer) throw new Error("Gemini tidak memberikan jawaban");
        return answer;
      }

      const toolResult = this.executeTool(functionCall);
      this.history.push({
        role: "user",
        parts: [{
          functionResponse: {
            ...(functionCall.id ? { id: functionCall.id } : {}),
            name: functionCall.name,
            response: toolResult,
          },
        }],
      });
    }

    throw new Error("Agent melewati batas maksimum pemanggilan tool");
  }

  private rememberName(question: string): void {
    const match = question.match(/(?:nama saya|panggil saya)\s+([\p{L}][\p{L}\s'-]{0,50})/iu);
    if (match) this.rememberedName = match[1].trim().replace(/[.!?]+$/, "");
  }

  private executeTool(call: FunctionCall): Record<string, unknown> {
    if (call.name !== "calculator") {
      return { error: `Tool ${call.name} tidak tersedia` };
    }

    const expression = String(call.args?.expression ?? "");
    console.log(`[Tool] calculator dipanggil untuk: ${expression}`);

    try {
      return { expression, result: calculate(expression) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async generate(): Promise<Content> {
    const knownName = this.rememberedName
      ? `Nama pengguna yang tersimpan dalam memory: ${this.rememberedName}.`
      : "Nama pengguna belum diketahui.";

    const response = await fetch(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey!,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `
Anda adalah agent informasi lowongan Frontend Developer.
Jawab pertanyaan tentang lowongan hanya berdasarkan SAMPLE DOCUMENT di bawah.
Jika jawabannya tidak ada di dokumen, katakan bahwa informasi tersebut tidak tersedia.
Anda boleh menjawab sapaan dan pertanyaan tentang konteks percakapan.
Ingat nama dan konteks pengguna dari conversation history.
${knownName}
Gunakan calculator hanya jika diperlukan perhitungan aritmetika. Jangan panggil calculator untuk pertanyaan faktual biasa.

--- SAMPLE DOCUMENT ---
${this.document}
--- END DOCUMENT ---
            `.trim() }],
          },
          contents: this.history,
          tools: [{ functionDeclarations: [calculatorDeclaration] }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini API gagal: HTTP ${response.status} - ${await response.text()}`);
    }

    const data = await response.json() as GeminiResponse;
    const content = data.candidates?.[0]?.content;
    if (!content?.parts?.length) throw new Error("Respons Gemini kosong");
    return content;
  }
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const document = await readFile(join(currentDirectory, "sample-document.md"), "utf8");
const agent = new DocumentAgent(document);
const initialQuestions = process.argv.slice(2);

if (initialQuestions.length > 0) {
  for (const question of initialQuestions) {
    console.log(`\nAnda: ${question}`);
    console.log(`Agent: ${await agent.ask(question)}`);
  }
} else {
  const terminal = createInterface({ input, output });
  console.log("Agent Lowongan Frontend aktif. Ketik 'keluar' untuk berhenti.\n");

  while (true) {
    const question = (await terminal.question("Anda: ")).trim();
    if (["keluar", "exit", "quit"].includes(question.toLowerCase())) break;
    if (!question) continue;

    try {
      console.log(`Agent: ${await agent.ask(question)}\n`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  terminal.close();
}
