import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type Recipe, type RecipeIngredient, type RecipeRecommendation, type RecipeRecommendations } from "../../lib/api";
import { confirmAsync } from "../../lib/confirm";

/**
 * Recipes here are a cooking journal, not a static cookbook: the same dish name can
 * have many entries over time (see the backend's Recipe model), each recording what
 * actually went in on that occasion. Recorded via chat ("I made vegetable soup with
 * ..."); this tab is for browsing, searching, seeing recommendations, and — for a
 * specific already-recorded entry — fixing an ingredient's weight or adding one that
 * was forgotten (editing the entry itself, not recording a new occasion of the dish).
 */

// Quantity kept as a string while editing so the input can hold intermediate states
// (empty, "1.", etc.) — parsed to a number only when saving.
type EditableIngredient = { name: string; quantity: string; unit: string; cronometer_food_id?: string | null };

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [recommendations, setRecommendations] = useState<RecipeRecommendations | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editIngredients, setEditIngredients] = useState<EditableIngredient[]>([]);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async (query: string) => {
    try {
      setError(null);
      setRecipes(await api.listRecipes(query || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load recipes.");
    }
    try {
      setRecommendations(await api.getRecipeRecommendations());
    } catch {
      setRecommendations(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(search);
      // Only reload on focus, not on every keystroke — search re-fetches separately below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  async function handleSearchChange(text: string) {
    setSearch(text);
    await load(text);
  }

  async function handleDelete(recipe: Recipe) {
    const confirmed = await confirmAsync("Delete recipe", `Delete this record of "${recipe.name}" (${recipe.made_at})?`, "Delete");
    if (!confirmed) return;
    setBusyId(recipe.id);
    try {
      await api.deleteRecipe(recipe.id);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that recipe.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(recipe: Recipe) {
    setError(null);
    setEditingId(recipe.id);
    setEditIngredients(
      recipe.ingredients.map((i) => ({ name: i.name, quantity: String(i.quantity), unit: i.unit, cronometer_food_id: i.cronometer_food_id }))
    );
    setNewName("");
    setNewQuantity("");
    setNewUnit("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditIngredients([]);
  }

  function updateEditQuantity(index: number, quantity: string) {
    setEditIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, quantity } : ing)));
  }

  function removeEditIngredient(index: number) {
    setEditIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function addNewIngredient() {
    if (!newName.trim() || !newUnit.trim() || !newQuantity.trim()) return;
    setEditIngredients((prev) => [...prev, { name: newName.trim(), quantity: newQuantity.trim(), unit: newUnit.trim() }]);
    setNewName("");
    setNewQuantity("");
    setNewUnit("");
  }

  async function saveEditing(recipeId: number) {
    const ingredients: RecipeIngredient[] = [];
    for (const ing of editIngredients) {
      const quantity = Number(ing.quantity);
      if (!ing.name.trim() || !ing.unit.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        setError("Each ingredient needs a name, unit, and a quantity greater than 0.");
        return;
      }
      ingredients.push({ name: ing.name.trim(), quantity, unit: ing.unit.trim(), cronometer_food_id: ing.cronometer_food_id ?? null });
    }
    if (ingredients.length === 0) {
      setError("A recipe needs at least one ingredient — remove the recipe instead if it shouldn't exist.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await api.updateRecipe(recipeId, { ingredients });
      setEditingId(null);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  if (recipes === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {recommendations && recommendations.recommendations.length > 0 ? (
        <RecommendationsSection recommendations={recommendations} />
      ) : null}

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={handleSearchChange}
        placeholder="Search recipes…"
        autoCapitalize="none"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {recipes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{search ? "No matching recipes" : "No recipes recorded yet"}</Text>
          {!search ? (
            <Text style={styles.emptyText}>
              Tell Claude about something you made in the Chat tab — e.g. &ldquo;I made vegetable soup with 200g
              carrots, 150g onion, 100g celery&rdquo; — and it&apos;ll show up here.
            </Text>
          ) : null}
        </View>
      ) : (
        recipes.map((recipe) =>
          editingId === recipe.id ? (
            <View key={recipe.id} style={styles.editCard}>
              <Text style={styles.recipeName}>{recipe.name}</Text>
              <Text style={styles.recipeDate}>{recipe.made_at}</Text>

              {editIngredients.map((ing, index) => (
                <View key={index} style={styles.editIngredientRow}>
                  <Text style={styles.editIngredientName}>{ing.name}</Text>
                  <TextInput
                    style={styles.editQuantityInput}
                    value={ing.quantity}
                    onChangeText={(text) => updateEditQuantity(index, text)}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.editUnit}>{ing.unit}</Text>
                  <Pressable onPress={() => removeEditIngredient(index)} hitSlop={8}>
                    <Text style={styles.editRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}

              <View style={styles.addIngredientRow}>
                <TextInput
                  style={styles.addNameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="New ingredient"
                />
                <TextInput
                  style={styles.addQuantityInput}
                  value={newQuantity}
                  onChangeText={setNewQuantity}
                  placeholder="qty"
                  keyboardType="decimal-pad"
                />
                <TextInput style={styles.addUnitInput} value={newUnit} onChangeText={setNewUnit} placeholder="unit" />
                <Pressable style={styles.addButton} onPress={addNewIngredient}>
                  <Text style={styles.addButtonText}>+</Text>
                </Pressable>
              </View>

              <View style={styles.editActions}>
                <Pressable style={styles.saveButton} onPress={() => saveEditing(recipe.id)} disabled={isSaving}>
                  <Text style={styles.saveButtonText}>{isSaving ? "Saving…" : "Save"}</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={cancelEditing} disabled={isSaving}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={recipe.id} style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => startEditing(recipe)}>
                <Text style={styles.recipeName}>{recipe.name}</Text>
                <Text style={styles.recipeDate}>{recipe.made_at}</Text>
                <Text style={styles.ingredientList}>
                  {recipe.ingredients.map((i) => `${i.quantity}${i.unit} ${i.name}`).join(", ")}
                </Text>
                {recipe.notes ? <Text style={styles.notes}>{recipe.notes}</Text> : null}
              </Pressable>
              <View style={styles.rowButtons}>
                <Pressable onPress={() => startEditing(recipe)} hitSlop={8}>
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
                <Pressable style={styles.removeButton} onPress={() => handleDelete(recipe)} disabled={busyId === recipe.id} hitSlop={8}>
                  <Text style={styles.removeButtonText}>{busyId === recipe.id ? "…" : "✕"}</Text>
                </Pressable>
              </View>
            </View>
          )
        )
      )}
    </ScrollView>
  );
}

function RecommendationsSection({ recommendations }: { recommendations: RecipeRecommendations }) {
  const { today } = recommendations;

  return (
    <View style={styles.recSection}>
      <Text style={styles.recTitle}>Use it up</Text>
      <Text style={styles.recSubtitle}>Recipes you&apos;ve made before that use something expiring soon</Text>

      {today ? (
        <Text style={styles.todayNote}>
          Today so far: {today.calories.consumed} kcal
          {today.macros.protein_g !== null ? ` · ${Math.round(today.macros.protein_g)}g protein` : ""}
          {today.macros.carbs_g !== null ? ` · ${Math.round(today.macros.carbs_g)}g carbs` : ""}
          {today.macros.fat_g !== null ? ` · ${Math.round(today.macros.fat_g)}g fat` : ""}
          {today.macros.fiber_g !== null ? ` · ${Math.round(today.macros.fiber_g)}g fiber` : ""} — compare against
          each recipe&apos;s own nutrition below.
        </Text>
      ) : null}

      {recommendations.recommendations.map((rec) => (
        <RecommendationCard key={rec.recipe.id} rec={rec} />
      ))}
    </View>
  );
}

function RecommendationCard({ rec }: { rec: RecipeRecommendation }) {
  return (
    <View style={styles.recCard}>
      <Text style={styles.recCardName}>{rec.recipe.name}</Text>
      <Text style={styles.recCardMatches}>
        Uses: {rec.matches.map((m) => m.pantry_item).join(", ")}
      </Text>
      {rec.nutrition ? (
        <Text style={styles.recCardNutrition}>
          {Math.round(rec.nutrition.calories)} kcal · {Math.round(rec.nutrition.protein_g)}g protein ·{" "}
          {Math.round(rec.nutrition.carbs_g)}g carbs · {Math.round(rec.nutrition.fat_g)}g fat ·{" "}
          {Math.round(rec.nutrition.fiber_g)}g fiber
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center", flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", lineHeight: 20 },
  error: { color: "#c0392b", fontSize: 13, marginBottom: 10 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  recSection: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  recTitle: { fontSize: 16, fontWeight: "700" },
  recSubtitle: { fontSize: 12, color: "#888", marginTop: 2, marginBottom: 10 },
  todayNote: { fontSize: 12, color: "#555", marginBottom: 12, lineHeight: 17 },
  recCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  recCardName: { fontSize: 14, fontWeight: "700" },
  recCardMatches: { fontSize: 12, color: "#2e7d32", marginTop: 2, fontWeight: "600" },
  recCardNutrition: { fontSize: 12, color: "#777", marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    gap: 8,
  },
  rowMain: { flex: 1 },
  rowButtons: { alignItems: "flex-end", gap: 8 },
  editLink: { color: "#2e7d32", fontWeight: "600", fontSize: 13 },
  recipeName: { fontSize: 15, fontWeight: "600" },
  recipeDate: { fontSize: 12, color: "#888", marginTop: 2 },
  ingredientList: { fontSize: 13, color: "#555", marginTop: 4, lineHeight: 18 },
  notes: { fontSize: 12, color: "#888", marginTop: 4, fontStyle: "italic" },
  removeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
  removeButtonText: { color: "#c0392b", fontSize: 14, fontWeight: "700" },
  editCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  editIngredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  editIngredientName: { flex: 1, fontSize: 14, color: "#333" },
  editQuantityInput: {
    width: 70,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "white",
  },
  editUnit: { fontSize: 13, color: "#666", width: 32 },
  editRemoveText: { color: "#c0392b", fontSize: 14, fontWeight: "700" },
  addIngredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
  },
  addNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "white",
  },
  addQuantityInput: {
    width: 60,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "white",
  },
  addUnitInput: {
    width: 56,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "white",
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2e7d32",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { color: "white", fontSize: 18, fontWeight: "700", lineHeight: 20 },
  editActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  saveButton: { backgroundColor: "#2e7d32", borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  saveButtonText: { color: "white", fontWeight: "600" },
  cancelButton: { paddingHorizontal: 18, paddingVertical: 10 },
  cancelButtonText: { color: "#777", fontWeight: "600" },
});
