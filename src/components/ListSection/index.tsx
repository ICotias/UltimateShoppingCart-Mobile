// src/components/ListSection.tsx
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { ListItem } from "@/components/ListItem";

type List = {
  id: string;
  name: string;
};

type Props = {
  lists: List[];
  onRemoveList: (listId: string) => Promise<void>;
  onRemoveAllLists: () => Promise<void>;
};

export function ListSection({ lists, onRemoveList, onRemoveAllLists }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Minhas listas</Text>
        {lists.length > 0 && (
          <TouchableOpacity
            style={styles.deleteAllButton}
            onPress={onRemoveAllLists}
          >
            <MaterialIcons name="delete-sweep" size={24} color="#B91C1C" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListItem id={item.id} name={item.name} onRemoveList={onRemoveList} />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Nenhuma lista criada ainda. Toque no botão + para criar uma!
          </Text>
        }
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  deleteAllButton: {
    padding: 8,
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 40,
    fontSize: 16,
  },
});
