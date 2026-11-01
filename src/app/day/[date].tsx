import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { DayView } from '../../components/DayView';
import { styles } from '../../components/ui';
import { isValidDay } from '../../lib/dates';

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  if (!isValidDay(date)) return <Text style={[styles.error, { padding: 16 }]}>Niepoprawna data.</Text>;
  return <DayView initialDay={date} showNav />;
}
