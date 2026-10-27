import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "../../lib/auth";

export default function TabsLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Pantry",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🥫</Text>,
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: "Diary",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔥</Text>,
        }}
      />
      <Tabs.Screen
        name="attention"
        options={{
          title: "Attention",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👀</Text>,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: "Recipes",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📖</Text>,
        }}
      />
      <Tabs.Screen
        name="sprouts"
        options={{
          title: "Sprouts",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🌱</Text>,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>💬</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
