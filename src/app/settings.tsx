import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, NumField, colors, styles } from '../components/ui';
import { DEFAULT_GOALS, getBackendUrl, getGoals, saveBackendUrl, saveGoals } from '../db/repo';
import { ApiError, checkHealth, normalizeBackendUrl } from '../lib/api';
import { CLOUD_API_URL } from '../lib/backend';
import type { Goals } from '../lib/types';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([getGoals(db), getBackendUrl(db)]).then(([g, u]) => {
      setGoals(g);
      setUrl(u ?? '');
      setLoaded(true);
    });
  }, [db]);

  async function onSaveGoals() {
    if (!(goals.kcal > 0)) {
      Alert.alert('Niepoprawny cel', 'Cel kalorii musi być większy od 0.');
      return;
    }
    await saveGoals(db, goals);
    Alert.alert('Zapisano', 'Dzienne cele zostały zapisane na telefonie.');
  }

  async function onSaveUrl(): Promise<string> {
    const normalized = normalizeBackendUrl(url);
    setUrl(normalized);
    await saveBackendUrl(db, normalized);
    return normalized;
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const normalized = await onSaveUrl();
      const h = await checkHealth(normalized || CLOUD_API_URL);
      setTestResult(
        h.apiKeyConfigured
          ? { ok: true, text: `Połączono (model: ${h.model})` }
          : { ok: false, text: 'Połączono z backendem, ale brak klucza API w backend/.env – analiza nie zadziała.' },
      );
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const macroKcal = goals.protein * 4 + goals.carbs * 4 + goals.fat * 9;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.h2}>Dzienne cele</Text>
          <GoalRow label="Kalorie (kcal)" value={goals.kcal} onChange={(kcal) => setGoals({ ...goals, kcal })} />
          <GoalRow label="Białko (g)" value={goals.protein} onChange={(protein) => setGoals({ ...goals, protein })} />
          <GoalRow label="Węglowodany (g)" value={goals.carbs} onChange={(carbs) => setGoals({ ...goals, carbs })} />
          <GoalRow label="Tłuszcze (g)" value={goals.fat} onChange={(fat) => setGoals({ ...goals, fat })} />
          <Text style={styles.muted}>Makro z celów daje ok. {Math.round(macroKcal)} kcal (4/4/9 kcal na gram).</Text>
          <Button title="Zapisz cele" onPress={onSaveGoals} />
        </Card>

        <Card>
          <Text style={styles.h2}>Serwer do analizy zdjęć</Text>
          <Text style={styles.muted}>
            Zostaw puste, żeby używać serwera w chmurze (domyślnie). Wpisz adres tylko wtedy, gdy uruchamiasz własny backend na
            komputerze w tej samej sieci Wi-Fi, np. 192.168.1.20:3001.
          </Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="puste = serwer w chmurze"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={styles.row}>
            <Button
              title="Zapisz adres"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={async () => {
                await onSaveUrl();
                Alert.alert('Zapisano', 'Adres backendu zapisany.');
              }}
            />
            <Button title={testing ? 'Sprawdzam…' : 'Testuj połączenie'} style={{ flex: 1 }} onPress={onTest} disabled={testing} />
          </View>
          {testResult && <Text style={{ color: testResult.ok ? '#2E7D32' : colors.danger }}>{testResult.text}</Text>}
        </Card>

        <Card>
          <Text style={styles.h2}>Dane</Text>
          <Text style={styles.muted}>
            Wszystkie posiłki, cele i ustawienia są zapisane tylko na tym telefonie (SQLite), a zdjęcia w katalogu aplikacji. Nie ma
            kont ani synchronizacji. Historia, cele i ręczne wpisy działają bez internetu.
          </Text>
          <Text style={[styles.muted, { color: colors.warn }]}>
            Uwaga: w Expo Go dane należą do aplikacji Expo Go – usunięcie Expo Go lub wyczyszczenie jej danych usunie też posiłki i
            zdjęcia.
          </Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GoalRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
      <NumField value={value} onChange={onChange} style={{ width: 110, textAlign: 'right' }} />
    </View>
  );
}
