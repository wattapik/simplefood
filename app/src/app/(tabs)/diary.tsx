import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { Link, useFocusEffect, useNavigation } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, ApiError, type CronometerDiaryFood, type CronometerOverview } from "../../lib/api";
import { confirmAsync } from "../../lib/confirm";

const CRONOMETER_URL = "https://cronometer.com/";

export default function DiaryScreen() {
  const [overview, setOverview] = useState<CronometerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [showNutrients, setShowNutrients] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    setNotConfigured(false);
    try {
      const data = await api.getCronometerToday(refresh);
      setOverview(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load your Cronometer diary.";
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
    await load(true);
    setIsRefreshing(false);
  }

  async function handleRemove(food: CronometerDiaryFood) {
    if (!food.id) return;
    const confirmed = await confirmAsync("Remove entry", `Remove "${food.name}" from today's diary?`, "Remove");
    if (!confirmed) return;

    setRowError(null);
    setBusyId(food.id);
    try {
      setOverview(await api.removeCronometerDiaryEntry(food.id));
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not remove that entry.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(food: CronometerDiaryFood) {
    if (!food.id || food.food_id === null || food.measure_id === null || food.grams === null) return;
    setRowError(null);
    setEditingId(food.id);
    setEditValue(String(food.grams));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditValue("");
  }

  async function saveEditing(food: CronometerDiaryFood) {
    if (!food.id || food.food_id === null || food.measure_id === null) return;
    const grams = Number(editValue);
    if (!Number.isFinite(grams) || grams <= 0) {
      setRowError("Enter a weight in grams greater than 0.");
      return;
    }

    setRowError(null);
    setBusyId(food.id);
    try {
      setOverview(
        await api.updateCronometerDiaryEntry(food.id, { food_id: food.food_id, measure_id: food.measure_id, grams })
      );
      setEditingId(null);
      setEditValue("");
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not update that entry.");
    } finally {
      setBusyId(null);
    }
  }

  // RefreshControl's pull-to-refresh gesture is a no-op on react-native-web, so this
  // header button is the only way web users can force a refresh past the 2-minute
  // server-side cache (e.g. after editing something directly in Cronometer).
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

  const nutrientsByCategory = useMemo(() => {
    const groups = new Map<string, typeof overview extends null ? never : NonNullable<typeof overview>["nutrients"]>();
    for (const nutrient of overview?.nutrients ?? []) {
      const key = nutrient.category ?? "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(nutrient);
    }
    return Array.from(groups.entries());
  }, [overview]);

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
        <Text style={styles.emptyText}>Add your Cronometer credentials in Settings to see today&apos;s diary here.</Text>
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
        <Text style={styles.emptyTitle}>Couldn&apos;t load your diary</Text>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable style={styles.button} onPress={() => load(true)}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!overview) {
    return null;
  }

  const { calories, macros, foods } = overview;
  const progress = calories.target ? Math.min(1, calories.consumed / calories.target) : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.card}>
        <Text style={styles.caloriesValue}>{calories.consumed} kcal</Text>
        <Text style={styles.caloriesLabel}>
          {calories.target !== null
            ? `of ${calories.target} kcal target · ${calories.remaining} remaining`
            : "consumed today"}
        </Text>
        {progress !== null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        ) : null}
        {overview.nutrition_score !== null ? (
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText}>{overview.nutrition_score}% of daily nutrition targets reached</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.macrosRow}>
        <MacroStat label="Protein" grams={macros.protein_g} />
        <MacroStat label="Carbs" grams={macros.carbs_g} />
        <MacroStat label="Fat" grams={macros.fat_g} />
        <MacroStat label="Fiber" grams={macros.fiber_g} />
      </View>

      <Text style={styles.sectionTitle}>Today&apos;s food ({foods.length})</Text>
      {rowError ? <Text style={styles.rowError}>{rowError}</Text> : null}
      {foods.length === 0 ? (
        <Text style={styles.emptyText}>Nothing logged in Cronometer yet today.</Text>
      ) : (
        foods.map((food, index) => {
          const key = food.id ?? String(index);
          const isEditing = editingId === food.id && food.id !== null;
          const isBusy = busyId === food.id && food.id !== null;
          const canEdit = food.id !== null && food.food_id !== null && food.measure_id !== null && food.grams !== null;

          return (
            <View key={key} style={styles.foodRow}>
              {isEditing ? (
                <View style={styles.editRow}>
                  <Text style={styles.foodName}>{food.name}</Text>
                  <View style={styles.editControls}>
                    <TextInput
                      style={styles.editInput}
                      value={editValue}
                      onChangeText={setEditValue}
                      keyboardType="numeric"
                      autoFocus
                    />
                    <Text style={styles.editUnit}>g</Text>
                    <Pressable
                      style={[styles.smallButton, styles.saveButton]}
                      onPress={() => saveEditing(food)}
                      disabled={isBusy}
                    >
                      <Text style={styles.smallButtonText}>{isBusy ? "…" : "Save"}</Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={cancelEditing} disabled={isBusy}>
                      <Text style={styles.smallButtonTextMuted}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Pressable
                    style={styles.foodMain}
                    onPress={() => (canEdit ? startEditing(food) : undefined)}
                    disabled={!canEdit || isBusy}
                  >
                    <Text style={styles.foodName}>{food.name}</Text>
                    <Text style={styles.foodMeta}>{[food.amount, food.time].filter(Boolean).join(" · ")}</Text>
                  </Pressable>
                  {food.calories !== null ? <Text style={styles.foodCalories}>{Math.round(food.calories)} kcal</Text> : null}
                  {food.id !== null ? (
                    <Pressable
                      style={styles.removeButton}
                      onPress={() => handleRemove(food)}
                      disabled={isBusy}
                      hitSlop={8}
                    >
                      <Text style={styles.removeButtonText}>{isBusy ? "…" : "✕"}</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          );
        })
      )}

      {overview.nutrients.length > 0 ? (
        <View style={styles.nutrientsSection}>
          <Pressable onPress={() => setShowNutrients((v) => !v)} style={styles.nutrientsToggle}>
            <Text style={styles.nutrientsToggleText}>
              {showNutrients ? "Hide" : "Show"} all tracked nutrients ({overview.nutrients.length})
            </Text>
          </Pressable>
          {showNutrients ? (
            <>
              <Text style={styles.nutrientsNote}>
                Cronometer doesn&apos;t expose a personal target for each nutrient individually — the {overview.nutrition_score ?? "—"}%
                score above is the closest real figure it provides, covering all of them together.
              </Text>
              {nutrientsByCategory.map(([category, nutrients]) => (
                <View key={category} style={styles.nutrientGroup}>
                  <Text style={styles.nutrientCategory}>{category}</Text>
                  {nutrients.map((n) => (
                    <View key={n.id} style={styles.nutrientRow}>
                      <Text style={styles.nutrientName}>{n.name}</Text>
                      <Text style={styles.nutrientAmount}>
                        {Number.isInteger(n.amount) ? n.amount : n.amount.toFixed(1)}
                        {n.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      <Pressable style={styles.viewCronometerButton} onPress={() => Linking.openURL(CRONOMETER_URL)}>
        <Text style={styles.viewCronometerText}>View Cronometer</Text>
      </Pressable>
    </ScrollView>
  );
}

function MacroStat({ label, grams }: { label: string; grams: number | null }) {
  return (
    <View style={styles.macroStat}>
      <Text style={styles.macroValue}>{grams !== null ? `${Math.round(grams)}g` : "—"}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  headerButtonText: { color: "#2e7d32", fontWeight: "600" },
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", lineHeight: 20 },
  rowError: { color: "#c0392b", fontSize: 13, marginBottom: 8 },
  button: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 16,
  },
  buttonText: { color: "white", fontWeight: "600" },
  card: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  caloriesValue: { fontSize: 32, fontWeight: "800" },
  caloriesLabel: { color: "#666", fontSize: 13, marginTop: 4 },
  progressTrack: {
    height: 8,
    width: "100%",
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginTop: 14,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#2e7d32" },
  scoreBadge: {
    marginTop: 12,
    backgroundColor: "#e8f5e9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  scoreBadgeText: { color: "#2e7d32", fontSize: 12, fontWeight: "600" },
  macrosRow: { flexDirection: "row", marginBottom: 24 },
  macroStat: { flex: 1, alignItems: "center" },
  macroValue: { fontSize: 17, fontWeight: "700" },
  macroLabel: { fontSize: 12, color: "#777", marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  foodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    gap: 8,
  },
  foodMain: { flex: 1 },
  foodName: { fontSize: 15, fontWeight: "600" },
  foodMeta: { fontSize: 12, color: "#777", marginTop: 2 },
  foodCalories: { fontSize: 13, color: "#555" },
  removeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
  removeButtonText: { color: "#c0392b", fontSize: 14, fontWeight: "700" },
  editRow: { flex: 1 },
  editControls: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  editInput: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    width: 80,
  },
  editUnit: { color: "#666", fontSize: 13 },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  saveButton: { backgroundColor: "#2e7d32" },
  smallButtonText: { color: "white", fontWeight: "600", fontSize: 13 },
  smallButtonTextMuted: { color: "#777", fontWeight: "600", fontSize: 13 },
  nutrientsSection: { marginTop: 20 },
  nutrientsToggle: { paddingVertical: 10 },
  nutrientsToggleText: { color: "#2e7d32", fontWeight: "600", fontSize: 14 },
  nutrientsNote: { fontSize: 12, color: "#888", lineHeight: 17, marginBottom: 8 },
  nutrientGroup: { marginTop: 8 },
  nutrientCategory: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", marginBottom: 4 },
  nutrientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  nutrientName: { fontSize: 13, color: "#333" },
  nutrientAmount: { fontSize: 13, color: "#555" },
  viewCronometerButton: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#2e7d32",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  viewCronometerText: { color: "#2e7d32", fontWeight: "600" },
});
