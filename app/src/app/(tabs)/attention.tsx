import { useCallback, useLayoutEffect, useState } from "react";
import { Link, useFocusEffect, useNavigation } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type PantryAttention, type PantryItem } from "../../lib/api";
import { daysSince, daysUntil, formatDaysLeft } from "../../lib/dates";

/**
 * The "fridge invisibility" pane: food that's physically there but easy to forget
 * about, surfaced without needing to sort/filter/scroll the full pantry list to
 * notice it. Deliberately just two plain lists — no recipe suggestions or nutrient
 * cross-referencing, which are separate, more speculative ideas for later.
 */
export default function AttentionScreen() {
  const [data, setData] = useState<PantryAttention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.getPantryAttention());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={handleRefresh} disabled={isRefreshing} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>{isRefreshing ? "Refreshing…" : "Refresh"}</Text>
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, isRefreshing]);

  if (data === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const nothingToShow = data.expiring.length === 0 && data.stagnant.length === 0;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      {nothingToShow ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nothing needs attention 🎉</Text>
          <Text style={styles.emptyText}>Nothing&apos;s expiring soon, and nothing&apos;s been sitting untouched.</Text>
        </View>
      ) : (
        <>
          <Section
            title="Use these soon"
            subtitle={`Expiring within ${data.expiring_within_days} days`}
            emptyText="Nothing expiring soon."
            items={data.expiring}
            renderMeta={(item) =>
              item.effective_expiration_date
                ? formatDaysLeft(daysUntil(item.effective_expiration_date))
                : null
            }
          />

          <Section
            title="Sitting unused"
            subtitle={`Unopened for ${data.stagnant_after_days}+ days — easy to forget about`}
            emptyText="Nothing's been sitting untouched."
            items={data.stagnant}
            renderMeta={(item) => `added ${daysSince(item.added_at)} days ago`}
          />
        </>
      )}
    </ScrollView>
  );
}

function Section({
  title,
  subtitle,
  emptyText,
  items,
  renderMeta,
}: {
  title: string;
  subtitle: string;
  emptyText: string;
  items: PantryItem[];
  renderMeta: (item: PantryItem) => string | null;
}) {
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} ({items.length})
      </Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {items.map((item) => (
        <Link key={item.id} href={{ pathname: "/item/[id]", params: { id: String(item.id) } }} asChild>
          <Pressable style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity}
                {item.unit} · {item.location}
              </Text>
            </View>
            <Text style={styles.badge}>{renderMeta(item)}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  headerButtonText: { color: "#2e7d32", fontWeight: "600" },
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center", flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", lineHeight: 20 },
  error: { color: "#c0392b" },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionSubtitle: { fontSize: 12, color: "#888", marginTop: 2, marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    gap: 8,
  },
  rowMain: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600" },
  itemMeta: { fontSize: 12, color: "#777", marginTop: 2, textTransform: "capitalize" },
  badge: {
    fontSize: 12,
    color: "#8a6d1a",
    backgroundColor: "#fff3cd",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
});
