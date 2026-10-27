import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { Link, router, useFocusEffect, useNavigation } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type NutritionTotals, type PantryItem, type PantryLocation, type PantryStats } from "../../lib/api";
import { confirmAsync } from "../../lib/confirm";
import { daysUntil, formatDaysLeft } from "../../lib/dates";

const LOCATION_LABELS: Record<PantryLocation, string> = {
  fridge: "Fridge",
  pantry: "Pantry",
  freezer: "Freezer",
};

const LOCATION_ORDER: PantryLocation[] = ["fridge", "freezer", "pantry"];

type SortKey = "location" | keyof NutritionTotals;

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "location", label: "Location" },
  { key: "calories", label: "Calories" },
  { key: "protein_g", label: "Protein" },
  { key: "carbs_g", label: "Carbs" },
  { key: "fat_g", label: "Fat" },
  { key: "fiber_g", label: "Fiber" },
];

const FILTER_FIELDS: { key: keyof NutritionTotals; label: string }[] = [
  { key: "calories", label: "Calories ≥" },
  { key: "protein_g", label: "Protein ≥" },
  { key: "carbs_g", label: "Carbs ≥" },
  { key: "fat_g", label: "Fat ≥" },
  { key: "fiber_g", label: "Fiber ≥" },
];

type Filters = Partial<Record<keyof NutritionTotals, number>>;

