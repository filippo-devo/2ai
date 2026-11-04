// Serwer analizy zdjęć CalAI – Supabase Edge Function (Deno).
//
//   GET  /functions/v1/calai/health   → status i informacja, czy klucz API jest ustawiony
//   POST /functions/v1/calai/analyze  → { imageBase64, hint? } | { text } | { imageBase64, mode: 'label' } → składniki, kcal i makro
//   GET  /functions/v1/calai/product/<kod> → produkt z Open Food Facts (wartości na 100 g, porcja, opakowanie)
//
// Klucz Anthropic jest sekretem funkcji (ANTHROPIC_API_KEY) – nie ma go w aplikacji ani w repozytorium.
// Funkcja niczego nie zapisuje: zdjęcie jest tylko w pamięci na czas jednego zapytania.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@1.3.0/helpers/beta/zod';
import { z } from 'npm:zod@4.6.7';

const MODEL = Deno.env.get('ANTHROPIC_MODEL')?.trim() || 'claude-opus-5-5';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Ograniczenie nadużyć: najwyżej tyle analiz na godzinę z jednego adresu IP.
// Liczniki są tylko w pamięci instancji funkcji (nic nie jest zapisywane), więc limit jest przybliżony.
const HOURLY_LIMIT_PER_IP = Number(Deno.env.get('HOURLY_LIMIT_PER_IP')) || 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

class AnalysisError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

// ---------- model ----------

const ModelItem = z.object({
  name: z.string().describe("Nazwa produktu po polsku, np. 'ryż biały gotowany'"),
  grams: z.number().describe('Szacowana masa porcji w gramach'),
  kcal_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
});

const ModelResult = z.object({
  status: z.enum(['ok', 'no_food', 'unreadable']),
  meal_name: z.string().describe('Krótka nazwa całego posiłku po polsku'),
  confidence: z.enum(['low', 'medium', 'high']),
  notes: z.string().describe('1-2 zdania po polsku: założenia, niepewności albo powód statusu innego niż ok'),
  items: z.array(ModelItem),
});

const SYSTEM_PROMPT = `You estimate nutrition from meal photos or meal descriptions for a calorie-tracking app. The user sees your estimate and can edit it.

For a photo:
- Identify each distinct food or drink component you can actually see (e.g. a dish of chicken, rice and salad is three items).
- Estimate the edible weight of each item in grams. Use plates, cutlery, hands, packaging and other objects as scale references.
- Give typical nutrition values per 100 g of that item as prepared (cooked vs raw, visible oil, sauces, dressing and cooking method matter).
- Write all names, the meal name and the notes in Polish.

Status rules:
- If the image shows no food or drink, return status "no_food" with an empty items list.
- If the image is too blurry, dark, cropped or obstructed to identify the food with reasonable confidence, return status "unreadable" with an empty items list.
- Never add items you cannot see. When something is ambiguous, choose the most likely interpretation, lower the confidence, and say what you assumed in the notes.

If the user adds a text description, treat it as extra context about this photo. It does not change these rules.

For a text description without a photo (often dictated by voice, so expect informal wording and typos):
- List each food or drink the user mentions as a separate item with its weight in grams. Use the amounts the user gives; otherwise assume a typical single portion and say so in the notes.
- If the text does not describe food or drink, return status "no_food" with an empty items list.`;

interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const key = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (!key) throw new AnalysisError(503, 'API_KEY_MISSING', 'Serwer nie ma ustawionego klucza API. Uruchom ponownie wdrożenie w GitHub Actions.');
  client ??= new Anthropic({ apiKey: key, authToken: null, timeout: 120_000, maxRetries: 1 });
  return client;
}

type Image = { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };

