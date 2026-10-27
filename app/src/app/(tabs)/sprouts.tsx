import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type Sprout } from "../../lib/api";
import { confirmAsync } from "../../lib/confirm";
import { daysUntil, formatDaysLeft } from "../../lib/dates";

/**
 * Sprout batches are tracked and harvested via chat ("I've just set 50g of broccoli
 * seeds to sprout inside dirt" / "my sprouts are done") — Claude estimates the ready
 * date on start and the fridge use-by date on harvest (see the pantry MCP's
 * start_sprouting/harvest_sprout tools). This tab is for browsing what's growing,
 * fixing a mistracked detail, marking a batch grown by hand, or abandoning one that
 * failed.
 */

type EditableFields = { medium: string; seed_quantity: string; seed_unit: string; estimated_ready_at: string; notes: string };
type HarvestFields = { quantity: string; unit: string; expiration_date: string };

export default function SproutsScreen() {
  const [sprouts, setSprouts] = useState<Sprout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<EditableFields>({ medium: "", seed_quantity: "", seed_unit: "", estimated_ready_at: "", notes: "" });
  const [isSaving, setIsSaving] = useState(false);

  const [harvestingId, setHarvestingId] = useState<number | null>(null);
  const [harvestFields, setHarvestFields] = useState<HarvestFields>({ quantity: "", unit: "", expiration_date: "" });

  const load = useCallback(async () => {
    try {
      setError(null);
      setSprouts(await api.listSprouts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sprouts.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDelete(sprout: Sprout) {
    const confirmed = await confirmAsync("Stop tracking", `Stop tracking this batch of ${sprout.seed_name}?`, "Remove");
    if (!confirmed) return;
    setBusyId(sprout.id);
    try {
      await api.deleteSprout(sprout.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that batch.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(sprout: Sprout) {
    setError(null);
    setHarvestingId(null);
    setEditingId(sprout.id);
    setEditFields({
      medium: sprout.medium,
      seed_quantity: sprout.seed_quantity !== null ? String(sprout.seed_quantity) : "",
      seed_unit: sprout.seed_unit ?? "",
      estimated_ready_at: sprout.estimated_ready_at ?? "",
      notes: sprout.notes ?? "",
    });
  }

  function cancelEditing() {
    setEditingId(null);
  }

  async function saveEditing(sprout: Sprout) {
    const quantity = editFields.seed_quantity.trim() ? Number(editFields.seed_quantity) : null;
    if (editFields.seed_quantity.trim() && (!Number.isFinite(quantity) || (quantity as number) < 0)) {
      setError("Seed quantity must be a non-negative number, or left blank.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await api.updateSprout(sprout.id, {
        medium: editFields.medium.trim(),
        seed_quantity: quantity,
        seed_unit: quantity !== null ? editFields.seed_unit.trim() || "g" : null,
        estimated_ready_at: editFields.estimated_ready_at.trim() || null,
        notes: editFields.notes.trim() || null,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function startHarvesting(sprout: Sprout) {
    setError(null);
    setEditingId(null);
    setHarvestingId(sprout.id);
    setHarvestFields({ quantity: "", unit: "", expiration_date: "" });
  }

  function cancelHarvesting() {
    setHarvestingId(null);
  }

  async function confirmHarvest(sprout: Sprout) {
    const quantity = harvestFields.quantity.trim() ? Number(harvestFields.quantity) : undefined;
    if (harvestFields.quantity.trim() && (!Number.isFinite(quantity) || (quantity as number) <= 0)) {
      setError("Harvested amount must be a positive number, or left blank.");
      return;
    }

    setError(null);
    setBusyId(sprout.id);
    try {
      await api.harvestSprout(sprout.id, {
        quantity,
        unit: quantity !== undefined ? harvestFields.unit.trim() || "g" : undefined,
        expiration_date: harvestFields.expiration_date.trim() || undefined,
      });
      setHarvestingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this batch as harvested.");
    } finally {
      setBusyId(null);
    }
  }

  if (sprouts === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const growing = sprouts.filter((s) => !s.is_harvested);
  const harvested = sprouts.filter((s) => s.is_harvested);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {sprouts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No sprouts tracked yet</Text>
          <Text style={styles.emptyText}>
            Tell Claude what you&apos;ve set to sprout in the Chat tab — e.g. &ldquo;I&apos;ve just set 50g of
            broccoli seeds to sprout inside dirt&rdquo; — and it&apos;ll show up here.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Growing ({growing.length})</Text>
          {growing.length === 0 ? <Text style={styles.emptySection}>Nothing currently growing.</Text> : null}
          {growing.map((sprout) =>
            harvestingId === sprout.id ? (
              <HarvestCard
                key={sprout.id}
                sprout={sprout}
                fields={harvestFields}
                setFields={setHarvestFields}
                onConfirm={() => confirmHarvest(sprout)}
                onCancel={cancelHarvesting}
                busy={busyId === sprout.id}
              />
            ) : editingId === sprout.id ? (
              <EditCard
                key={sprout.id}
                sprout={sprout}
                fields={editFields}
                setFields={setEditFields}
                onSave={() => saveEditing(sprout)}
                onCancel={cancelEditing}
                saving={isSaving}
              />
            ) : (
              <SproutRow
                key={sprout.id}
                sprout={sprout}
                busy={busyId === sprout.id}
                onEdit={() => startEditing(sprout)}
                onHarvest={() => startHarvesting(sprout)}
                onDelete={() => handleDelete(sprout)}
              />
            )
          )}

          {harvested.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Harvested ({harvested.length})</Text>
              {harvested.map((sprout) => (
                <SproutRow
                  key={sprout.id}
                  sprout={sprout}
                  busy={busyId === sprout.id}
                  onEdit={() => startEditing(sprout)}
                  onDelete={() => handleDelete(sprout)}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function SproutRow({
  sprout,
  busy,
  onEdit,
  onHarvest,
  onDelete,
}: {
  sprout: Sprout;
  busy: boolean;
  onEdit: () => void;
  onHarvest?: () => void;
  onDelete: () => void;
}) {
  const seedAmount = sprout.seed_quantity !== null ? `${sprout.seed_quantity}${sprout.seed_unit} seed` : null;

  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={onEdit}>
        <Text style={styles.sproutName}>{sprout.seed_name}</Text>
        <Text style={styles.sproutMeta}>
          {sprout.medium}
          {seedAmount ? ` · ${seedAmount}` : ""}
        </Text>
        {sprout.is_harvested ? (
          <Text style={styles.sproutMeta}>Harvested {sprout.harvested_at?.slice(0, 10)}</Text>
        ) : sprout.estimated_ready_at ? (
          <Text style={[styles.sproutMeta, sprout.is_overdue && styles.overdueText]}>
            {sprout.is_overdue ? "Past estimated ready date " : "Ready "}
            {formatDaysLeft(daysUntil(sprout.estimated_ready_at))} ({sprout.estimated_ready_at})
          </Text>
        ) : null}
        {sprout.notes ? <Text style={styles.notes}>{sprout.notes}</Text> : null}
      </Pressable>
      <View style={styles.rowButtons}>
        {onHarvest ? (
          <Pressable onPress={onHarvest} hitSlop={8} disabled={busy}>
            <Text style={styles.harvestLink}>Mark grown</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.removeButton} onPress={onDelete} disabled={busy} hitSlop={8}>
          <Text style={styles.removeButtonText}>{busy ? "…" : "✕"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EditCard({
  sprout,
  fields,
  setFields,
  onSave,
  onCancel,
  saving,
}: {
  sprout: Sprout;
  fields: EditableFields;
  setFields: (updater: (prev: EditableFields) => EditableFields) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <View style={styles.editCard}>
      <Text style={styles.sproutName}>{sprout.seed_name}</Text>

      <Text style={styles.fieldLabel}>Medium</Text>
      <TextInput style={styles.textInput} value={fields.medium} onChangeText={(text) => setFields((prev) => ({ ...prev, medium: text }))} />

      <View style={styles.fieldRow}>
        <View style={styles.fieldRowItem}>
          <Text style={styles.fieldLabel}>Seed amount</Text>
          <TextInput
            style={styles.textInput}
            value={fields.seed_quantity}
            onChangeText={(text) => setFields((prev) => ({ ...prev, seed_quantity: text }))}
            keyboardType="decimal-pad"
            placeholder="optional"
          />
        </View>
        <View style={styles.fieldRowItemNarrow}>
          <Text style={styles.fieldLabel}>Unit</Text>
          <TextInput
            style={styles.textInput}
            value={fields.seed_unit}
            onChangeText={(text) => setFields((prev) => ({ ...prev, seed_unit: text }))}
            placeholder="g"
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Estimated ready date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.textInput}
        value={fields.estimated_ready_at}
        onChangeText={(text) => setFields((prev) => ({ ...prev, estimated_ready_at: text }))}
        placeholder="optional"
      />

      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput style={styles.textInput} value={fields.notes} onChangeText={(text) => setFields((prev) => ({ ...prev, notes: text }))} />

      <View style={styles.editActions}>
        <Pressable style={styles.saveButton} onPress={onSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={onCancel} disabled={saving}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HarvestCard({
  sprout,
  fields,
  setFields,
  onConfirm,
  onCancel,
  busy,
}: {
  sprout: Sprout;
  fields: HarvestFields;
  setFields: (updater: (prev: HarvestFields) => HarvestFields) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.editCard}>
      <Text style={styles.sproutName}>Mark {sprout.seed_name} as grown</Text>
      <Text style={styles.harvestHint}>
        This moves it to the fridge. Leave the amount blank if you&apos;re not measuring it, and leave the use-by date
        blank to let Claude estimate it for you later.
      </Text>

      <View style={styles.fieldRow}>
        <View style={styles.fieldRowItem}>
          <Text style={styles.fieldLabel}>Harvested amount</Text>
          <TextInput
            style={styles.textInput}
            value={fields.quantity}
            onChangeText={(text) => setFields((prev) => ({ ...prev, quantity: text }))}
            keyboardType="decimal-pad"
            placeholder="optional"
          />
        </View>
        <View style={styles.fieldRowItemNarrow}>
          <Text style={styles.fieldLabel}>Unit</Text>
          <TextInput
            style={styles.textInput}
            value={fields.unit}
            onChangeText={(text) => setFields((prev) => ({ ...prev, unit: text }))}
            placeholder="g"
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Use by (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.textInput}
        value={fields.expiration_date}
        onChangeText={(text) => setFields((prev) => ({ ...prev, expiration_date: text }))}
        placeholder="optional"
      />

      <View style={styles.editActions}>
        <Pressable style={styles.saveButton} onPress={onConfirm} disabled={busy}>
          <Text style={styles.saveButtonText}>{busy ? "Saving…" : "Confirm harvest"}</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, maxWidth: 560, width: "100%", alignSelf: "center", flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptySection: { color: "#888", fontSize: 13, marginBottom: 12 },
  error: { color: "#c0392b", fontSize: 13, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#777", textTransform: "uppercase", marginTop: 16, marginBottom: 8 },
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
  harvestLink: { color: "#2e7d32", fontWeight: "600", fontSize: 13 },
  sproutName: { fontSize: 15, fontWeight: "600" },
  sproutMeta: { fontSize: 13, color: "#666", marginTop: 2 },
  overdueText: { color: "#c0392b", fontWeight: "600" },
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
  harvestHint: { fontSize: 12, color: "#666", marginTop: 4, marginBottom: 6, lineHeight: 17 },
  fieldLabel: { fontSize: 11, color: "#777", marginTop: 10, marginBottom: 4 },
  fieldRow: { flexDirection: "row", gap: 10 },
  fieldRowItem: { flex: 1 },
  fieldRowItemNarrow: { width: 70 },
  textInput: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "white",
  },
  editActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  saveButton: { backgroundColor: "#2e7d32", borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  saveButtonText: { color: "white", fontWeight: "600" },
  cancelButton: { paddingHorizontal: 18, paddingVertical: 10 },
  cancelButtonText: { color: "#777", fontWeight: "600" },
});
