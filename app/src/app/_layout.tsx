import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth";

function RootNavigator() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="item/new"
        options={{ headerShown: true, title: "Add Item", presentation: "modal" }}
      />
      <Stack.Screen
        name="item/[id]"
        options={{ headerShown: true, title: "Edit Item", presentation: "modal" }}
      />
      <Stack.Screen
        name="pantry-stats"
        options={{ headerShown: true, title: "Pantry Stats", presentation: "modal" }}
      />
      <Stack.Screen
        name="pantry-compare"
        options={{ headerShown: true, title: "Compare Foods", presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
