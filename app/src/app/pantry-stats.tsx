import { useCallback, useLayoutEffect, useState } from "react";
import { Link, useFocusEffect, useNavigation } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError, type NutritionTotals, type PantryLocation, type PantryStats } from "../lib/api";

const LOCATION_LABELS: Record<PantryLocation, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  pantry: "Pantry",
};

const LOCATION_ORDER: PantryLocation[] = ["fridge", "freezer", "pantry"];

export default function PantryStatsScreen() {
  const [stats, setStats] = useState<PantryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotConfigured(false);
    try {
      const data = await api.getPantryStats();
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load pantry statistics.";
      if (err instanceof ApiError && err.status === 422 && message.includes("not configured")) {
        setNotConfigured(true);
      } else {
        setError(message);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      load().finally(() => setIsLoading(false));
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (notConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Cronometer isn&apos;t connected yet</Text>
        <Text style={styles.emptyText}>
          Pantry statistics are computed from each item&apos;s linked Cronometer food, so add your Cronometer
          credentials in Settings first.
        </Text>
        <Link href="/settings" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Go to Settings</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Couldn&apos;t load statistics</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Whole pantry</Text>
      <TotalsCard totals={stats.overall} />

      <Text style={styles.sectionTitle}>By location</Text>
      {LOCATION_ORDER.map((location) => (
        <View key={location} style={styles.locationBlock}>
          <Text style={styles.locationTitle}>{LOCATION_LABELS[location]}</Text>
          <TotalsCard totals={stats.by_location[location]} compact />
        </View>
      ))}

      {stats.approximated.length > 0 ? (
        <View style={styles.excludedBlock}>
          <Text style={styles.excludedTitle}>Estimated ({stats.approximated.length})</Text>
          <Text style={styles.excludedSubtitle}>
            These are tracked by volume, so their weight is estimated assuming 1ml ≈ 1g (roughly right for
            milk, juice, broth — less accurate for oil or syrup).
          </Text>
          {stats.approximated.map((item, index) => (
            <Text key={index} style={styles.excludedRow}>
              • {item.name} ({item.unit})
            </Text>
          ))}
        </View>
      ) : null}

      {stats.excluded.length > 0 ? (
        <View style={styles.excludedBlock}>
          <Text style={styles.excludedTitle}>
            Not counted ({stats.excluded.length})
          </Text>
          <Text style={styles.excludedSubtitle}>
            These pantry items aren&apos;t reflected above — link them to a Cronometer food (via Claude, when
            adding them) to include them.
          </Text>
          {stats.excluded.map((item, index) => (
            <Text key={index} style={styles.excludedRow}>
              • {item.name} — {item.reason}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TotalsCard({ totals, compact }: { totals: NutritionTotals; compact?: boolean }) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.caloriesValue, compact && styles.caloriesValueCompact]}>
        {Math.round(totals.calories)} kcal
      </Text>
      <View style={styles.macrosRow}>
        <MacroStat label="Protein" grams={totals.protein_g} />
        <MacroStat label="Carbs" grams={totals.carbs_g} />
        <MacroStat label="Fat" grams={totals.fat_g} />
        <MacroStat label="Fiber" grams={totals.fiber_g} />
      </View>
    </View>
  );
}

function MacroStat({ label, grams }: { label: string; grams: number }) {
  return (
    <View style={styles.macroStat}>
      <Text style={styles.macroValue}>{Math.round(grams)}g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", lineHeight: 20 },
  button: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 16,
  },
  buttonText: { color: "white", fontWeight: "600" },
  headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  headerButtonText: { color: "#2e7d32", fontWeight: "600" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#777", textTransform: "uppercase", marginBottom: 8, marginTop: 20 },
  card: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  cardCompact: { padding: 14 },
  caloriesValue: { fontSize: 28, fontWeight: "800" },
  caloriesValueCompact: { fontSize: 20 },
  macrosRow: { flexDirection: "row", marginTop: 14, width: "100%" },
  macroStat: { flex: 1, alignItems: "center" },
  macroValue: { fontSize: 15, fontWeight: "700" },
  macroLabel: { fontSize: 11, color: "#777", marginTop: 2 },
  locationBlock: { marginBottom: 12 },
  locationTitle: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  excludedBlock: { marginTop: 24, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e0e0e0" },
  excludedTitle: { fontSize: 13, fontWeight: "700", color: "#777", marginBottom: 4 },
  excludedSubtitle: { fontSize: 12, color: "#999", marginBottom: 10, lineHeight: 17 },
  excludedRow: { fontSize: 13, color: "#555", marginBottom: 4 },
});