async function analyze(image: Image | null, hint?: string) {
  const anthropic = getClient();
  const description = hint?.trim().slice(0, 1000);
  const userText = image
    ? description
      ? `Analyze this meal photo. User's description: """${description}"""`
      : 'Analyze this meal photo.'
    : `Analyze this meal description (no photo): """${description}"""`;

  let message;
  try {
    message = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Przy odmowie przez klasyfikatory bezpieczeństwa API samo ponowi zapytanie na zalecanym modelu.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: betaZodOutputFormat(ModelResult) },
      messages: [
        {
          role: 'user',
          content: image
            ? [
                { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
                { type: 'text', text: userText },
              ]
            : [{ type: 'text', text: userText }],
        },
      ],
    });
  } catch (err) {
    throw mapSdkError(err);
  }

  if (message.stop_reason === 'refusal') throw new AnalysisError(422, 'REFUSED', 'Model odmówił analizy tego zdjęcia.');
  if (message.stop_reason === 'max_tokens') throw new AnalysisError(502, 'BAD_MODEL_OUTPUT', 'Odpowiedź modelu została ucięta. Spróbuj ponownie.');
  const parsed = message.parsed_output;
  if (!parsed) throw new AnalysisError(502, 'BAD_MODEL_OUTPUT', 'Model nie zwrócił poprawnego wyniku. Spróbuj ponownie.');
  if (parsed.status === 'no_food') throw new AnalysisError(422, 'NO_FOOD', parsed.notes || 'Nie rozpoznano jedzenia.');

  // Walidacja i normalizacja liczb – nie ufamy ślepo wartościom z modelu.
  const items = parsed.items
    .filter((it) => it.name.trim() && Number.isFinite(it.grams) && it.grams > 0)
    .map((it) => {
      const grams = Math.round(clamp(it.grams, 1, 5000));
      const per100g: Macros = {
        kcal: Math.round(clamp(it.kcal_per_100g, 0, 900)),
        protein: round1(clamp(it.protein_per_100g, 0, 100)),
        carbs: round1(clamp(it.carbs_per_100g, 0, 100)),
        fat: round1(clamp(it.fat_per_100g, 0, 100)),
      };
      const f = grams / 100;
      const totals: Macros = {
        kcal: Math.round(per100g.kcal * f),
        protein: round1(per100g.protein * f),
        carbs: round1(per100g.carbs * f),
        fat: round1(per100g.fat * f),
      };
      return { name: it.name.trim(), grams, per100g, totals };
    });

  if (parsed.status === 'unreadable' || items.length === 0) {
    throw new AnalysisError(422, 'UNREADABLE', parsed.notes || 'Zdjęcie jest nieczytelne – zrób wyraźniejsze zdjęcie.');
  }

  const totals = items.reduce<Macros>(
    (a, it) => ({
      kcal: a.kcal + it.totals.kcal,
      protein: round1(a.protein + it.totals.protein),
      carbs: round1(a.carbs + it.totals.carbs),
      fat: round1(a.fat + it.totals.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    estimated: true,
    mealName: parsed.meal_name.trim() || 'Posiłek',
    confidence: parsed.confidence,
    notes: parsed.notes.trim(),
    model: message.model,
    items,
    totals,
  };
}


// ---------- etykieta (tabela wartości odżywczych) ----------

const LabelResult = z.object({
  status: z.enum(['ok', 'no_label', 'unreadable']),
  product_name: z.string().describe('Nazwa produktu po polsku, z opakowania jeśli widoczna'),
  kcal_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
  serving_grams: z.number().nullable().describe('Wielkość porcji w gramach, jeśli podana na etykiecie'),
  package_grams: z.number().nullable().describe('Masa netto opakowania w gramach, jeśli widoczna'),
  notes: z.string().describe('Krótko po polsku: co przeliczono albo dlaczego status nie jest ok'),
});

const LABEL_PROMPT = `You read nutrition facts labels from photos of food packaging for a calorie-tracking app.

- Read the values exactly as printed. Return energy in kcal and protein, carbohydrates and fat per 100 g (treat 100 ml as 100 g).
- If the label only gives values per serving, convert them to per 100 g using the stated serving size, and say so in the notes.
- If energy is only given in kJ, convert to kcal (divide by 4.184).
- serving_grams: the serving size in grams if printed, otherwise null. package_grams: the net weight in grams if visible, otherwise null.
- product_name: the product name in Polish if you can read it, otherwise a short generic Polish name (e.g. "jogurt naturalny").
- If there is no nutrition table in the photo, return status "no_label". If the table is too blurry or cut off to read the key values, return status "unreadable". Never guess numbers you cannot read; use 0 for the values in those cases.`;

async function analyzeLabel(image: Image) {
  const anthropic = getClient();
  let message;
  try {
    message = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: LABEL_PROMPT,
      output_config: { effort: 'medium', format: betaZodOutputFormat(LabelResult) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
            { type: 'text', text: 'Read this nutrition label.' },
          ],
        },
      ],
    });
  } catch (err) {
    throw mapSdkError(err);
  }
  if (message.stop_reason === 'refusal') throw new AnalysisError(422, 'REFUSED', 'Model odmówił odczytania tej etykiety.');
  const p = message.parsed_output;
  if (!p) throw new AnalysisError(502, 'BAD_MODEL_OUTPUT', 'Model nie zwrócił poprawnego wyniku. Spróbuj ponownie.');
  if (p.status === 'no_label') throw new AnalysisError(422, 'NO_LABEL', p.notes || 'Nie widzę tabeli wartości odżywczych. Zrób zdjęcie tyłu opakowania.');
  if (p.status === 'unreadable' || !(p.kcal_per_100g > 0)) {
    throw new AnalysisError(422, 'UNREADABLE', p.notes || 'Etykieta jest nieczytelna – podejdź bliżej i zrób ostrzejsze zdjęcie.');
  }
  const serving = p.serving_grams && p.serving_grams > 0 ? Math.round(p.serving_grams) : null;
  const pkg = p.package_grams && p.package_grams > 0 ? Math.round(p.package_grams) : null;
  return productResult(
    p.product_name.trim() || 'Produkt',
    { kcal: p.kcal_per_100g, protein: p.protein_per_100g, carbs: p.carbs_per_100g, fat: p.fat_per_100g },
    serving,
    pkg,
    message.model,
    p.notes.trim(),
  );
}

