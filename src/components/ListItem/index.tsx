// src/components/ListItem.tsx
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  GestureResponderEvent,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/routes";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

type Props = {
  name: string;
  id: string;
  onRemoveList: (listId: string) => Promise<void>;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ListItem({ name, id, onRemoveList }: Props) {
  const navigation = useNavigation<Nav>();

  function handleRemovePress(e: GestureResponderEvent) {
    e.stopPropagation();
    onRemoveList(id);
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate("List", { id, name })}
    >
      <Text style={styles.text}>{name}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={handleRemovePress}
        >
          <MaterialIcons name="delete" size={20} color="#B91C1C" />
        </TouchableOpacity>

        <View style={styles.iconBox}>
          <MaterialIcons name="add" size={24} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderColor: "blue",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  text: {
    fontSize: 18,
    fontWeight: "600",
  },
  actions: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  removeButton: {
    padding: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "blue",
    justifyContent: "center",
    alignItems: "center",
  },
});
