import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
} from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/routes";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { onAuthStateChanged, User } from "firebase/auth";
import { db, auth } from "@/services/firebase";

type ListRouteProp = RouteProp<RootStackParamList, "List">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

type Item = {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  createdAt: any;
};

export default function ListScreen() {
  const { params } = useRoute<ListRouteProp>();
  const navigation = useNavigation<Nav>();

  const [user, setUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<"toTake" | "alreadyTaken">("toTake");
  const [items, setItems] = useState<Item[]>([]);
  const [availableItems, setAvailableItems] = useState<
    { id: string; name: string }[]
  >([]);
  const [showItemSelector, setShowItemSelector] = useState(false);

  // Escutar mudanças no estado de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Limpar itens quando o usuário fizer logout
      if (!currentUser) {
        setItems([]);
      }
    });

    return unsubscribe;
  }, []);

  // Carregar itens do Firestore
  useEffect(() => {
    if (!user || !params.id) return;

    const itemsRef = collection(
      db,
      "users",
      user.uid,
      "lists",
      params.id,
      "items"
    );

    const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        quantity: doc.data().quantity || 1,
        checked: doc.data().checked || false,
        createdAt: doc.data().createdAt,
      }));
      setItems(data);
    });

    return unsubscribe;
  }, [user, params.id]);

  // Carregar itens pré-definidos do Firebase
  useEffect(() => {
    const itemsRef = collection(db, "items");

    const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
      }));
      setAvailableItems(data);
    });

    return unsubscribe;
  }, []);

  // Atualizar updatedAt da lista quando houver mudanças
  async function updateListTimestamp() {
    if (!user || !params.id) return;
    const listRef = doc(db, "users", user.uid, "lists", params.id);
    await updateDoc(listRef, {
      updatedAt: serverTimestamp(),
    });
  }

  async function addItem(itemName: string) {
    if (!itemName.trim() || !user || !params.id) return;

    // Verificar se o item já existe na lista
    const itemExists = items.some(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    if (itemExists) {
      Alert.alert("Item já existe", "Este item já está na sua lista.");
      return;
    }

    try {
      await addDoc(
        collection(db, "users", user.uid, "lists", params.id, "items"),
        {
          name: itemName.trim(),
          quantity: 1,
          checked: false,
          createdAt: serverTimestamp(),
        }
      );
      await updateListTimestamp();
      setShowItemSelector(false);
      setFilter("toTake");
    } catch (error: any) {
      console.log("Erro ao adicionar item:", error.message);
      Alert.alert("Erro", "Não foi possível adicionar o item.");
    }
  }

  async function toggleItemStatus(id: string) {
    if (!user || !params.id) return;

    const item = items.find((i) => i.id === id);
    if (!item) return;

    try {
      const itemRef = doc(
        db,
        "users",
        user.uid,
        "lists",
        params.id,
        "items",
        id
      );
      await updateDoc(itemRef, {
        checked: !item.checked,
      });
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro ao atualizar item:", error.message);
      Alert.alert("Erro", "Não foi possível atualizar o item.");
    }
  }

  function confirmRemoveItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    Alert.alert(
      "Remover item",
      `Remover "${item.name}" da lista?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => removeItem(id),
        },
      ],
      { cancelable: true }
    );
  }

  async function removeItem(id: string) {
    if (!user || !params.id) return;

    try {
      const itemRef = doc(
        db,
        "users",
        user.uid,
        "lists",
        params.id,
        "items",
        id
      );
      await deleteDoc(itemRef);
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro ao remover item:", error.message);
      Alert.alert("Erro", "Não foi possível remover o item.");
    }
  }

  async function confirmClearAll() {
    if (items.length === 0) {
      Alert.alert("Nada para apagar", "A lista já está vazia.");
      return;
    }

    Alert.alert(
      "Limpar tudo",
      "Tem certeza que deseja remover todos os itens desta lista?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover tudo",
          style: "destructive",
          onPress: () => clearAllItems(),
        },
      ],
      { cancelable: true }
    );
  }

  async function clearAllItems() {
    if (!user || !params.id) return;

    try {
      const batch = writeBatch(db);
      items.forEach((item) => {
        const itemRef = doc(
          db,
          "users",
          user.uid,
          "lists",
          params.id,
          "items",
          item.id
        );
        batch.delete(itemRef);
      });
      await batch.commit();
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro ao limpar itens:", error.message);
      Alert.alert("Erro", "Não foi possível limpar os itens.");
    }
  }

  const filteredItems = items.filter((item) =>
    filter === "toTake" ? !item.checked : item.checked
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color="#1D4ED8" />
        </TouchableOpacity>
        <Text style={styles.title}>{params.name}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.topRow}>
        <View style={styles.filterBox}>
          <TouchableOpacity
            onPress={() => setFilter("toTake")}
            style={[
              styles.filterButton,
              filter === "toTake" && styles.filterButtonActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === "toTake" && styles.filterTextActive,
              ]}
            >
              A pegar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilter("alreadyTaken")}
            style={[
              styles.filterButton,
              filter === "alreadyTaken" && styles.filterButtonActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === "alreadyTaken" && styles.filterTextActive,
              ]}
            >
              Já pego
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={confirmClearAll}
          style={styles.clearAllButton}
        >
          <MaterialIcons name="delete-outline" size={22} color="#B91C1C" />
          <Text style={styles.clearAllText}>Limpar tudo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={styles.itemList}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhum item nesta categoria.</Text>
        }
        renderItem={({ item }) => {
          const taken = item.checked;
          return (
            <View
              style={[
                styles.itemRow,
                taken ? styles.itemTaken : styles.itemToTake,
              ]}
            >
              <TouchableOpacity
                style={styles.itemContent}
                onPress={() => toggleItemStatus(item.id)}
              >
                <Text style={[styles.itemText, taken && styles.itemTextTaken]}>
                  {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                </Text>
                <Text style={styles.itemStatusLabel}>
                  {taken ? "Já pego" : "A pegar"}
                </Text>
              </TouchableOpacity>

              <View style={styles.itemActions}>
                <TouchableOpacity
                  onPress={() => toggleItemStatus(item.id)}
                  style={styles.iconButton}
                >
                  <MaterialIcons
                    name={taken ? "undo" : "check"}
                    size={20}
                    color={taken ? "#065F46" : "#1D4ED8"}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => confirmRemoveItem(item.id)}
                  style={styles.iconButton}
                >
                  <MaterialIcons name="delete" size={20} color="#B91C1C" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowItemSelector(true)}
      >
        <MaterialIcons name="add" size={24} color="#fff" />
        <Text style={styles.addButtonText}>Adicionar Item</Text>
      </TouchableOpacity>

      <Modal
        visible={showItemSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowItemSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Item</Text>
              <TouchableOpacity
                onPress={() => setShowItemSelector(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={availableItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isAlreadyAdded = items.some(
                  (listItem) =>
                    listItem.name.toLowerCase() === item.name.toLowerCase()
                );

                return (
                  <TouchableOpacity
                    style={[
                      styles.itemOption,
                      isAlreadyAdded && styles.itemOptionDisabled,
                    ]}
                    onPress={() => !isAlreadyAdded && addItem(item.name)}
                    disabled={isAlreadyAdded}
                  >
                    <Text
                      style={[
                        styles.itemOptionText,
                        isAlreadyAdded && styles.itemOptionTextDisabled,
                      ]}
                    >
                      {item.name}
                    </Text>
                    {isAlreadyAdded && (
                      <MaterialIcons
                        name="check-circle"
                        size={20}
                        color="#9CA3AF"
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyModalText}>
                  Nenhum item disponível.
                </Text>
              }
              contentContainerStyle={styles.modalListContent}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    backgroundColor: "#FFF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },

  filterBox: {
    flexDirection: "row",
    gap: 12,
  },

  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  filterButtonActive: {
    backgroundColor: "#1D4ED8",
  },
  filterText: {
    fontSize: 15,
    color: "#374151",
  },
  filterTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },

  clearAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clearAllText: {
    color: "#B91C1C",
    fontWeight: "700",
  },

  itemList: {
    marginTop: 12,
    flex: 1,
  },

  emptyText: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 20,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  itemToTake: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#1D4ED8",
  },
  itemTaken: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#065F46",
  },

  itemContent: {
    flex: 1,
  },

  itemText: {
    fontSize: 16,
    color: "#111827",
  },
  itemTextTaken: {
    textDecorationLine: "line-through",
    color: "#065F46",
    fontWeight: "600",
  },

  itemStatusLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },

  itemActions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 12,
  },

  iconButton: {
    padding: 8,
  },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
  },

  addButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 20,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },

  closeButton: {
    padding: 4,
  },

  modalListContent: {
    padding: 16,
  },

  itemOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  itemOptionDisabled: {
    backgroundColor: "#F3F4F6",
    opacity: 0.6,
  },

  itemOptionText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },

  itemOptionTextDisabled: {
    color: "#9CA3AF",
  },

  emptyModalText: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 40,
    fontSize: 16,
  },

  backButton: {
    padding: 8,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
