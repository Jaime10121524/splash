import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/AuthContext';
import { colors } from '../src/theme';

export default function InitialRoute() {
  const { ready, user } = useAuth();
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.brand} size="large" /></View>;
  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}
