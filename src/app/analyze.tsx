import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, styles } from '../components/ui';
import { analyzePhoto, ApiError } from '../lib/api';
import { getEffectiveBackendUrl } from '../lib/backend';
import { defaultMealType, isValidDay, todayString } from '../lib/dates';
import { newKey, putDraft } from '../lib/draft';
import { prepareImage, type PreparedImage } from '../lib/image';
import type { MealDraft } from '../lib/types';

type Status =
  | { kind: 'preparing' }
  | { kind: 'ready' }
  | { kind: 'analyzing' }
  | { kind: 'error'; code: string; message: string };

export default function AnalyzeScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ uri: string; width?: string; height?: string; day?: string }>();
  const day = isValidDay(params.day) ? params.day : todayString();
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [hint, setHint] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'preparing' });
  const runId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const runs = runId;
    prepareImage(params.uri, Number(params.width) || undefined, Number(params.height) || undefined)
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        setStatus({ kind: 'ready' });
      })
      .catch((e) => !cancelled && setStatus({ kind: 'error', code: 'IMAGE_PREP', message: `Nie udało się wczytać zdjęcia: ${String(e)}` }));
    return () => {
      cancelled = true;
      runs.current++; // porzuć wynik trwającej analizy po wyjściu z ekranu
    };
  }, [params.uri, params.width, params.height]);

  async function run() {
    if (!image) return;
    const id = ++runId.current;
    setStatus({ kind: 'analyzing' });
    try {
      const result = await analyzePhoto(await getEffectiveBackendUrl(db), image.base64, hint);
      if (id !== runId.current) return;
      const draft: MealDraft = {
        day,
        mealType: defaultMealType(),
        name: result.mealName,
        photoFile: null,
        tempPhotoUri: image.uri,
        source: 'ai',
        aiConfidence: result.confidence,
        aiNotes: result.notes || null,
        items: result.items.map((it) => ({
          key: newKey(),
          name: it.name,
          grams: it.grams,
          per100: { ...it.per100g },
          aiEstimated: true,
        })),
      };
      router.replace({ pathname: '/meal/[id]', params: { id: 'new', draft: putDraft(draft) } });
    } catch (e) {
      if (id !== runId.current) return;
      if (e instanceof ApiError) setStatus({ kind: 'error', code: e.code, message: e.message });
      else setStatus({ kind: 'error', code: 'UNKNOWN', message: String(e) });
    }
  }

  function enterManually() {
    // Bez wyników AI – użytkownik sam wpisuje składniki, zdjęcie zostaje dołączone do posiłku.
    const draft: MealDraft = {
      day,
      mealType: defaultMealType(),
      name: hint.trim() || 'Posiłek',
      photoFile: null,
      tempPhotoUri: image?.uri ?? null,
      source: 'manual',
      aiConfidence: null,
      aiNotes: null,
      items: [],
    };
    router.replace({ pathname: '/meal/[id]', params: { id: 'new', draft: putDraft(draft) } });
  }

  const busy = status.kind === 'analyzing' || status.kind === 'preparing';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {image ? (
          <Image source={{ uri: image.uri }} style={{ width: '100%', aspectRatio: image.width / image.height || 1, borderRadius: 12 }} />
        ) : (
          <View style={{ height: 240, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        )}

        <Card>
          <Text style={styles.label}>Opcjonalny opis (pomaga AI), np. „owsianka na mleku 2%, ok. 300 g”</Text>
          <TextInput style={styles.input} value={hint} onChangeText={setHint} placeholder="Opis posiłku" editable={!busy} maxLength={300} />
          <Text style={styles.muted}>
            Po naciśnięciu „Analizuj” zdjęcie zostanie wysłane do serwera aplikacji i dalej do Anthropic. Serwer niczego nie
            zapisuje. Wynik to szacunek – sprawdź go przed zapisaniem.
          </Text>
        </Card>

        {status.kind === 'analyzing' && (
          <Card style={{ alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={styles.muted}>Analizuję zdjęcie… (zwykle 10–40 s)</Text>
          </Card>
        )}

        {status.kind === 'error' && (
          <Card style={{ borderColor: colors.danger }}>
            <Text style={[styles.h2, { color: colors.danger }]}>{errorTitle(status.code)}</Text>
            <Text style={styles.text}>{status.message}</Text>
            {['BACKEND_UNREACHABLE', 'BACKEND_NOT_CONFIGURED', 'NOT_CALAI_BACKEND', 'TIMEOUT'].includes(status.code) && (
              <Button title="Otwórz ustawienia backendu" variant="secondary" onPress={() => router.push('/settings')} />
            )}
          </Card>
        )}

        <Button
          title={status.kind === 'error' ? 'Spróbuj ponownie' : status.kind === 'analyzing' ? 'Analizuję…' : 'Analizuj'}
          onPress={run}
          disabled={busy || !image}
        />
        <Button title="Wpisz składniki ręcznie (z tym zdjęciem)" variant="secondary" onPress={enterManually} disabled={!image} />
        <Button title="Anuluj" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function errorTitle(code: string): string {
  switch (code) {
    case 'NO_FOOD':
      return 'Nie rozpoznano jedzenia';
    case 'UNREADABLE':
      return 'Zdjęcie jest nieczytelne';
    case 'API_KEY_MISSING':
      return 'Brak konfiguracji API';
    case 'API_KEY_INVALID':
      return 'Nieprawidłowy klucz API';
    case 'BACKEND_UNREACHABLE':
    case 'BACKEND_NOT_CONFIGURED':
    case 'NOT_CALAI_BACKEND':
      return 'Brak połączenia z backendem';
    case 'TIMEOUT':
    case 'UPSTREAM_TIMEOUT':
      return 'Przekroczono czas analizy';
    case 'RATE_LIMITED':
      return 'Za dużo zapytań';
    case 'REFUSED':
      return 'Analiza odrzucona';
    default:
      return 'Analiza nie powiodła się';
  }
}
