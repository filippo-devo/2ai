import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import os from "node:os";
import { AnalysisError, analyzeMeal, getModel, isApiKeyConfigured, type MealImage } from "./analyze.js";

const PORT = Number(process.env.PORT) || 3001;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const app = express();
app.disable("x-powered-by");

// Prosty CORS – przydatny tylko przy testowaniu aplikacji w przeglądarce (expo start --web).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "12mb" }));

function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

/** Rozpoznaje format obrazu po nagłówku pliku (nie ufamy deklaracji klienta). */
function detectMediaType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "calai-backend", apiKeyConfigured: isApiKeyConfigured(), model: getModel() });
});

app.post("/analyze", async (req: Request, res: Response) => {
  const started = Date.now();
  const body = req.body as { imageBase64?: unknown; hint?: unknown; text?: unknown } | undefined;
  const raw = typeof body?.imageBase64 === "string" ? body.imageBase64.replace(/^data:[^;]+;base64,/, "") : "";
  const hint = typeof body?.hint === "string" ? body.hint : undefined;
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  // Zdjęcie istnieje wyłącznie w pamięci na czas tego zapytania – nic nie jest zapisywane na dysku.
  let image: MealImage | null = null;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length > MAX_IMAGE_BYTES) return sendError(res, 413, "IMAGE_TOO_LARGE", "Zdjęcie jest za duże.");
    const mediaType = detectMediaType(buf);
    if (!mediaType) return sendError(res, 400, "BAD_IMAGE", "Nieobsługiwany lub uszkodzony plik zdjęcia (wymagany JPEG, PNG lub WebP).");
    image = { base64: buf.toString("base64"), mediaType };
  } else if (text.length < 2) {
    return sendError(res, 400, "BAD_REQUEST", "Wyślij zdjęcie albo opis posiłku.");
  }

  try {
    const result = await analyzeMeal(image, image ? hint : text);
    console.log(`[analyze] OK ${result.items.length} składników, ${result.totals.kcal} kcal, ${Date.now() - started} ms`);
    res.json(result);
  } catch (err) {
    const e = err instanceof AnalysisError ? err : new AnalysisError(500, "INTERNAL", "Nieoczekiwany błąd backendu.");
    console.warn(`[analyze] ${e.code} (${Date.now() - started} ms): ${e.message}`);
    if (!(err instanceof AnalysisError)) console.error(err);
    sendError(res, e.status, e.code, e.message);
  }
});

app.use((_req, res) => sendError(res, 404, "NOT_FOUND", "Nie ma takiego endpointu."));

// Błędy parsowania JSON / za duże body.
app.use((err: { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === "entity.too.large") return sendError(res, 413, "IMAGE_TOO_LARGE", "Zdjęcie jest za duże.");
  if (err.type === "entity.parse.failed") return sendError(res, 400, "BAD_REQUEST", "Niepoprawny JSON.");
  console.error(err);
  sendError(res, 500, "INTERNAL", "Nieoczekiwany błąd backendu.");
});

app.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
  console.log(`\nCalAI backend działa na porcie ${PORT}`);
  console.log(`Model: ${getModel()}`);
  console.log(
    isApiKeyConfigured()
      ? "Klucz API: skonfigurowany"
      : "UWAGA: brak ANTHROPIC_API_KEY w backend/.env – analiza zdjęć będzie zwracać błąd API_KEY_MISSING",
  );
  if (ips.length) {
    console.log("\nWpisz w aplikacji (Ustawienia → Adres backendu) jeden z adresów:");
    for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
  }
  console.log("");
});
