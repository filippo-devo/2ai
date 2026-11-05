import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fmtKcal } from '../lib/nutrition';
import { entryName, entryTotals, type QuickEntry } from '../lib/session';
import { Icon, colors, fonts } from './ui';

export type ShareTheme = 'light' | 'dark';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

/**
 * Grafika do udostępnienia (proporcje 9:16, jak Instagram Story): zdjęcie posiłku
 * i na dole nazwa, kalorie oraz makro. Renderowana w aplikacji i zapisywana do pliku przez react-native-view-shot.
 */
export type ShareCardRef = React.ComponentRef<typeof View>;

export function ShareCard({
  entry,
  theme,
  width,
  ref,
}: {
  entry: QuickEntry;
  theme: ShareTheme;
  width: number;
  ref?: React.Ref<ShareCardRef>;
}) {
  const height = Math.round((width * 16) / 9);
  const k = width / 360; // skala – grafika wygląda tak samo w podglądzie i w pliku 1080×1920
  const t = entryTotals(entry);
  const d = new Date(entry.at);
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
  const dark = theme === 'dark';
  const fg = dark ? '#fff' : colors.text;
  const sub = dark ? 'rgba(255,255,255,0.7)' : colors.muted;

  const photo = entry.image ? (
    <Image source={{ uri: entry.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#1C1C1E' : colors.chip, alignItems: 'center', justifyContent: 'center' }]}>
      <Icon name="restaurant-outline" size={64 * k} color={dark ? 'rgba(255,255,255,0.35)' : colors.muted} />
    </View>
  );

  return (
    <View ref={ref} collapsable={false} style={{ width, height, backgroundColor: dark ? '#000' : '#fff', overflow: 'hidden' }}>
      {/* Zdjęcie: w ciemnej wersji na całą grafikę, w jasnej w górnej części */}
      <View style={dark ? StyleSheet.absoluteFill : { height: height * 0.58 }}>{photo}</View>

      {/* Logo */}
      <View style={[s.logo, { top: 22 * k, left: 22 * k, paddingHorizontal: 12 * k, paddingVertical: 4 * k, borderRadius: 999 }]}>
        <Text style={{ fontFamily: fonts.displayItalic, fontSize: 24 * k, color: '#fff' }}>kęs.</Text>
      </View>

      {/* Dane posiłku */}
      <View
        style={[
          s.panel,
          dark
            ? { position: 'absolute', left: 14 * k, right: 14 * k, bottom: 14 * k, borderRadius: 26 * k, backgroundColor: 'rgba(0,0,0,0.62)' }
            : { flex: 1 },
          { padding: 22 * k, gap: 14 * k },
        ]}
      >
        <View style={{ gap: 4 * k }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12 * k, color: sub }}>{date}</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 24 * k, lineHeight: 30 * k, color: fg }} numberOfLines={2}>
            {entryName(entry)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * k }}>
          <MaterialCommunityIcons name="fire" size={34 * k} color={fg} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 46 * k, lineHeight: 52 * k, color: fg }}>{fmtKcal(t.kcal)}</Text>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 18 * k, color: sub, marginTop: 12 * k }}>kcal</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 * k }}>
          <Macro k={k} dark={dark} icon="food-drumstick" color={colors.protein} label="Białko" value={t.protein} />
          <Macro k={k} dark={dark} icon="barley" color={colors.carbs} label="Węgle" value={t.carbs} />
          <Macro k={k} dark={dark} icon="water" color={colors.fat} label="Tłuszcze" value={t.fat} />
        </View>
      </View>
    </View>
  );
}

function Macro({
  k,
  dark,
  icon,
  color,
  label,
  value,
}: {
  k: number;
  dark: boolean;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16 * k,
        padding: 10 * k,
        gap: 4 * k,
        backgroundColor: dark ? 'rgba(255,255,255,0.1)' : colors.chip,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * k }}>
        <MaterialCommunityIcons name={icon} size={13 * k} color={color} />
        <Text style={{ fontFamily: fonts.medium, fontSize: 11 * k, color: dark ? 'rgba(255,255,255,0.7)' : colors.muted }}>{label}</Text>
      </View>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18 * k, color: dark ? '#fff' : colors.text }}>{Math.round(value)} g</Text>
    </View>
  );
}

const s = StyleSheet.create({
  logo: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: {},
});