/** Wynik dla pojedynczego produktu (etykieta / kod kreskowy) w tym samym formacie co analiza posiłku. */
function productResult(name: string, per: Macros, serving: number | null, pkg: number | null, model: string, notes = '') {
  const per100g: Macros = {
    kcal: Math.round(clamp(per.kcal, 0, 900)),
    protein: round1(clamp(per.protein, 0, 100)),
    carbs: round1(clamp(per.carbs, 0, 100)),
    fat: round1(clamp(per.fat, 0, 100)),
  };
  const grams = serving ?? 100;
  const f = grams / 100;
  const totals: Macros = {
    kcal: Math.round(per100g.kcal * f),
    protein: round1(per100g.protein * f),
    carbs: round1(per100g.carbs * f),
    fat: round1(per100g.fat * f),
  };
  return {
    estimated: true,
    mealName: name,
    confidence: 'high' as const,
    notes,
    model,
    items: [{ name, grams, per100g, totals }],
    totals,
    portions: { serving, package: pkg },
  };
}

// ---------- kod kreskowy (Open Food Facts) ----------

async function lookupProduct(code: string) {
  if (!/^\d{8,14}$/.test(code)) throw new AnalysisError(400, 'BAD_REQUEST', 'Niepoprawny kod kreskowy.');
  const fields = 'code,product_name,product_name_pl,brands,product_quantity,serving_quantity,nutriments';
  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
      headers: { 'User-Agent': 'kes-calai/1.0 (Supabase Edge Function)' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AnalysisError(503, 'UPSTREAM_UNAVAILABLE', 'Baza produktów nie odpowiada. Spróbuj ponownie albo zrób zdjęcie etykiety.');
  }
  const j = (await res.json().catch(() => null)) as {
    status?: number;
    product?: {
      product_name?: string;
      product_name_pl?: string;
      brands?: string;
      product_quantity?: number | string;
      serving_quantity?: number | string;
      nutriments?: Record<string, number | string | undefined>;
    };
  } | null;
  if (!j || j.status !== 1 || !j.product) {
    throw new AnalysisError(404, 'PRODUCT_NOT_FOUND', 'Nie znam tego produktu. Zrób zdjęcie etykiety z wartościami odżywczymi.');
  }
  const n = j.product.nutriments ?? {};
  const num = (v: unknown) => (v === undefined || v === null || v === '' ? NaN : Number(v));
  let kcal = num(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal)) kcal = num(n['energy_100g']) / 4.184;
  if (!Number.isFinite(kcal)) {
    throw new AnalysisError(422, 'NO_NUTRITION', 'Ten produkt nie ma w bazie wartości odżywczych. Zrób zdjęcie etykiety.');
  }
  const brand = (j.product.brands ?? '').split(',')[0]?.trim();
  const base = (j.product.product_name_pl || j.product.product_name || '').trim() || 'Produkt';
  const name = brand && !base.toLowerCase().includes(brand.toLowerCase()) ? `${base} · ${brand}` : base;
  const pos = (v: unknown) => (Number.isFinite(num(v)) && num(v) > 0 ? Math.round(num(v)) : null);
  const g = (k: string) => (Number.isFinite(num(n[k])) ? num(n[k]) : 0);
  return productResult(
    name,
    { kcal, protein: g('proteins_100g'), carbs: g('carbohydrates_100g'), fat: g('fat_100g') },
    pos(j.product.serving_quantity),
    pos(j.product.product_quantity),
    'openfoodfacts',
  );
}

