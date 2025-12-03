// src/customer/home/index.tsx
import {
  View,
  StyleSheet,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useState, useEffect } from "react";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ListSection } from "@/components/ListSection";

import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { db, auth } from "@/services/firebase";

type List = {
  id: string;
  name: string;
};

export function HomeScreen() {
  const [lists, setLists] = useState<List[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [user, setUser] = useState<User | null>(null);

  // Escutar mudanças no estado de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Limpar listas quando o usuário fizer logout
      if (!currentUser) {
        setLists([]);
      }
    });

    return unsubscribe;
  }, []);

  // 1) Carregar listas do usuário logado
  useEffect(() => {
    if (!user) return;

    const colRef = collection(db, "users", user.uid, "lists");

    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id, // Firestore ID (string)
        name: doc.data().name,
      }));

      setLists(data);
    });

    return unsubscribe;
  }, [user]);

  // 2) Criar nova lista no Firestore (por usuário)
  async function handleSaveList() {
    if (!newListName.trim() || !user) return;

    await addDoc(collection(db, "users", user.uid, "lists"), {
      name: newListName.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setNewListName("");
    setModalVisible(false);
  }

  // 3) Remover lista do Firestore (por usuário)
  async function handleRemoveList(listId: string) {
    if (!user) return;

    Alert.alert(
      "Remover lista",
      "Tem certeza de que deseja remover esta lista? Todos os itens contidos também serão apagados.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            const ref = doc(db, "users", user.uid, "lists", listId);
            await deleteDoc(ref);
            // Como usamos onSnapshot, a UI será sincronizada automaticamente
          },
        },
      ]
    );
  }

  // 4) Remover todas as listas do Firestore
  async function handleRemoveAllLists() {
    if (!user || lists.length === 0) return;

    Alert.alert(
      "Remover todas as listas",
      `Tem certeza de que deseja remover todas as ${lists.length} listas? Todos os itens contidos também serão apagados. Esta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover tudo",
          style: "destructive",
          onPress: async () => {
            try {
              const batch = writeBatch(db);
              lists.forEach((list) => {
                const ref = doc(db, "users", user.uid, "lists", list.id);
                batch.delete(ref);
              });
              await batch.commit();
            } catch (error: any) {
              console.log("Erro ao remover listas:", error.message);
              Alert.alert("Erro", "Não foi possível remover todas as listas.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  return (
    <View style={styles.container}>
      <CustomerHeader onPress={() => setModalVisible(true)} />

      <View style={styles.section}>
        <ListSection
          lists={lists}
          onRemoveList={handleRemoveList}
          onRemoveAllLists={handleRemoveAllLists}
        />
      </View>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Criar Nova Lista</Text>

            <TextInput
              style={styles.input}
              placeholder="Nome da lista"
              value={newListName}
              onChangeText={setNewListName}
            />

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSaveList}
              >
                <Text style={styles.buttonText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  section: { marginTop: 24, flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  actions: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  cancelButton: {
    backgroundColor: "#9CA3AF",
  },
  saveButton: {
    backgroundColor: "#1D4ED8",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
});
