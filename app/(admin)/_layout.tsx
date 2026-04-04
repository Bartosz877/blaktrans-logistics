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
      <Stack.Screen name="urlopy" />
      <Stack.Screen name="pojazdy" />
      <Stack.Screen name="usterki" />
      <Stack.Screen name="umowy" />
      <Stack.Screen name="liczniki" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
