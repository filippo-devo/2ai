import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, colors, styles } from '../components/ui';
import { analyzePhoto, ApiError } from '../lib/api';
import { getEffectiveBackendUrl } from '../lib/backend';
import { newKey } from '../lib/draft';
import { prepareImage } from '../lib/image';
import { fmtG, fmtKcal } from '../lib/nutrition';
import { deleteTempFile } from '../lib/photos';
import { session, useSession, type QuickEntry } from '../lib/session';

const CONFIDENCE: Record<string, string> = { low: 'niska', medium: 'średnia', high: 'wysoka' };

/**
 * Szybka analiza: zdjęcie → kalorie. Analizę robi serwer w chmurze (klucz API jest tylko tam).
 * Nic nie jest zapisywane – zdjęcia i wyniki są tylko w pamięci i znikają po zamknięciu aplikacji.
 */
export default function QuickScreen() {
  const db = useSQLiteContext();
  const { entries } = useSession();
  const [hint, setHint] = useState('');

  async function pick(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Brak dostępu do aparatu', 'Zezwól Expo Go na dostęp do aparatu w ustawieniach telefonu albo wybierz zdjęcie z galerii.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      await analyze(result.assets[0]);
    } catch (e) {
      Alert.alert('Nie udało się pobrać zdjęcia', String(e));
    }
  }

  async function analyze(asset: ImagePicker.ImagePickerAsset) {
    const id = newKey();
    const at = Date.now();
    let image = asset.uri;
    session.add({ id, at, image, status: 'analyzing' });
    try {
      const prepared = await prepareImage(asset.uri, asset.width, asset.height);
      // Zdjęcie trzymamy tylko w pamięci (data URI), a pliki tymczasowe od razu usuwamy.
      image = `data:image/jpeg;base64,${prepared.base64}`;
      deleteTempFile(prepared.uri);
      deleteTempFile(asset.uri);
      session.update({ id, at, image, status: 'analyzing' });

      const text = hint;
      setHint('');
      const result = await analyzePhoto(await getEffectiveBackendUrl(db), prepared.base64, text);
      session.update({ id, at, image, status: 'done', result });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', String(e));
      session.update({ id, at, image, status: 'error', code: err.code, message: err.message });
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: 'Ile to ma kalorii?',
          headerRight: () => (
            <Pressable onPress={() => router.push('/diary')} hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: '600' }}>Dziennik</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button title="📷 Zrób zdjęcie" onPress={() => pick(true)} style={{ paddingVertical: 18 }} disabled={Platform.OS === 'web'} />
        <Button title="🖼️ Wybierz z galerii" variant="secondary" onPress={() => pick(false)} />
        <TextInput
          style={styles.input}
          value={hint}
          onChangeText={setHint}
          placeholder="Opcjonalnie: opis, np. „owsianka na mleku 2%”"
          placeholderTextColor={colors.muted}
          maxLength={300}
        />

        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}

        {entries.length > 0 && <Button title="Wyczyść wyniki" variant="secondary" onPress={() => session.clear()} />}

        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Nic nie jest zapisywane: zdjęcia i wyniki są tylko w pamięci i znikają po zamknięciu aplikacji. Zdjęcie jest wysyłane przez
          serwer aplikacji do Anthropic wyłącznie w celu analizy. Wartości są szacunkowe.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EntryCard({ entry }: { entry: QuickEntry }) {
  return (
    <Card style={entry.status === 'error' ? { borderColor: colors.danger } : undefined}>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <Image source={{ uri: entry.image }} style={{ width: 84, height: 84, borderRadius: 10, backgroundColor: '#EEE' }} />
        <View style={{ flex: 1, gap: 4 }}>
          {entry.status === 'analyzing' && <Text style={styles.text}>Analizuję… (zwykle 10–40 s)</Text>}
          {entry.status === 'error' && (
            <>
              <Text style={[styles.h2, { color: colors.danger }]}>Nie udało się</Text>
              <Text style={styles.text}>{entry.message}</Text>
            </>
          )}
          {entry.status === 'done' && (
            <>
              <Text style={styles.h2} numberOfLines={2}>
                {entry.result.mealName}
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>≈ {fmtKcal(entry.result.totals.kcal)} kcal</Text>
              <Text style={styles.muted}>
                B {fmtG(entry.result.totals.protein)} g · W {fmtG(entry.result.totals.carbs)} g · T {fmtG(entry.result.totals.fat)} g
              </Text>
            </>
          )}
        </View>
        <Pressable onPress={() => session.remove(entry.id)} hitSlop={10} accessibilityLabel="Usuń wynik">
          <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
        </Pressable>
      </View>
      {entry.status === 'done' && (
        <View style={{ gap: 4, marginTop: 4 }}>
          {entry.result.items.map((it, i) => (
            <View key={i} style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                {it.name} · {it.grams} g
              </Text>
              <Text style={[styles.text, { fontWeight: '600' }]}>{fmtKcal(it.totals.kcal)} kcal</Text>
            </View>
          ))}
          <View style={[styles.row, { marginTop: 4 }]}>
            <Badge text="SZACUNEK AI" />
            <Text style={styles.muted}>pewność: {CONFIDENCE[entry.result.confidence] ?? entry.result.confidence}</Text>
          </View>
          {!!entry.result.notes && <Text style={styles.muted}>{entry.result.notes}</Text>}
        </View>
      )}
    </Card>
  );
}
