import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { PantryItem, PantryItemInput, PantryLocation } from "../lib/api";

const LOCATIONS: { value: PantryLocation; label: string }[] = [
  { value: "fridge", label: "Fridge" },
  { value: "pantry", label: "Pantry" },
  { value: "freezer", label: "Freezer" },
];

export type PantryItemFormValues = PantryItemInput;

function toFormValues(item?: PantryItem): PantryItemFormValues {
  return {
    name: item?.name ?? "",
    brand: item?.brand ?? "",
    quantity: item?.quantity ?? 0,
    unit: item?.unit ?? "g",
    category: item?.category ?? "",
    location: item?.location ?? "pantry",
    expiration_date: item?.expiration_date ?? "",
    cronometer_food_id: item?.cronometer_food_id ?? "",
    notes: item?.notes ?? "",
  };
}

export function PantryItemForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: PantryItem;
  submitLabel: string;
  onSubmit: (values: PantryItemFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<PantryItemFormValues>(toFormValues(initial));
  const [quantityText, setQuantityText] = useState(String(initial?.quantity ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set<K extends keyof PantryItemFormValues>(key: K, value: PantryItemFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);

    const quantity = Number(quantityText);
    if (!values.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("Quantity must be a number.");
      return;
    }
    if (!values.unit.trim()) {
      setError("Unit is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...values,
        name: values.name.trim(),
        brand: values.brand?.trim() || null,
        quantity,
        unit: values.unit.trim(),
        category: values.category?.trim() || null,
        expiration_date: values.expiration_date?.trim() || null,
        cronometer_food_id: values.cronometer_food_id?.trim() || null,
        notes: values.notes?.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Field label="Name">
        <TextInput style={styles.input} value={values.name} onChangeText={(v) => set("name", v)} />
      </Field>

      <Field label="Brand (optional)">
        <TextInput style={styles.input} value={values.brand ?? ""} onChangeText={(v) => set("brand", v)} />
      </Field>

      <View style={styles.row}>
        <Field label="Quantity" style={styles.flex1}>
          <TextInput
            style={styles.input}
            value={quantityText}
            onChangeText={setQuantityText}
            keyboardType="decimal-pad"
          />
        </Field>
        <Field label="Unit" style={styles.flex1}>
          <TextInput style={styles.input} value={values.unit} onChangeText={(v) => set("unit", v)} placeholder="g, kg, ml, pcs…" />
        </Field>
      </View>

      <Field label="Category (optional)">
        <TextInput
          style={styles.input}
          value={values.category ?? ""}
          onChangeText={(v) => set("category", v)}
          placeholder="Grains, Dairy, Produce…"
        />
      </Field>

      <Field label="Location">
        <View style={styles.segmented}>
          {LOCATIONS.map((loc) => (
            <Pressable
              key={loc.value}
              style={[styles.segment, values.location === loc.value && styles.segmentActive]}
              onPress={() => set("location", loc.value)}
            >
              <Text style={[styles.segmentText, values.location === loc.value && styles.segmentTextActive]}>
                {loc.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Expiration date (optional, YYYY-MM-DD)">
        <TextInput
          style={styles.input}
          value={values.expiration_date ?? ""}
          onChangeText={(v) => set("expiration_date", v)}
          placeholder="2026-12-31"
        />
      </Field>

      <Field label="Notes (optional)">
        <TextInput
          style={[styles.input, styles.multiline]}
          value={values.notes ?? ""}
          onChangeText={(v) => set("notes", v)}
          multiline
        />
      </Field>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? "Saving…" : submitLabel}</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  segmented: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    alignItems: "center",
  },
  segmentActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  segmentText: { color: "#333", fontWeight: "600" },
  segmentTextActive: { color: "white" },
  error: { color: "#c0392b", marginBottom: 12 },
  button: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
});
