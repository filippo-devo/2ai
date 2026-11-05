import * as Haptics from 'expo-haptics';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { ShareCard, type ShareCardRef, type ShareTheme } from '../../components/ShareCard';
import { Icon, colors, fonts, type IconName } from '../../components/ui';
import { deleteTempFile } from '../../lib/photos';
import { useEntry } from '../../lib/session';

type Action = 'save' | 'story' | 'more';

/** Udostępnianie posiłku jako grafiki 1080×1920 (Instagram Story) albo zapis do galerii. */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useEntry(id);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const card = useRef<ShareCardRef>(null);
  const [theme, setTheme] = useState<ShareTheme>('dark');
  const [busy, setBusy] = useState<Action | null>(null);
  const [saved, setSaved] = useState(false);

  if (!entry) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={s.title}>Ten wynik już zniknął</Text>
      </View>
    );
  }

  // Podgląd mieści się na ekranie razem z przyciskami.
  const previewW = Math.min(width * 0.72, (height - insets.top - insets.bottom - 300) * (9 / 16));

  async function render(): Promise<string> {
    // Widok RN (host element) – zrzucany do pliku PNG 1080×1920.
    return captureRef(card as React.RefObject<never>, { format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 });
  }

  async function share(action: Action) {
    setBusy(action);
    let uri: string | null = null;
    try {
      uri = await render();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Udostępnianie niedostępne', 'To urządzenie nie obsługuje udostępniania plików.');
        return;
      }
      // Systemowe menu udostępniania – wybierz Instagram (Story), WhatsApp, Wiadomości itd.
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Udostępnij posiłek' });
    } catch (e) {
      Alert.alert('Nie udało się udostępnić', String(e));
    } finally {
      deleteTempFile(uri); // grafika była tylko plikiem tymczasowym
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    let uri: string | null = null;
    try {
      uri = await render();
      const perm = await requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert('Brak dostępu do zdjęć', 'Zezwól na zapisywanie zdjęć w ustawieniach telefonu albo użyj „Więcej” → „Zapisz obraz”.');
        return;
      }
      await Asset.create(uri);
      setSaved(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Np. ograniczenia Expo Go na Androidzie – zapis przez systemowe menu nadal działa.
      Alert.alert('Nie udało się zapisać', 'Użyj „Więcej” i wybierz „Zapisz obraz”.');
    } finally {
      deleteTempFile(uri);
      setBusy(null);
    }
  }

  return (
    <View style={[s.root, { paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 10, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.title}>Udostępnij posiłek</Text>
        <Pressable onPress={() => router.back()} style={s.close} accessibilityRole="button" accessibilityLabel="Zamknij" hitSlop={8}>
          <Icon name="close" size={22} />
        </Pressable>
      </View>

      <View style={s.segment}>
        {(['dark', 'light'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTheme(t)}
            style={[s.segBtn, theme === t && s.segActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: theme === t }}
          >
            <Text style={[s.segText, theme === t && { color: '#fff' }]}>{t === 'dark' ? 'Ciemna' : 'Jasna'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.previewWrap}>
        <View style={[s.preview, { width: previewW, height: (previewW * 16) / 9 }]}>
          <ShareCard ref={card} entry={entry} theme={theme} width={previewW} />
        </View>
      </View>

      <View style={s.actions}>
        <ActionButton icon={saved ? 'checkmark' : 'download-outline'} label={saved ? 'Zapisano' : 'Zapisz'} busy={busy === 'save'} onPress={save} />
        <ActionButton icon="logo-instagram" label="Story" busy={busy === 'story'} onPress={() => share('story')} primary />
        <ActionButton icon="share-outline" label="Więcej" busy={busy === 'more'} onPress={() => share('more')} />
      </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress, busy, primary }: { icon: IconName; label: string; onPress: () => void; busy: boolean; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={s.action} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.actionCircle, primary && { backgroundColor: colors.text }]}>
        {busy ? <ActivityIndicator color={primary ? '#fff' : colors.text} /> : <Icon name={icon} size={24} color={primary ? '#fff' : colors.text} />}
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.chip, borderRadius: 999, padding: 4 },
  segBtn: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.text },
  segText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  previewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly' },
  action: { alignItems: 'center', gap: 8, width: 84 },
  actionCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});
