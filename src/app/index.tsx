import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, colors, fonts, type IconName } from '../components/ui';
import { startBarcodeScan, startPhotoScan } from '../lib/scan';
import { useSession } from '../lib/session';

type Mode = 'meal' | 'barcode' | 'label';

const MODES: { key: Mode; label: string; icon: IconName; hint: string }[] = [
  { key: 'meal', label: 'Posiłek', icon: 'scan-outline', hint: 'Ustaw talerz w ramce i zrób zdjęcie' },
  { key: 'barcode', label: 'Kod kreskowy', icon: 'barcode-outline', hint: 'Ustaw kod kreskowy w ramce' },
  { key: 'label', label: 'Etykieta', icon: 'document-text-outline', hint: 'Sfotografuj tabelę wartości odżywczych' },
];

/** Ekran startowy: od razu aparat z trzema trybami (jak w Cal AI). */
export default function CameraScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [mode, setMode] = useState<Mode>('meal');
  const scanned = useRef(false);
  const params = useLocalSearchParams<{ mode?: string }>();
  const { entries } = useSession();

  // Prosimy o dostęp do aparatu od razu przy pierwszym uruchomieniu.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  // Po powrocie na ekran znowu można skanować kod; inny ekran może też wybrać tryb (np. „Zrób zdjęcie etykiety”).
  useFocusEffect(
    useCallback(() => {
      scanned.current = false;
      const m = params.mode;
      if (m === 'meal' || m === 'barcode' || m === 'label') {
        setMode(m);
        router.setParams({ mode: undefined });
      }
    }, [params.mode]),
  );

  async function capture() {
    if (!camera.current || busy || mode === 'barcode') return;
    setBusy(true);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      const id = startPhotoScan(db, photo.uri, photo.width, photo.height, mode === 'label' ? 'label' : 'photo');
      router.push({ pathname: '/scan/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Nie udało się zrobić zdjęcia', String(e));
    } finally {
      setBusy(false);
    }
  }

  function onBarcode(r: BarcodeScanningResult) {
    const code = r.data?.replace(/\D/g, '');
    if (scanned.current || !code || code.length < 8) return;
    scanned.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = startBarcodeScan(db, code);
    router.push({ pathname: '/scan/[id]', params: { id } });
  }

  async function pickFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const id = startPhotoScan(db, a.uri, a.width, a.height, mode === 'label' ? 'label' : 'photo');
      router.push({ pathname: '/scan/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Nie udało się wczytać zdjęcia', String(e));
    }
  }

  const granted = !!permission?.granted;
  const current = MODES.find((m) => m.key === mode)!;

  return (
    <View style={s.root}>
      {granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          animateShutter
          onCameraReady={() => setReady(true)}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={mode === 'barcode' ? onBarcode : undefined}
        />
      ) : (
        <PermissionView loading={!permission} canAsk={permission?.canAskAgain ?? true} onAsk={() => void requestPermission()} />
      )}

      {/* Górny pasek */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={s.wordmark}>kęs.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {granted && <RoundButton icon={torch ? 'flash' : 'flash-off'} label="Latarka" onPress={() => setTorch((t) => !t)} />}
          <RoundButton icon="time-outline" label="Ostatnie" badge={entries.length} onPress={() => router.push('/recent')} />
        </View>
      </View>

      {/* Ramka celownika – inny kształt dla każdego trybu */}
      {granted && (
        <View pointerEvents="none" style={[s.frame, mode === 'barcode' ? s.frameBarcode : mode === 'label' ? s.frameLabel : s.frameMeal]}>
          <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 24 }]} />
          <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 24 }]} />
          <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 24 }]} />
          <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 24 }]} />
        </View>
      )}

      {/* Dół: podpowiedź, tryby i sterowanie */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={s.hint}>{granted ? current.hint : 'Możesz też wybrać zdjęcie albo opisać posiłek'}</Text>

        <View style={s.modes}>
          {MODES.map((m) => {
            const active = m.key === mode;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  setMode(m.key);
                  scanned.current = false;
                  void Haptics.selectionAsync();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={m.label}
                style={[s.mode, active && s.modeActive]}
              >
                <Icon name={m.icon} size={20} color={active ? colors.text : '#fff'} />
                <Text style={[s.modeText, active && { color: colors.text }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.controls}>
          <SideButton icon="images-outline" label="Galeria" onPress={pickFromGallery} />
          {mode === 'barcode' ? (
            <View style={s.scanning}>
              <ActivityIndicator color="#fff" />
              <Text style={s.scanningText}>Szukam kodu…</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zrób zdjęcie"
              onPress={capture}
              disabled={!granted || !ready || busy || Platform.OS === 'web'}
              style={({ pressed }) => [s.shutter, (!granted || !ready) && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <View style={s.shutterInner}>{busy && <ActivityIndicator color={colors.text} />}</View>
            </Pressable>
          )}
          <SideButton icon="mic-outline" label="Powiedz" onPress={() => router.push('/describe')} />
        </View>
      </View>
    </View>
  );
}

function RoundButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={s.round}>
      <Icon name={icon} size={20} color="#fff" />
      {!!badge && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function SideButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.side} hitSlop={8}>
      <View style={s.sideCircle}>
        <Icon name={icon} size={24} color="#fff" />
      </View>
      <Text style={s.sideLabel}>{label}</Text>
    </Pressable>
  );
}

function PermissionView({ loading, canAsk, onAsk }: { loading: boolean; canAsk: boolean; onAsk: () => void }) {
  if (loading) return <View style={StyleSheet.absoluteFill} />;
  return (
    <View style={s.permission}>
      <View style={s.permIcon}>
        <Icon name="camera-outline" size={34} color="#fff" />
      </View>
      <Text style={s.permTitle}>Potrzebny jest aparat</Text>
      <Text style={s.permText}>Zrób zdjęcie posiłku, kodu kreskowego albo etykiety, a od razu zobaczysz kalorie.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={canAsk ? onAsk : () => void Linking.openSettings()}
        style={({ pressed }) => [s.permButton, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.permButtonText}>{canAsk ? 'Zezwól na aparat' : 'Otwórz ustawienia'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { fontFamily: fonts.displayItalic, fontSize: 34, color: '#fff', letterSpacing: -0.5 },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.text, fontFamily: fonts.bold, fontSize: 11 },
  frame: { position: 'absolute', left: '8%', right: '8%' },
  frameMeal: { top: '18%', aspectRatio: 1 },
  frameBarcode: { top: '30%', height: 150 },
  frameLabel: { top: '15%', aspectRatio: 0.8 },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#fff' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 14, paddingHorizontal: 14 },
  hint: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.medium, fontSize: 14 },
  modes: { flexDirection: 'row', gap: 8, width: '100%' },
  mode: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(40,40,40,0.72)' },
  modeActive: { backgroundColor: '#fff' },
  modeText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 12 },
  controls: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginTop: 4 },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  scanning: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', gap: 6 },
  scanningText: { color: '#fff', fontFamily: fonts.medium, fontSize: 11 },
  side: { alignItems: 'center', gap: 6, width: 76 },
  sideCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  sideLabel: { color: '#fff', fontFamily: fonts.semibold, fontSize: 12 },
  permission: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  permIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  permTitle: { color: '#fff', fontFamily: fonts.bold, fontSize: 26, textAlign: 'center' },
  permText: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.medium, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permButton: { marginTop: 12, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 14, paddingHorizontal: 26 },
  permButtonText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
});
