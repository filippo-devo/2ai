/**
 * Test bezpośredniej analizy (src/lib/claude.ts) z podstawionym fetch – sprawdza parsowanie
 * odpowiedzi API, fallback, odmowę i mapowanie błędów. Uruchomienie: npm run test:claude
 */
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api';
import { analyzeWithClaude } from '../src/lib/claude';

type Handler = (init: RequestInit) => { status: number; body: unknown } | Error;

function mockFetch(handler: Handler) {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const r = handler(init);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const ok = {
  status: 'ok',
  meal_name: 'Jajecznica z chlebem',
  confidence: 'medium',
  notes: 'Założono smażenie na maśle.',
  items: [
    { name: 'jajecznica', grams: 150, kcal_per_100g: 160, protein_per_100g: 11, carbs_per_100g: 1, fat_per_100g: 12 },
    { name: 'chleb pszenny', grams: 60, kcal_per_100g: 260, protein_per_100g: 8, carbs_per_100g: 50, fat_per_100g: 3 },
    { name: '', grams: 10, kcal_per_100g: 1, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 0 },
  ],
};

async function expectCode(code: string) {
  await assert.rejects(analyzeWithClaude('sk-ant-test-key-000000000000', 'AAAA'), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.code, code);
    return true;
  });
}

async function main() {
  // 1. Poprawny wynik + sprawdzenie wysłanego zapytania
  let sent: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  mockFetch((init) => {
    sent = JSON.parse(String(init.body));
    headers = init.headers as Record<string, string>;
    return { status: 200, body: { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(ok) }] } };
  });
  const r = await analyzeWithClaude('sk-ant-test-key-000000000000', 'AAAA', 'jajecznica');
  assert.equal(r.items.length, 2, 'pusty składnik odfiltrowany');
  assert.equal(r.totals.kcal, 240 + 156);
  assert.equal(r.totals.protein, 16.5 + 4.8);
  assert.equal(r.estimated, true);
  assert.equal(headers['x-api-key'], 'sk-ant-test-key-000000000000');
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.equal(headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.fallbacks, 'default');
  assert.deepEqual((sent.output_config as { effort: string }).effort, 'medium');
  assert.equal(((sent.output_config as { format: { type: string } }).format).type, 'json_schema');

  // 2. Fallback: liczy się tekst po bloku "fallback"
  mockFetch(() => ({
    status: 200,
    body: {
      model: 'claude-opus-4-8',
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: '{"status":' },
        { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
        { type: 'text', text: JSON.stringify(ok) },
      ],
    },
  }));
  assert.equal((await analyzeWithClaude('sk-ant-test-key-000000000000', 'AAAA')).model, 'claude-opus-4-8');

  // 3. Błędy
  mockFetch(() => ({ status: 200, body: { stop_reason: 'refusal', content: [] } }));
  await expectCode('REFUSED');
  mockFetch(() => ({ status: 401, body: { error: { type: 'authentication_error', message: 'invalid x-api-key' } } }));
  await expectCode('API_KEY_INVALID');
  mockFetch(() => ({ status: 429, body: { error: { message: 'rate' } } }));
  await expectCode('RATE_LIMITED');
  mockFetch(() => ({ status: 529, body: { error: { message: 'overloaded' } } }));
  await expectCode('UPSTREAM_ERROR');
  mockFetch(() => new TypeError('Network request failed'));
  await expectCode('NO_INTERNET');
  mockFetch(() => ({ status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ ...ok, status: 'no_food', items: [] }) }] } }));
  await expectCode('NO_FOOD');
  mockFetch(() => ({ status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ ...ok, status: 'unreadable', items: [] }) }] } }));
  await expectCode('UNREADABLE');
  mockFetch(() => ({ status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'nie JSON' }] } }));
  await expectCode('BAD_MODEL_OUTPUT');

  console.log('OK – analiza bezpośrednia: parsowanie, fallback i mapowanie błędów działają.');
}

main().catch((e) => {
  console.error('TEST NIEUDANY:', e);
  process.exit(1);
});
