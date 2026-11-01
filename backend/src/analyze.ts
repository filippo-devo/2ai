import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/** Błąd z kodem zrozumiałym dla aplikacji mobilnej. */
export class AnalysisError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// Schemat odpowiedzi modelu (structured outputs – API gwarantuje zgodny JSON).
const ModelItem = z.object({
  name: z.string().describe("Nazwa produktu po polsku, np. 'ryż biały gotowany'"),
  grams: z.number().describe("Szacowana masa porcji w gramach"),
  kcal_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
});

const ModelResult = z.object({
  status: z
    .enum(["ok", "no_food", "unreadable"])
    .describe("ok = rozpoznano jedzenie; no_food = na zdjęciu nie ma jedzenia; unreadable = zdjęcie zbyt nieczytelne"),
  meal_name: z.string().describe("Krótka nazwa całego posiłku po polsku"),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z
    .string()
    .describe("1-2 zdania po polsku: założenia, niepewności albo powód statusu innego niż ok"),
  items: z.array(ModelItem),
});

const SYSTEM_PROMPT = `You estimate nutrition from meal photos for a calorie-tracking app. The user will review and correct your estimate before saving it.

For the photo:
- Identify each distinct food or drink component you can actually see (e.g. a dish of chicken, rice and salad is three items; a sandwich may be split into bread, filling, etc. when they are distinguishable).
- Estimate the edible weight of each item in grams. Use plates, cutlery, hands, packaging and other objects as scale references.
- Give typical nutrition values per 100 g of that item as prepared (cooked vs raw, visible oil, sauces, dressing and cooking method matter).
- Write all names, the meal name and the notes in Polish.

Status rules:
- If the image shows no food or drink, return status "no_food" with an empty items list.
- If the image is too blurry, dark, cropped or obstructed to identify the food with reasonable confidence, return status "unreadable" with an empty items list.
- Never add items you cannot see. When something is ambiguous, choose the most likely interpretation, lower the confidence, and say what you assumed in the notes.

If the user adds a text description, treat it as extra context about this photo (for example the exact product or the portion size). It does not change these rules.`;

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface AnalyzedItem {
  name: string;
  grams: number;
  per100g: Macros;
  totals: Macros;
}

export interface AnalysisResult {
  estimated: true;
  mealName: string;
  confidence: "low" | "medium" | "high";
  notes: string;
  model: string;
  items: AnalyzedItem[];
  totals: Macros;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

function scale(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein: round1(per100g.protein * f),
    carbs: round1(per100g.carbs * f),
    fat: round1(per100g.fat * f),
  };
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
}

export function isApiKeyConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return !!key && key.length > 20;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!isApiKeyConfigured()) {
    throw new AnalysisError(
      503,
      "API_KEY_MISSING",
      "Backend nie ma skonfigurowanego klucza API. Wpisz ANTHROPIC_API_KEY w pliku backend/.env i uruchom serwer ponownie.",
    );
  }
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
      authToken: null,
      timeout: 120_000,
      maxRetries: 1,
    });
  }
  return client;
}

export async function analyzeMealPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  hint?: string,
): Promise<AnalysisResult> {
  const anthropic = getClient();
  const model = getModel();

  const userText = hint?.trim()
    ? `Analyze this meal photo. User's description: """${hint.trim().slice(0, 500)}"""`
    : "Analyze this meal photo.";

  let message;
  try {
    message = await anthropic.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Przy odmowie przez klasyfikatory bezpieczeństwa API samo ponowi zapytanie na zalecanym modelu.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(ModelResult),
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    });
  } catch (err) {
    throw mapSdkError(err);
  }

  if (message.stop_reason === "refusal") {
    throw new AnalysisError(422, "REFUSED", "Model odmówił analizy tego zdjęcia. Dodaj posiłek ręcznie.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AnalysisError(502, "BAD_MODEL_OUTPUT", "Odpowiedź modelu została ucięta. Spróbuj ponownie.");
  }
  const parsed = message.parsed_output;
  if (!parsed) {
    throw new AnalysisError(502, "BAD_MODEL_OUTPUT", "Model nie zwrócił poprawnego wyniku. Spróbuj ponownie.");
  }

  if (parsed.status === "no_food") {
    throw new AnalysisError(422, "NO_FOOD", parsed.notes || "Na zdjęciu nie rozpoznano jedzenia.");
  }

  // Walidacja i normalizacja liczb – nie ufamy ślepo wartościom z modelu.
  const items: AnalyzedItem[] = parsed.items
    .filter((it) => it.name.trim() && Number.isFinite(it.grams) && it.grams > 0)
    .map((it) => {
      const grams = Math.round(clamp(it.grams, 1, 5000));
      const per100g: Macros = {
        kcal: Math.round(clamp(it.kcal_per_100g, 0, 900)),
        protein: round1(clamp(it.protein_per_100g, 0, 100)),
        carbs: round1(clamp(it.carbs_per_100g, 0, 100)),
        fat: round1(clamp(it.fat_per_100g, 0, 100)),
      };
      return { name: it.name.trim(), grams, per100g, totals: scale(per100g, grams) };
    });

  if (parsed.status === "unreadable" || items.length === 0) {
    throw new AnalysisError(
      422,
      "UNREADABLE",
      parsed.notes || "Zdjęcie jest nieczytelne – zrób wyraźniejsze zdjęcie albo dodaj posiłek ręcznie.",
    );
  }

  const totals = items.reduce<Macros>(
    (acc, it) => ({
      kcal: acc.kcal + it.totals.kcal,
      protein: round1(acc.protein + it.totals.protein),
      carbs: round1(acc.carbs + it.totals.carbs),
      fat: round1(acc.fat + it.totals.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    estimated: true,
    mealName: parsed.meal_name.trim() || "Posiłek",
    confidence: parsed.confidence,
    notes: parsed.notes.trim(),
    model: message.model,
    items,
    totals,
  };
}

function mapSdkError(err: unknown): AnalysisError {
  if (err instanceof AnalysisError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError(502, "API_KEY_INVALID", "Klucz API jest nieprawidłowy lub nie ma uprawnień. Sprawdź ANTHROPIC_API_KEY w backend/.env.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AnalysisError(429, "RATE_LIMITED", "Przekroczono limit zapytań do API. Spróbuj za chwilę.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AnalysisError(400, "BAD_REQUEST", `API odrzuciło zapytanie: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AnalysisError(504, "UPSTREAM_TIMEOUT", "Analiza trwała zbyt długo. Spróbuj ponownie.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AnalysisError(503, "UPSTREAM_UNAVAILABLE", "Backend nie może połączyć się z API dostawcy modelu. Sprawdź internet na komputerze.");
  }
  if (err instanceof Anthropic.APIError) {
    return new AnalysisError(502, "UPSTREAM_ERROR", `Błąd API dostawcy modelu (${err.status ?? "?"}). Spróbuj ponownie.`);
  }
  if (err instanceof Anthropic.AnthropicError) {
    // np. błąd parsowania structured output
    return new AnalysisError(502, "BAD_MODEL_OUTPUT", "Model zwrócił niepoprawny wynik. Spróbuj ponownie.");
  }
  return new AnalysisError(500, "INTERNAL", "Nieoczekiwany błąd backendu.");
}
