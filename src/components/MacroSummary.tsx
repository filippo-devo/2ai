import { Text, View } from 'react-native';
import { fmtG, fmtKcal } from '../lib/nutrition';
import type { Goals, Macros } from '../lib/types';
import { Card, ProgressBar, colors, styles } from './ui';

export function MacroSummary({ totals, goals }: { totals: Macros; goals: Goals }) {
  const left = goals.kcal - totals.kcal;
  return (
    <Card>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <View>
          <Text style={styles.muted}>Kalorie</Text>
          <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text }}>
            {fmtKcal(totals.kcal)}
            <Text style={{ fontSize: 16, fontWeight: '500', color: colors.muted }}> / {fmtKcal(goals.kcal)} kcal</Text>
          </Text>
        </View>
        <Text style={[styles.muted, left < 0 && { color: colors.danger }]}>
          {left >= 0 ? `zostało ${fmtKcal(left)}` : `przekroczono o ${fmtKcal(-left)}`}
        </Text>
      </View>
      <ProgressBar value={totals.kcal} max={goals.kcal} color={colors.kcal} />
      <View style={[styles.row, { marginTop: 6, gap: 12 }]}>
        <MacroCol label="Białko" value={totals.protein} goal={goals.protein} color={colors.protein} />
        <MacroCol label="Węglowodany" value={totals.carbs} goal={goals.carbs} color={colors.carbs} />
        <MacroCol label="Tłuszcze" value={totals.fat} goal={goals.fat} color={colors.fat} />
      </View>
    </Card>
  );
}

function MacroCol({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.muted} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      <Text style={[styles.text, { fontWeight: '700' }]}>
        {fmtG(value)}
        <Text style={styles.muted}> / {fmtG(goal)} g</Text>
      </Text>
      <ProgressBar value={value} max={goal} color={color} />
    </View>
  );
}

export function MacroLine({ m }: { m: Macros }) {
  return (
    <Text style={styles.muted}>
      {fmtKcal(m.kcal)} kcal · B {fmtG(m.protein)} g · W {fmtG(m.carbs)} g · T {fmtG(m.fat)} g
    </Text>
  );
}
