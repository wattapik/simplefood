import { useCallback, useMemo, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError, type NutritionTotals, type PantryItem, type PantryStats } from "../lib/api";

/**
 * Lets the user pick a few pantry items and see their nutrition side by side, per
 * 100g so items of different sizes compare fairly. Reuses the same per-100g "density"
 * data the Pantry tab's sort/filter panel and pantry-stats screen already compute
 * server-side (PantryStatsService) — no separate backend endpoint needed.
 */

// A fixed, ordered palette (validated for adjacent-pair colorblind safety) — colors
// are assigned to items by selection slot, not by list position, so an item keeps its
// color as others are added or removed rather than everyone reshuffling.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const MAX_COMPARED = PALETTE.length;

const METRICS: { key: keyof NutritionTotals; label: string; unit: string; round: (v: number) => string }[] = [
  { key: "calories", label: "Calories", unit: "kcal", round: (v) => String(Math.round(v)) },
  { key: "protein_g", label: "Protein", unit: "g", round: (v) => Math.round(v).toString() },
  { key: "carbs_g", label: "Carbs", unit: "g", round: (v) => Math.round(v).toString() },
  { key: "fat_g", label: "Fat", unit: "g", round: (v) => Math.round(v).toString() },
  { key: "fiber_g", label: "Fiber", unit: "g", round: (v) => Math.round(v).toString() },
];

type Selection = { id: number; colorIndex: number };

export default function PantryCompareScreen() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [stats, setStats] = useState<PantryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Selection[]>([]);

  const load = useCallback(async () => {
    setError(null);
    setNotConfigured(false);
    try {
      const [itemsData, statsData] = await Promise.all([api.listPantryItems(), api.getPantryStats()]);
      setItems(itemsData);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load pantry data.";
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

  const eligible = useMemo(
    () => (items && stats ? items.filter((item) => stats.items[String(item.id)] != null) : []),
    [items, stats]
  );

  function toggleItem(id: number) {
    setSelected((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (existing) {
        return prev.filter((s) => s.id !== id);
      }
      if (prev.length >= MAX_COMPARED) {
        return prev;
      }
      const usedColors = new Set(prev.map((s) => s.colorIndex));
      let colorIndex = 0;
      while (usedColors.has(colorIndex)) colorIndex++;
      return [...prev, { id, colorIndex }];
    });
  }

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
          Comparisons are based on each item&apos;s linked Cronometer food, so add your Cronometer credentials in
          Settings first.
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
        <Text style={styles.emptyTitle}>Couldn&apos;t load pantry data</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (eligible.length < 2) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Not enough linked items yet</Text>
        <Text style={styles.emptyText}>
          Comparing nutrition needs at least 2 pantry items linked to a Cronometer food. Link them via Claude when
          adding items, then come back here.
        </Text>
      </View>
    );
  }

  if (!stats) {
    return null;
  }

  const itemsById = new Map(eligible.map((item) => [item.id, item]));
  const compared = selected
    .map((s) => ({ ...s, item: itemsById.get(s.id), density: stats.items[String(s.id)] }))
    .filter((c): c is Selection & { item: PantryItem; density: NutritionTotals } => !!c.item && !!c.density);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.hint}>
        Pick 2-{MAX_COMPARED} pantry items to compare, per 100g so different sizes compare fairly.
      </Text>

      <View style={styles.pickerList}>
        {eligible.map((item) => {
          const selection = selected.find((s) => s.id === item.id);
          const disabled = !selection && selected.length >= MAX_COMPARED;
          return (
            <Pressable
              key={item.id}
              onPress={() => toggleItem(item.id)}
              disabled={disabled}
              style={[styles.pickerRow, disabled && styles.pickerRowDisabled]}
            >
              <View
                style={[
                  styles.checkbox,
                  selection && { backgroundColor: PALETTE[selection.colorIndex], borderColor: PALETTE[selection.colorIndex] },
                ]}
              >
                {selection ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={[styles.pickerLabel, disabled && styles.pickerLabelDisabled]}>
                {item.name}
                {item.brand ? ` (${item.brand})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {compared.length >= 2 ? (
        <>
          <View style={styles.legend}>
            {compared.map((c) => (
              <View key={c.id} style={styles.legendEntry}>
                <View style={[styles.legendDot, { backgroundColor: PALETTE[c.colorIndex] }]} />
                <Text style={styles.legendLabel}>{c.item.name}</Text>
              </View>
            ))}
          </View>

          {METRICS.map((metric) => (
            <MetricGroup key={metric.key} metric={metric} compared={compared} />
          ))}
        </>
      ) : (
        <Text style={styles.emptyText}>Select at least 2 items above to see the comparison.</Text>
      )}
    </ScrollView>
  );
}

function MetricGroup({
  metric,
  compared,
}: {
  metric: (typeof METRICS)[number];
  compared: (Selection & { item: PantryItem; density: NutritionTotals })[];
}) {
  const max = Math.max(...compared.map((c) => c.density[metric.key]), 0.0001);

  return (
    <View style={styles.metricGroup}>
      <Text style={styles.metricTitle}>
        {metric.label} <Text style={styles.metricSubtitle}>per 100g</Text>
      </Text>
      {compared.map((c) => {
        const value = c.density[metric.key];
        const pct = Math.max((value / max) * 100, 2);
        return (
          <View key={c.id} style={styles.barRow}>
            <View style={styles.barLabelRow}>
              <View style={[styles.legendDot, { backgroundColor: PALETTE[c.colorIndex] }]} />
              <Text style={styles.barLabel} numberOfLines={1}>
                {c.item.name}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: PALETTE[c.colorIndex] }]} />
            </View>
            <Text style={styles.barValue}>
              {metric.round(value)}
              {metric.unit}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center", flexGrow: 1 },
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
  hint: { fontSize: 13, color: "#666", marginBottom: 14, lineHeight: 18 },
  pickerList: { marginBottom: 8 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  pickerRowDisabled: { opacity: 0.4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#c3c2b7",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { color: "white", fontSize: 13, fontWeight: "700" },
  pickerLabel: { fontSize: 14, color: "#0b0b0b", flex: 1 },
  pickerLabelDisabled: { color: "#999" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18, marginBottom: 6 },
  legendEntry: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 13, color: "#52514e", fontWeight: "600" },
  metricGroup: { marginTop: 20 },
  metricTitle: { fontSize: 14, fontWeight: "700", color: "#0b0b0b", marginBottom: 10 },
  metricSubtitle: { fontSize: 12, fontWeight: "400", color: "#898781" },
  barRow: { marginBottom: 10 },
  barLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  barLabel: { fontSize: 12, color: "#52514e", flexShrink: 1 },
  barTrack: {
    height: 18,
    backgroundColor: "#f0efec",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    minWidth: 4,
  },
  barValue: { fontSize: 12, color: "#52514e", marginTop: 2, textAlign: "right" },
});
