import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0D1B2A" },
      }}
    >
      <Stack.Screen name="statystyki" />
      <Stack.Screen name="kadry" />
      <Stack.Screen name="pojazdy" />
      <Stack.Screen name="profil" />
      <Stack.Screen name="skrzynka" />
      <Stack.Screen name="powiadomienia" />
      <Stack.Screen name="czat" />
      <Stack.Screen name="tachograf" />
    </Stack>
  );
}
