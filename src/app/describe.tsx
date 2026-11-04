import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, colors, fonts } from '../components/ui';
import { startManualEntry, startTextScan } from '../lib/scan';

/**
 * Opis posiłku głosem lub tekstem. Dyktowanie działa przez mikrofon systemowej klawiatury –
 * Expo Go nie zawiera modułu rozpoznawania mowy, a klawiatura iOS/Android robi to dobrze i bez dodatkowych kosztów.
 */
export default function DescribeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [voiceHint, setVoiceHint] = useState(false);

  function analyze() {
    const id = startTextScan(db, text);
    router.replace({ pathname: '/scan/[id]', params: { id } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij" style={s.close}>
            <Icon name="close" size={22} />
          </Pressable>
        </View>

        <Text style={s.title}>Co zjadłeś?</Text>
        <Text style={s.subtitle}>Powiedz albo wpisz – policzę kalorie i rozpiszę składniki.</Text>

        <TextInput
          ref={input}
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Np. dwa jajka sadzone, kromka chleba z masłem i kawa z mlekiem"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          maxLength={1000}
          textAlignVertical="top"
        />

        <View style={s.voiceRow}>
          <Pressable
            onPress={() => {
              setVoiceHint(true);
              input.current?.focus();
            }}
            accessibilityRole="button"
            accessibilityLabel="Powiedz, co zjadłeś"
            style={({ pressed }) => [s.mic, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Icon name="mic" size={28} color="#fff" />
          </Pressable>
          <Text style={s.voiceText}>
            {voiceHint
              ? 'Stuknij ikonę mikrofonu na klawiaturze i mów. Tekst pojawi się powyżej.'
              : 'Wolisz mówić? Stuknij mikrofon.'}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <Button title="Policz kalorie" icon="sparkles" onPress={analyze} disabled={text.trim().length < 2} />
        <Pressable
          onPress={() => {
            const id = startManualEntry(text.trim());
            router.replace({ pathname: '/scan/[id]', params: { id } });
          }}
          style={s.manual}
          accessibilityRole="button"
        >
          <Icon name="create-outline" size={18} />
          <Text style={s.manualText}>Wpisz wartości ręcznie</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, color: colors.text },
  subtitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted, lineHeight: 21 },
  input: {
    minHeight: 140,
    backgroundColor: colors.chip,
    borderRadius: 18,
    padding: 16,
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
  },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mic: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  voiceText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.muted },
  manual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  manualText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