export default function PantryScreen() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [stats, setStats] = useState<PantryStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showControls, setShowControls] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("location");
  const [sortDesc, setSortDesc] = useState(true);
  const [filterInputs, setFilterInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listPantryItems();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pantry items.");
    }
    // Nutrition density is a best-effort enhancement for sort/filter — if Cronometer
    // isn't configured or the request fails, just leave sort/filter-by-nutrient
    // unavailable rather than treating it as a pantry-list error.
    try {
      setStats(await api.getPantryStats());
    } catch {
      setStats(null);
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

  // RefreshControl's pull-to-refresh gesture is a no-op on react-native-web, so this
  // header button is the only way web users can force a reload without switching tabs.
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable onPress={() => setShowControls((v) => !v)} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{showControls ? "Hide sort" : "Sort/filter"}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/pantry-stats")} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Stats</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/pantry-compare")} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Compare</Text>
          </Pressable>
          <Pressable onPress={handleRefresh} disabled={isRefreshing} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{isRefreshing ? "Refreshing…" : "Refresh"}</Text>
          </Pressable>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, isRefreshing, showControls]);

  async function confirmDelete(item: PantryItem) {
    const confirmed = await confirmAsync("Remove item", `Remove "${item.name}" from your pantry?`, "Remove");
    if (!confirmed) return;
    await api.deletePantryItem(item.id);
    load();
  }

  const density = useCallback((item: PantryItem): NutritionTotals | null => stats?.items[String(item.id)] ?? null, [
    stats,
  ]);

  const filters: Filters = useMemo(() => {
    const result: Filters = {};
    for (const [key, raw] of Object.entries(filterInputs)) {
      const value = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(value)) {
        result[key as keyof NutritionTotals] = value;
      }
    }
    return result;
  }, [filterInputs]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const { visible, hiddenByFilter } = useMemo(() => {
    if (!items) return { visible: [] as PantryItem[], hiddenByFilter: 0 };
    if (!hasActiveFilters) return { visible: items, hiddenByFilter: 0 };

    let hidden = 0;
    const kept = items.filter((item) => {
      const d = density(item);
      if (!d) {
        hidden += 1;
        return false;
      }
      const passes = Object.entries(filters).every(([key, min]) => d[key as keyof NutritionTotals] >= (min as number));
      if (!passes) hidden += 1;
      return passes;
    });
    return { visible: kept, hiddenByFilter: hidden };
  }, [items, filters, hasActiveFilters, density]);

  function clearFilters() {
    setFilterInputs({});
  }

  function toggleSort(key: SortKey) {
    if (key === sortBy) {
      if (key !== "location") setSortDesc((d) => !d);
      return;
    }
    setSortBy(key);
    setSortDesc(key !== "location");
  }

  if (items === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const controlsPanel = showControls ? (
    <View style={styles.controlsPanel}>
      <Text style={styles.controlsLabel}>Sort by</Text>
      <View style={styles.chipRow}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortBy === opt.key;
          return (
            <Pressable key={opt.key} onPress={() => toggleSort(opt.key)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
                {active && opt.key !== "location" ? (sortDesc ? " ↓" : " ↑") : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.controlsLabel}>Filter by density (per 100g)</Text>
      <View style={styles.filterRow}>
        {FILTER_FIELDS.map((f) => (
          <View key={f.key} style={styles.filterField}>
            <Text style={styles.filterLabel}>{f.label}</Text>
            <TextInput
              style={styles.filterInput}
              keyboardType="decimal-pad"
              value={filterInputs[f.key] ?? ""}
              onChangeText={(text) => setFilterInputs((prev) => ({ ...prev, [f.key]: text }))}
            />
          </View>
        ))}
      </View>
      <View style={styles.controlsFooterRow}>
        {hasActiveFilters ? (
          <Text style={styles.filterNote}>
            {hiddenByFilter > 0 ? `${hiddenByFilter} item(s) hidden (no nutrition data or below threshold). ` : ""}
            <Text style={styles.clearLink} onPress={clearFilters}>
              Clear filters
            </Text>
          </Text>
        ) : (
          <Text style={styles.filterNote}>Values need a pantry item linked to a Cronometer food to filter/sort by.</Text>
        )}
      </View>
    </View>
  ) : null;

  if (items.length === 0) {
    return (
      <View style={styles.flex}>
        {controlsPanel}
        <View style={styles.center}>
          <Text style={styles.emptyText}>Your pantry is empty. Add your first item.</Text>
        </View>
        <AddButton />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {controlsPanel}

      {sortBy === "location" ? (
        <SectionList
          sections={LOCATION_ORDER.map((location) => ({
            title: LOCATION_LABELS[location],
            data: visible.filter((item) => item.location === location).sort((a, b) => a.name.localeCompare(b.name)),
          })).filter((section) => section.data.length > 0)}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>
              {section.title} ({section.data.length})
            </Text>
          )}
          renderItem={({ item }) => (
            <ItemRow item={item} density={density(item)} showLocation={false} onLongPress={() => confirmDelete(item)} />
          )}
        />
      ) : (
        <FlatList
          data={[...visible].sort((a, b) => {
            const da = density(a)?.[sortBy as keyof NutritionTotals];
            const db = density(b)?.[sortBy as keyof NutritionTotals];
            if (da === undefined && db === undefined) return 0;
            if (da === undefined) return 1;
            if (db === undefined) return -1;
            return sortDesc ? db - da : da - db;
          })}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              density={density(item)}
              showLocation
              highlightMetric={sortBy as keyof NutritionTotals}
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      )}

      <AddButton />
    </View>
  );
}

function AddButton() {
  return (
    <Link href="/item/new" asChild>
      <Pressable style={styles.fab}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Link>
  );
}

const METRIC_LABELS: Record<keyof NutritionTotals, string> = {
  calories: "kcal",
  protein_g: "g protein",
  carbs_g: "g carbs",
  fat_g: "g fat",
  fiber_g: "g fiber",
};

function ItemRow({
  item,
  density,
  showLocation,
  highlightMetric,
  onLongPress,
}: {
  item: PantryItem;
  density: NutritionTotals | null;
  showLocation: boolean;
  highlightMetric?: keyof NutritionTotals;
  onLongPress: () => void;
}) {
  const metaParts = [`${item.quantity}${item.unit}`, item.category, showLocation ? LOCATION_LABELS[item.location] : null].filter(
    Boolean
  );

  const rowStyle = StyleSheet.flatten([
    styles.row,
    item.is_expired && styles.rowExpired,
    item.is_expiring_soon && !item.is_expired && styles.rowSoon,
  ]);

  return (
    <Link href={{ pathname: "/item/[id]", params: { id: String(item.id) } }} asChild>
      <Pressable style={rowStyle} onLongPress={onLongPress}>
        <View style={styles.rowMain}>
          <View style={styles.nameRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.is_opened ? <Text style={styles.openedTag}>opened</Text> : null}
          </View>
          <Text style={styles.itemMeta}>{metaParts.join(" · ")}</Text>
          {highlightMetric && density ? (
            <Text style={styles.densityText}>
              {density[highlightMetric]}
              {METRIC_LABELS[highlightMetric]} / 100g
            </Text>
          ) : null}
        </View>
        {item.effective_expiration_date ? (
          <Text
            style={[styles.badge, item.is_expired && styles.badgeExpired, item.is_expiring_soon && !item.is_expired && styles.badgeSoon]}
          >
            {item.is_opened
              ? formatDaysLeft(daysUntil(item.effective_expiration_date))
              : item.is_expired
                ? "expired"
                : item.effective_expiration_date}
          </Text>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row" },
  headerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  headerButtonText: { color: "#2e7d32", fontWeight: "600" },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: "#666", fontSize: 16, textAlign: "center" },
  error: { color: "#c0392b" },
  controlsPanel: {
    backgroundColor: "#f5f5f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    padding: 12,
  },
  controlsLabel: { fontSize: 11, fontWeight: "700", color: "#777", textTransform: "uppercase", marginTop: 8, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    backgroundColor: "white",
  },
  chipActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  chipText: { fontSize: 13, color: "#333", fontWeight: "600" },
  chipTextActive: { color: "white" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  filterField: { width: 100 },
  filterLabel: { fontSize: 11, color: "#666", marginBottom: 4 },
  filterInput: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "white",
  },
  controlsFooterRow: { marginTop: 10 },
  filterNote: { fontSize: 12, color: "#888" },
  clearLink: { color: "#2e7d32", fontWeight: "600" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  rowSoon: { backgroundColor: "#fffaf0" },
  rowExpired: { backgroundColor: "#fdf3f2" },
  rowMain: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemName: { fontSize: 16, fontWeight: "600" },
  openedTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1565c0",
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    textTransform: "uppercase",
  },
  itemMeta: { fontSize: 13, color: "#777", marginTop: 2 },
  densityText: { fontSize: 12, color: "#2e7d32", marginTop: 2, fontWeight: "600" },
  badge: {
    fontSize: 12,
    color: "#555",
    backgroundColor: "#eee",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeSoon: { backgroundColor: "#fff3cd", color: "#8a6d1a" },
  badgeExpired: { backgroundColor: "#fdecea", color: "#c0392b" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2e7d32",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: "white", fontSize: 28, lineHeight: 28, marginTop: -2 },
});
