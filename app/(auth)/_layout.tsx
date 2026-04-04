import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0D1B2A" } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
