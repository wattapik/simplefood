import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PantryItemForm } from "../../components/PantryItemForm";
import { confirmAsync } from "../../lib/confirm";
import { daysUntil, formatDaysLeft } from "../../lib/dates";
import { api, type PantryItem } from "../../lib/api";

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);

  const [item, setItem] = useState<PantryItem | null>(null);
  const [consumeQuantity, setConsumeQuantity] = useState("");
  const [consumeUnit, setConsumeUnit] = useState("");
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const [openedExpiryDate, setOpenedExpiryDate] = useState("");
  const [openedError, setOpenedError] = useState<string | null>(null);

  useEffect(() => {
    api.getPantryItem(itemId).then((data) => {
      setItem(data);
      setConsumeUnit(data.unit);
      setOpenedExpiryDate(data.opened_expiration_date ?? "");
    });
  }, [itemId]);

  async function confirmDelete() {
    const confirmed = await confirmAsync("Remove item", `Remove "${item?.name}" from your pantry?`, "Remove");
    if (!confirmed) return;
    await api.deletePantryItem(itemId);
    router.back();
  }

  async function handleConsume() {
    setConsumeError(null);
    const quantity = Number(consumeQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setConsumeError("Enter a quantity greater than 0.");
      return;
    }
    try {
      await api.consumePantryItem(itemId, quantity, consumeUnit.trim());
      router.back();
    } catch (err) {
      setConsumeError(err instanceof Error ? err.message : "Could not log this.");
    }
  }

  async function handleMarkOpened() {
    setOpenedError(null);
    try {
      const updated = await api.updatePantryItem(itemId, {
        opened_at: new Date().toISOString(),
        opened_expiration_date: openedExpiryDate.trim() || null,
      });
      setItem(updated);
    } catch (err) {
      setOpenedError(err instanceof Error ? err.message : "Could not mark this as opened.");
    }
  }

  async function handleSaveOpenedExpiry() {
    setOpenedError(null);
    try {
      const updated = await api.updatePantryItem(itemId, { opened_expiration_date: openedExpiryDate.trim() || null });
      setItem(updated);
    } catch (err) {
      setOpenedError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function handleUnmarkOpened() {
    setOpenedError(null);
    try {
      const updated = await api.updatePantryItem(itemId, { opened_at: null, opened_expiration_date: null });
      setItem(updated);
      setOpenedExpiryDate("");
    } catch (err) {
      setOpenedError(err instanceof Error ? err.message : "Could not update this.");
    }
  }

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView>
      <View style={styles.consumeCard}>
        <Text style={styles.consumeTitle}>Log as eaten / used</Text>
        <View style={styles.consumeRow}>
          <TextInput
            style={[styles.input, styles.flex1]}
            value={consumeQuantity}
            onChangeText={setConsumeQuantity}
            keyboardType="decimal-pad"
            placeholder="amount"
          />
          <TextInput
            style={[styles.input, styles.unitInput]}
            value={consumeUnit}
            onChangeText={setConsumeUnit}
          />
          <Pressable style={styles.consumeButton} onPress={handleConsume}>
            <Text style={styles.consumeButtonText}>Deduct</Text>
          </Pressable>
        </View>
        {consumeError ? <Text style={styles.error}>{consumeError}</Text> : null}
      </View>

      <View style={styles.consumeCard}>
        <Text style={styles.consumeTitle}>Opened</Text>
        {item.is_opened ? (
          <>
            <Text style={styles.openedInfo}>
              Opened {item.opened_at ? new Date(item.opened_at).toLocaleDateString() : ""}
              {item.effective_expiration_date ? ` · ${formatDaysLeft(daysUntil(item.effective_expiration_date))}` : ""}
            </Text>
            <View style={styles.consumeRow}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={openedExpiryDate}
                onChangeText={setOpenedExpiryDate}
                placeholder="Estimated expiry once opened (YYYY-MM-DD)"
              />
              <Pressable style={styles.consumeButton} onPress={handleSaveOpenedExpiry}>
                <Text style={styles.consumeButtonText}>Save</Text>
              </Pressable>
            </View>
            <Pressable onPress={handleUnmarkOpened}>
              <Text style={styles.unmarkLink}>Mark as unopened</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.openedHint}>
              Set your own estimate of how long this is good for once opened — the pantry list will highlight it
              based on whichever comes sooner, that or the original expiration date.
            </Text>
            <View style={styles.consumeRow}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={openedExpiryDate}
                onChangeText={setOpenedExpiryDate}
                placeholder="Estimated expiry (optional, YYYY-MM-DD)"
              />
              <Pressable style={styles.consumeButton} onPress={handleMarkOpened}>
                <Text style={styles.consumeButtonText}>Mark opened</Text>
              </Pressable>
            </View>
          </>
        )}
        {openedError ? <Text style={styles.error}>{openedError}</Text> : null}
      </View>

      <PantryItemForm
        initial={item}
        submitLabel="Save changes"
        onSubmit={async (values) => {
          await api.updatePantryItem(itemId, values);
          router.back();
        }}
      />

      <Pressable style={styles.deleteButton} onPress={confirmDelete}>
        <Text style={styles.deleteButtonText}>Remove from pantry</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  consumeCard: {
    margin: 16,
    marginBottom: 0,
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
  },
  consumeTitle: { fontWeight: "700", marginBottom: 10 },
  consumeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  flex1: { flex: 1 },
  unitInput: { width: 70 },
  input: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "white",
  },
  consumeButton: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  consumeButtonText: { color: "white", fontWeight: "600" },
  error: { color: "#c0392b", marginTop: 8 },
  openedInfo: { fontSize: 13, color: "#555", marginBottom: 10 },
  openedHint: { fontSize: 12, color: "#777", marginBottom: 10, lineHeight: 17 },
  unmarkLink: { color: "#c0392b", fontWeight: "600", marginTop: 10, fontSize: 13 },
  deleteButton: { margin: 16, marginTop: 0, alignItems: "center", paddingVertical: 12 },
  deleteButtonText: { color: "#c0392b", fontWeight: "600" },
});
