import { router } from "expo-router";
import { ScrollView } from "react-native";
import { PantryItemForm } from "../../components/PantryItemForm";
import { api } from "../../lib/api";

export default function NewItemScreen() {
  return (
    <ScrollView>
      <PantryItemForm
        submitLabel="Add to pantry"
        onSubmit={async (values) => {
          await api.createPantryItem(values);
          router.back();
        }}
      />
    </ScrollView>
  );
}