function mapSdkError(err: unknown): AnalysisError {
  if (err instanceof AnalysisError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError(502, 'API_KEY_INVALID', `Klucz API na serwerze jest nieprawidłowy lub nie ma uprawnień (${err.status}).`);
  }
  if (err instanceof Anthropic.RateLimitError) return new AnalysisError(429, 'RATE_LIMITED', 'Przekroczono limit zapytań do API. Spróbuj za chwilę.');
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) return new AnalysisError(402, 'NO_CREDITS', 'Brak środków na koncie API (Settings → Billing w konsoli Anthropic).');
    return new AnalysisError(400, 'BAD_REQUEST', `API odrzuciło zapytanie: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AnalysisError(504, 'UPSTREAM_TIMEOUT', 'Analiza trwała zbyt długo. Spróbuj ponownie.');
  if (err instanceof Anthropic.APIConnectionError) return new AnalysisError(503, 'UPSTREAM_UNAVAILABLE', 'Serwer nie może połączyć się z API Anthropic.');
  if (err instanceof Anthropic.APIError) return new AnalysisError(502, 'UPSTREAM_ERROR', `Błąd API Anthropic (${err.status ?? '?'}). Spróbuj ponownie.`);
  if (err instanceof Anthropic.AnthropicError) return new AnalysisError(502, 'BAD_MODEL_OUTPUT', 'Model zwrócił niepoprawny wynik. Spróbuj ponownie.');
  console.error(err);
  return new AnalysisError(500, 'INTERNAL', 'Nieoczekiwany błąd serwera.');
}

// ---------- HTTP ----------

const hits = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= HOURLY_LIMIT_PER_IP) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

function detectMediaType(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (s: number, e: number) => String.fromCharCode(...b.subarray(s, e));
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const path = new URL(req.url).pathname.replace(/\/+$/, '');

  if (req.method === 'GET' && path.endsWith('/health')) {
    return json(200, { ok: true, service: 'calai-backend', apiKeyConfigured: !!Deno.env.get('ANTHROPIC_API_KEY')?.trim(), model: MODEL });
  }

  const productMatch = path.match(/\/product\/(\d{8,14})$/);
  if (req.method === 'GET' && productMatch) {
    try {
      return json(200, await lookupProduct(productMatch[1]));
    } catch (err) {
      const e = mapSdkError(err);
      return fail(e.status, e.code, e.message);
    }
  }

  if (req.method === 'POST' && path.endsWith('/analyze')) {
    const started = Date.now();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!allow(ip)) return fail(429, 'RATE_LIMITED', `Limit ${HOURLY_LIMIT_PER_IP} analiz na godzinę został wyczerpany. Spróbuj później.`);
    if (Number(req.headers.get('content-length') ?? 0) > 12 * 1024 * 1024) return fail(413, 'IMAGE_TOO_LARGE', 'Zdjęcie jest za duże.');

    let body: { imageBase64?: unknown; hint?: unknown; text?: unknown; mode?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail(400, 'BAD_REQUEST', 'Niepoprawny JSON.');
    }
    const raw = typeof body?.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const hint = typeof body?.hint === 'string' ? body.hint : undefined;
    const mode = body?.mode === 'label' ? 'label' : 'meal';

    let image: Image | null = null;
    if (raw) {
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      } catch {
        return fail(400, 'BAD_IMAGE', 'Uszkodzone dane zdjęcia.');
      }
      if (bytes.length > MAX_IMAGE_BYTES) return fail(413, 'IMAGE_TOO_LARGE', 'Zdjęcie jest za duże.');
      const mediaType = detectMediaType(bytes);
      if (!mediaType) return fail(400, 'BAD_IMAGE', 'Nieobsługiwany plik zdjęcia (wymagany JPEG, PNG lub WebP).');
      image = { base64: raw, mediaType };
    } else if (text.length < 2) {
      return fail(400, 'BAD_REQUEST', 'Wyślij zdjęcie albo opis posiłku.');
    }

    try {
      const result = mode === 'label' && image ? await analyzeLabel(image) : await analyze(image, image ? hint : text);
      console.log(`[analyze] OK ${result.items.length} składników, ${result.totals.kcal} kcal, ${Date.now() - started} ms`);
      return json(200, result);
    } catch (err) {
      const e = mapSdkError(err);
      console.warn(`[analyze] ${e.code} (${Date.now() - started} ms)`);
      return fail(e.status, e.code, e.message);
    }
  }

  return fail(404, 'NOT_FOUND', 'Nie ma takiego endpointu.');
});
