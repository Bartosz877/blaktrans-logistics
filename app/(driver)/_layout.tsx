import { Stack } from "expo-router";

export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0D1B2A" } }}>
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
