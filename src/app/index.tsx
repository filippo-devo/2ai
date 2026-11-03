import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, colors, fonts, type IconName } from '../components/ui';
import { startPhotoScan } from '../lib/scan';
import { useSession } from '../lib/session';

/** Ekran startowy: od razu aparat. Jedno stuknięcie = zdjęcie i analiza. */
export default function CameraScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const { entries } = useSession();

  // Prosimy o dostęp do aparatu od razu przy pierwszym uruchomieniu.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  async function capture() {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      const id = startPhotoScan(db, photo.uri, photo.width, photo.height);
      router.push({ pathname: '/scan/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Nie udało się zrobić zdjęcia', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFromGallery() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const id = startPhotoScan(db, a.uri, a.width, a.height);
      router.push({ pathname: '/scan/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Nie udało się wczytać zdjęcia', String(e));
    }
  }

  const granted = !!permission?.granted;

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
        />
      ) : (
        <PermissionView
          loading={!permission}
          canAsk={permission?.canAskAgain ?? true}
          onAsk={() => void requestPermission()}
        />
      )}

      {/* Górny pasek */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <Text style={s.wordmark}>kęs.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {granted && (
            <RoundButton icon={torch ? 'flash' : 'flash-off'} label="Latarka" onPress={() => setTorch((t) => !t)} />
          )}
          <RoundButton icon="time-outline" label="Ostatnie" badge={entries.length} onPress={() => router.push('/recent')} />
        </View>
      </View>

      {/* Ramka celownika */}
      {granted && (
        <View pointerEvents="none" style={s.frame}>
          <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 28 }]} />
          <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 28 }]} />
          <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 28 }]} />
          <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 28 }]} />
        </View>
      )}

      {/* Dolne sterowanie */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={s.hint}>{granted ? 'Ustaw talerz w ramce i zrób zdjęcie' : 'Możesz też wybrać zdjęcie albo opisać posiłek'}</Text>
        <View style={s.controls}>
          <SideButton icon="images-outline" label="Galeria" onPress={pickFromGallery} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zrób zdjęcie"
            onPress={capture}
            disabled={!granted || !ready || busy || Platform.OS === 'web'}
            style={({ pressed }) => [s.shutter, (!granted || !ready) && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <View style={s.shutterInner}>{busy && <ActivityIndicator color={colors.text} />}</View>
          </Pressable>
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
      <Text style={s.permText}>Zrób zdjęcie posiłku, a od razu zobaczysz, ile ma kalorii.</Text>
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
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontFamily: fonts.bold, fontSize: 11 },
  frame: { position: 'absolute', top: '22%', left: '12%', right: '12%', aspectRatio: 1 },
  corner: { position: 'absolute', width: 44, height: 44, borderColor: 'rgba(255,255,255,0.9)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 18 },
  hint: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.medium, fontSize: 14 },
  controls: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  side: { alignItems: 'center', gap: 6, width: 76 },
  sideCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  sideLabel: { color: '#fff', fontFamily: fonts.semibold, fontSize: 12 },
  permission: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  permIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  permTitle: { color: '#fff', fontFamily: fonts.display, fontSize: 34, textAlign: 'center' },
  permText: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.medium, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permButton: { marginTop: 12, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 14, paddingHorizontal: 26 },
  permButtonText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
});
