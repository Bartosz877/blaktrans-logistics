import { Stack } from "expo-router";

export default function DriverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0D1B2A" },
      }}
    >
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="czat" />
      <Stack.Screen name="powiadomienia" />
      <Stack.Screen name="profil" />
      <Stack.Screen name="umowa" />
      <Stack.Screen name="sprawy" />
    </Stack>
  );
}
