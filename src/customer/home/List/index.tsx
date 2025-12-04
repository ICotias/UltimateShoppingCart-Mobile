import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Image,
} from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/routes";
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
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { db, auth } from "@/services/firebase";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { generatePixQrCode, checkPaymentStatus } from "@/services/mercadoPago";

type ListRouteProp = RouteProp<RootStackParamList, "List">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

type Item = {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  createdAt: any;
  price?: string;
  barCode?: string;
};

type Product = {
  id: string;
  name: string;
  price: string;
  barcode: string;
  stock: number;
};

type PaymentState = {
  qrCode: string | null;
  qrCodeBase64: string | null;
  transactionId: string | null;
  loading: boolean;
  error: string | null;
};

export default function ListScreen() {
  const { params } = useRoute<ListRouteProp>();
  const navigation = useNavigation<Nav>();

  const [user, setUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<"toTake" | "alreadyTaken">("toTake");
  const [items, setItems] = useState<Item[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(
    null
  );
  const [quantityInput, setQuantityInput] = useState("");
  const [paymentData, setPaymentData] = useState<PaymentState>({
    qrCode: null,
    qrCodeBase64: null,
    transactionId: null,
    loading: false,
    error: null,
  });

  // 1. Escutar Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setItems([]);
    });
    return unsubscribe;
  }, []);

  // 2. Configurar lastLoggedInUser para o ESP saber quem acompanhar
  useEffect(() => {
    async function setConfigForEsp() {
      if (!user || !params.id) return;
      try {
        const configRef = doc(db, "config", "lastLoggedInUser");
        await setDoc(
          configRef,
          {
            uid: user.uid,
            activeListId: params.id,
            displayName: params.name, // O ESP usa esse campo para mostrar na tela
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Erro ao atualizar config:", error);
      }
    }
    setConfigForEsp();
  }, [user, params.id, params.name]);

  // 3. Ler Items (Snapshot)
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
        price: doc.data().price || "0.00",
        barCode: doc.data().barCode || "", // Importante para o ESP
      }));
      setItems(data);
    });
    return unsubscribe;
  }, [user, params.id]);

  // 4. Ler Produtos Disponíveis
  useEffect(() => {
    const productsRef = collection(db, "products");
    const unsubscribe = onSnapshot(productsRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        price: doc.data().price || "0.00",
        barcode: doc.data().barcode || "",
        stock: doc.data().stock || 0,
      }));
      setAvailableProducts(data);
    });
    return unsubscribe;
  }, []);

  // 5. Sincronizar Lista para o formato que o ESP espera (toPick, picked, state)
  useEffect(() => {
    if (!user || !params.id) return;

    const syncEspFormat = async () => {
      const listRef = doc(db, "users", user.uid, "lists", params.id);

      // Monta arrays simplificados pro ESP
      const toPick = items
        .filter((i) => !i.checked)
        .map((i) => ({
          barCode: i.barCode || "",
          name: i.name,
          price: parseFloat(i.price || "0"),
          quantity: i.quantity,
        }));

      const picked = items
        .filter((i) => i.checked)
        .map((i) => ({
          barCode: i.barCode || "",
          name: i.name,
          price: parseFloat(i.price || "0"),
          quantity: i.quantity,
        }));

      // Define estado
      let state = "scanning";
      if (paymentConfirmed) state = "finished";
      else if (showPixModal) state = "paying";

      try {
        await setDoc(
          listRef,
          {
            state,
            toPick,
            picked,
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Erro ao sincronizar ESP:", error);
      }
    };

    syncEspFormat();
  }, [items, paymentConfirmed, showPixModal, user, params.id]);

  // Helpers
  async function updateListTimestamp() {
    if (!user || !params.id) return;
    const listRef = doc(db, "users", user.uid, "lists", params.id);
    await updateDoc(listRef, { updatedAt: serverTimestamp() });
  }

  // Adicionar Item
  async function addItem(productName: string) {
    if (!productName.trim() || !user || !params.id) return;

    const product = availableProducts.find((p) => p.name === productName);
    const itemExists = items.some(
      (i) => i.name.toLowerCase() === productName.toLowerCase()
    );

    if (itemExists) {
      Alert.alert("Item já existe", "Este item já está na sua lista.");
      return;
    }

    try {
      await addDoc(
        collection(db, "users", user.uid, "lists", params.id, "items"),
        {
          name: productName.trim(),
          quantity: 1,
          checked: false,
          price: product?.price || "0.00",
          barCode: product?.barcode || "", // Salva barcode pro ESP achar depois
          createdAt: serverTimestamp(),
        }
      );
      await updateListTimestamp();
      setShowItemSelector(false);
      setFilter("toTake");
    } catch (error: any) {
      console.log("Erro add item:", error.message);
      Alert.alert("Erro", "Não foi possível adicionar o item.");
    }
  }

  async function updateQuantity(id: string, newQuantity: number) {
    if (!user || !params.id || newQuantity < 1) return;
    try {
      await updateDoc(
        doc(db, "users", user.uid, "lists", params.id, "items", id),
        {
          quantity: newQuantity,
        }
      );
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro qtd:", error.message);
    }
  }

  async function toggleItemStatus(id: string) {
    if (!user || !params.id || paymentConfirmed) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      await updateDoc(
        doc(db, "users", user.uid, "lists", params.id, "items", id),
        {
          checked: !item.checked,
        }
      );
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro toggle:", error.message);
    }
  }

  function confirmRemoveItem(id: string) {
    if (paymentConfirmed) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    Alert.alert("Remover item", `Remover "${item.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => removeItem(id) },
    ]);
  }

  async function removeItem(id: string) {
    if (!user || !params.id) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "lists", params.id, "items", id)
      );
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro remove:", error.message);
    }
  }

  async function confirmClearAll() {
    if (items.length === 0 || paymentConfirmed) {
      Alert.alert("Nada para apagar", "A lista já está vazia ou finalizada.");
      return;
    }
    Alert.alert("Limpar tudo", "Remover todos os itens?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover tudo",
        style: "destructive",
        onPress: () => clearAllItems(),
      },
    ]);
  }

  async function clearAllItems() {
    if (!user || !params.id) return;
    try {
      const batch = writeBatch(db);
      items.forEach((item) => {
        const ref = doc(
          db,
          "users",
          user.uid,
          "lists",
          params.id,
          "items",
          item.id
        );
        batch.delete(ref);
      });
      await batch.commit();
      await updateListTimestamp();
      setPaymentConfirmed(false);
      setShowPixModal(false);
      setPaymentData({
        qrCode: null,
        qrCodeBase64: null,
        transactionId: null,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      console.log("Erro clear:", error.message);
    }
  }

  // Barcode Scanner do App (opcional, já que tem o ESP)
  const handleBarcodeScanned = (barcode: string, productName: string) => {
    console.log("App scan:", productName);
    setShowScanner(false);
  };

  // Calcular Totais
  const pegoItems = items.filter((item) => item.checked);
  const total = pegoItems.reduce((sum, item) => {
    const price = parseFloat(item.price || "0");
    return sum + price * item.quantity;
  }, 0);

  async function updateStockAfterPayment() {
    try {
      const batch = writeBatch(db);
      pegoItems.forEach((item) => {
        const product = availableProducts.find((p) => p.name === item.name);
        if (product) {
          const newStock = Math.max(0, product.stock - item.quantity);
          batch.update(doc(db, "products", product.id), { stock: newStock });
        }
      });
      await batch.commit();
    } catch (error: any) {
      console.log("Erro stock:", error.message);
    }
  }

  // Comprar / Gerar PIX
  async function handleBuyClick() {
    setPaymentData({ ...paymentData, loading: true, error: null });
    try {
      if (!user?.email) throw new Error("Email não encontrado");

      const itemNames = pegoItems.map((i) => i.name).join(", ");
      const pixData = await generatePixQrCode({
        amount: total,
        description: `Compra - ${itemNames.substring(0, 50)}`,
        email: user.email,
      });

      setPaymentData({
        qrCode: pixData.qrCode,
        qrCodeBase64: pixData.qrCodeBase64,
        transactionId: pixData.transactionId,
        loading: false,
        error: null,
      });
      setShowPixModal(true); // Isso vai disparar o useEffect para setar state="paying" pro ESP
    } catch (error: any) {
      setPaymentData({
        qrCode: null,
        qrCodeBase64: null,
        transactionId: null,
        loading: false,
        error: error.message,
      });
      Alert.alert("Erro", error.message);
    }
  }

  // Confirmar Pagamento
  async function confirmPayment() {
    if (!paymentData.transactionId) return;
    setPaymentData({ ...paymentData, loading: true });

    try {
      const status = await checkPaymentStatus(paymentData.transactionId);
      if (status === "approved") {
        setPaymentConfirmed(true); // Isso dispara o useEffect para setar state="finished" pro ESP
        await updateStockAfterPayment();
        Alert.alert(
          "Pagamento aprovado!",
          `Total: R$ ${total.toFixed(2).replace(".", ",")}`
        );
        setPaymentData({ ...paymentData, loading: false });
      } else if (status === "pending") {
        Alert.alert("Pendente", "Aguardando confirmação...");
        setPaymentData({ ...paymentData, loading: false });
      } else {
        Alert.alert("Não autorizado", "Tente novamente.");
        setPaymentData({ ...paymentData, loading: false });
      }
    } catch (error: any) {
      Alert.alert("Erro", "Falha ao verificar pagamento");
      setPaymentData({ ...paymentData, loading: false });
    }
  }

  // Logout
  async function handleLogout() {
    Alert.alert("Sair", "Fazer logout?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            // Limpa pro ESP saber que saiu
            await setDoc(
              doc(db, "config", "lastLoggedInUser"),
              {
                uid: null,
                activeListId: null,
                displayName: null,
              },
              { merge: true }
            );

            await signOut(auth);
            navigation.replace("Login");
          } catch (e) {
            Alert.alert("Erro", "Falha ao sair");
          }
        },
      },
    ]);
  }

  const filteredItems = items.filter((item) =>
    filter === "toTake" ? !item.checked : item.checked
  );

  if (showScanner) {
    return (
      user && (
        <BarcodeScanner
          onBarcodeScanned={handleBarcodeScanned}
          onClose={() => setShowScanner(false)}
          listId={params.id}
          userId={user.uid}
        />
      )
    );
  }

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
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <MaterialIcons name="logout" size={24} color="#B91C1C" />
        </TouchableOpacity>
      </View>

      {paymentConfirmed && (
        <View style={styles.historyBanner}>
          <MaterialIcons name="check-circle" size={24} color="#059669" />
          <Text style={styles.historyBannerText}>Compra Finalizada</Text>
        </View>
      )}

      <View style={styles.topRow}>
        <View style={styles.filterBox}>
          <TouchableOpacity
            onPress={() => setFilter("toTake")}
            style={[
              styles.filterButton,
              filter === "toTake" && styles.filterButtonActive,
            ]}
            disabled={paymentConfirmed}
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
            disabled={paymentConfirmed}
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
          style={[
            styles.clearAllButton,
            paymentConfirmed && styles.buttonDisabled,
          ]}
          disabled={paymentConfirmed}
        >
          <MaterialIcons
            name="delete-outline"
            size={22}
            color={paymentConfirmed ? "#CCC" : "#B91C1C"}
          />
          <Text
            style={[
              styles.clearAllText,
              paymentConfirmed && styles.textDisabled,
            ]}
          >
            Limpar
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={styles.itemList}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum item.</Text>}
        renderItem={({ item }) => {
          const taken = item.checked;
          return (
            <View
              style={[
                styles.itemRow,
                taken ? styles.itemTaken : styles.itemToTake,
                paymentConfirmed && styles.itemDisabled,
              ]}
            >
              <TouchableOpacity
                style={styles.itemContent}
                onPress={() => !paymentConfirmed && toggleItemStatus(item.id)}
                disabled={paymentConfirmed}
              >
                <Text style={[styles.itemText, taken && styles.itemTextTaken]}>
                  {item.name}
                </Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemPrice}>
                    R${" "}
                    {parseFloat(item.price || "0")
                      .toFixed(2)
                      .replace(".", ",")}
                  </Text>
                  <Text style={styles.itemStatusLabel}>
                    {taken ? "Já pego" : "A pegar"}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.itemActions}>
                <View
                  style={[
                    styles.quantityControl,
                    paymentConfirmed && styles.quantityControlDisabled,
                  ]}
                >
                  <TouchableOpacity
                    onPress={() =>
                      !paymentConfirmed &&
                      updateQuantity(item.id, Math.max(1, item.quantity - 1))
                    }
                    style={styles.quantityButton}
                    disabled={paymentConfirmed}
                  >
                    <Text style={styles.quantityButtonText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      !paymentConfirmed &&
                      (setEditingQuantityId(item.id),
                      setQuantityInput(item.quantity.toString()))
                    }
                    style={styles.quantityDisplay}
                    disabled={paymentConfirmed}
                  >
                    <Text style={styles.quantityText}>{item.quantity}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      !paymentConfirmed &&
                      updateQuantity(item.id, item.quantity + 1)
                    }
                    style={styles.quantityButton}
                    disabled={paymentConfirmed}
                  >
                    <Text style={styles.quantityButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => !paymentConfirmed && toggleItemStatus(item.id)}
                  style={styles.iconButton}
                  disabled={paymentConfirmed}
                >
                  <MaterialIcons
                    name={taken ? "undo" : "check"}
                    size={20}
                    color={
                      paymentConfirmed ? "#CCC" : taken ? "#065F46" : "#1D4ED8"
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    !paymentConfirmed && confirmRemoveItem(item.id)
                  }
                  style={styles.iconButton}
                  disabled={paymentConfirmed}
                >
                  <MaterialIcons
                    name="delete"
                    size={20}
                    color={paymentConfirmed ? "#CCC" : "#B91C1C"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {filter === "alreadyTaken" && pegoItems.length > 0 && (
        <View style={styles.checkoutContainer}>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              R$ {total.toFixed(2).replace(".", ",")}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.buyButton,
              paymentConfirmed && styles.buyButtonConfirmed,
            ]}
            onPress={handleBuyClick}
            disabled={paymentConfirmed || paymentData.loading}
          >
            {paymentData.loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buyButtonText}>
                {paymentConfirmed ? "✓ Comprado" : "Comprar"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {filter === "toTake" && !paymentConfirmed && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowItemSelector(true)}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setShowScanner(true)}
          >
            <MaterialIcons name="qr-code-scanner" size={24} color="#fff" />
            <Text style={styles.scanButtonText}>Escanear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal PIX */}
      <Modal
        visible={showPixModal}
        transparent
        animationType="fade"
        onRequestClose={() => !paymentConfirmed && setShowPixModal(false)}
      >
        <View style={styles.pixModalOverlay}>
          <View style={styles.pixModalContent}>
            <TouchableOpacity
              onPress={() => !paymentConfirmed && setShowPixModal(false)}
              style={styles.pixCloseButton}
              disabled={paymentConfirmed}
            >
              <MaterialIcons name="close" size={28} color="#1D4ED8" />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={styles.pixScrollContent}>
              <Text style={styles.pixTitle}>Comprovante</Text>
              <View style={styles.pixItemsSection}>
                <Text style={styles.pixSectionTitle}>Itens</Text>
                {pegoItems.map((item) => (
                  <View key={item.id} style={styles.pixItem}>
                    <View style={styles.pixItemInfo}>
                      <Text style={styles.pixItemName}>{item.name}</Text>
                      <Text style={styles.pixItemQty}>x {item.quantity}</Text>
                    </View>
                    <Text style={styles.pixItemTotal}>
                      R${" "}
                      {(parseFloat(item.price || "0") * item.quantity)
                        .toFixed(2)
                        .replace(".", ",")}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.pixDivider} />
              <View style={styles.pixTotalSection}>
                <Text style={styles.pixTotalLabel}>Total</Text>
                <Text style={styles.pixTotalAmount}>
                  R$ {total.toFixed(2).replace(".", ",")}
                </Text>
              </View>

              <View style={styles.pixQrSection}>
                {paymentData.qrCodeBase64 && !paymentData.loading ? (
                  <>
                    <View style={styles.pixQrBox}>
                      <Image
                        source={{
                          uri: `data:image/png;base64,${paymentData.qrCodeBase64}`,
                        }}
                        style={{ width: 200, height: 200 }}
                      />
                    </View>
                    <Text style={styles.pixQrCopyText}>
                      Escaneie com seu celular
                    </Text>
                  </>
                ) : (
                  <ActivityIndicator size="large" color="#1D4ED8" />
                )}
                {paymentData.error && (
                  <Text style={styles.pixErrorText}>{paymentData.error}</Text>
                )}
              </View>

              <View style={styles.pixButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.pixConfirmButton,
                    (paymentConfirmed || paymentData.loading) &&
                      styles.pixConfirmButtonConfirmed,
                  ]}
                  onPress={confirmPayment}
                  disabled={paymentConfirmed || paymentData.loading}
                >
                  {paymentData.loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.pixConfirmButtonText}>
                      {paymentConfirmed
                        ? "✓ Confirmado"
                        : "Confirmar Pagamento"}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.pixCancelButton,
                    paymentConfirmed && styles.pixCancelButtonDisabled,
                  ]}
                  onPress={() => !paymentConfirmed && setShowPixModal(false)}
                  disabled={paymentConfirmed}
                >
                  <Text
                    style={[
                      styles.pixCancelButtonText,
                      paymentConfirmed && styles.textDisabled,
                    ]}
                  >
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Add Item */}
      <Modal
        visible={showItemSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowItemSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar</Text>
              <TouchableOpacity
                onPress={() => setShowItemSelector(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableProducts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isAdded = items.some(
                  (i) => i.name.toLowerCase() === item.name.toLowerCase()
                );
                const isNoStock = item.stock === 0;
                return (
                  <TouchableOpacity
                    style={[
                      styles.itemOption,
                      (isAdded || isNoStock) && styles.itemOptionDisabled,
                    ]}
                    onPress={() => !isAdded && !isNoStock && addItem(item.name)}
                    disabled={isAdded || isNoStock}
                  >
                    <View style={styles.productInfo}>
                      <Text
                        style={[
                          styles.itemOptionText,
                          (isAdded || isNoStock) &&
                            styles.itemOptionTextDisabled,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.priceAndStockRow}>
                        <Text style={styles.priceText}>
                          R${" "}
                          {parseFloat(item.price || "0")
                            .toFixed(2)
                            .replace(".", ",")}
                        </Text>
                        <Text
                          style={[
                            styles.stockText,
                            isNoStock && styles.outOfStockText,
                          ]}
                        >
                          {isNoStock ? "Sem estoque" : `Estoque: ${item.stock}`}
                        </Text>
                      </View>
                    </View>
                    {isAdded && (
                      <MaterialIcons
                        name="check-circle"
                        size={20}
                        color="#9CA3AF"
                      />
                    )}
                    {isNoStock && (
                      <MaterialIcons name="block" size={20} color="#B91C1C" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Qtd */}
      <Modal
        visible={editingQuantityId !== null && !paymentConfirmed}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingQuantityId(null)}
      >
        <View style={styles.quantityModalOverlay}>
          <View style={styles.quantityModalContent}>
            <Text style={styles.quantityModalTitle}>Quantidade</Text>
            <TextInput
              style={styles.quantityModalInput}
              placeholder="Qtd"
              keyboardType="number-pad"
              value={quantityInput}
              onChangeText={setQuantityInput}
            />
            <View style={styles.quantityModalButtons}>
              <TouchableOpacity
                style={styles.quantityModalCancelButton}
                onPress={() => setEditingQuantityId(null)}
              >
                <Text style={styles.quantityModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quantityModalConfirmButton}
                onPress={() => {
                  const qty = parseInt(quantityInput, 10);
                  if (qty > 0 && editingQuantityId) {
                    updateQuantity(editingQuantityId, qty);
                    setEditingQuantityId(null);
                  }
                }}
              >
                <Text style={styles.quantityModalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 80, backgroundColor: "#FFF" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: "700", flex: 1, textAlign: "center" },
  logoutButton: { padding: 8 },
  backButton: { padding: 8 },
  historyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    borderColor: "#065F46",
    borderWidth: 1,
    marginBottom: 12,
  },
  historyBannerText: { fontSize: 14, fontWeight: "700", color: "#065F46" },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  filterBox: { flexDirection: "row", gap: 12 },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  filterButtonActive: { backgroundColor: "#1D4ED8" },
  filterText: { fontSize: 15, color: "#374151" },
  filterTextActive: { color: "#FFF", fontWeight: "700" },
  clearAllButton: { flexDirection: "row", alignItems: "center", gap: 8 },
  clearAllText: { color: "#B91C1C", fontWeight: "700" },
  buttonDisabled: { opacity: 0.5 },
  textDisabled: { color: "#9CA3AF" },
  itemList: { marginTop: 12, flex: 1 },
  emptyText: { textAlign: "center", color: "#6B7280", marginTop: 20 },
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
  itemDisabled: { opacity: 0.6, backgroundColor: "#F9FAFB" },
  itemContent: { flex: 1 },
  itemText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  itemTextTaken: { textDecorationLine: "line-through", color: "#065F46" },
  itemDetails: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemPrice: { fontSize: 14, color: "#059669", fontWeight: "600" },
  itemStatusLabel: { fontSize: 12, color: "#6B7280" },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    padding: 4,
  },
  quantityControlDisabled: { opacity: 0.5 },
  quantityButton: {
    width: 24,
    height: 24,
    backgroundColor: "#1D4ED8",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  quantityDisplay: { width: 30, alignItems: "center" },
  quantityText: { fontWeight: "700" },
  iconButton: { padding: 8 },
  buttonContainer: { flexDirection: "row", gap: 12, marginTop: 12 },
  addButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
  },
  addButtonText: { color: "#FFF", fontWeight: "700" },
  scanButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    backgroundColor: "#059669",
    borderRadius: 8,
  },
  scanButtonText: { color: "#FFF", fontWeight: "700" },
  checkoutContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  totalLabel: { fontSize: 18, fontWeight: "700" },
  totalValue: { fontSize: 24, fontWeight: "700", color: "#059669" },
  buyButton: {
    padding: 14,
    backgroundColor: "#059669",
    borderRadius: 8,
    alignItems: "center",
  },
  buyButtonConfirmed: { backgroundColor: "#9CA3AF" },
  buyButtonText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  pixModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  pixModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: 20,
  },
  pixCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 10,
  },
  pixScrollContent: { padding: 20, paddingTop: 40 },
  pixTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  pixItemsSection: { marginBottom: 16 },
  pixSectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  pixItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
  },
  pixItemInfo: { flex: 1 },
  pixItemName: { fontSize: 14, fontWeight: "600" },
  pixItemQty: { fontSize: 12, color: "#6B7280" },
  pixItemTotal: { fontSize: 14, fontWeight: "700", color: "#059669" },
  pixDivider: { height: 2, backgroundColor: "#E5E7EB", marginVertical: 12 },
  pixTotalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pixTotalLabel: { fontSize: 16, fontWeight: "700" },
  pixTotalAmount: { fontSize: 20, fontWeight: "700", color: "#059669" },
  pixQrSection: { alignItems: "center", marginVertical: 24 },
  pixQrBox: {
    width: 200,
    height: 200,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  pixQrCopyText: { marginTop: 12, color: "#6B7280" },
  pixErrorText: { marginTop: 12, color: "#B91C1C" },
  pixButtonsContainer: { marginTop: 20, gap: 12 },
  pixConfirmButton: {
    padding: 12,
    backgroundColor: "#059669",
    borderRadius: 8,
    alignItems: "center",
  },
  pixConfirmButtonConfirmed: { backgroundColor: "#9CA3AF" },
  pixConfirmButtonText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  pixCancelButton: {
    padding: 12,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    alignItems: "center",
  },
  pixCancelButtonDisabled: { opacity: 0.5 },
  pixCancelButtonText: { fontWeight: "700" },
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
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  closeButton: { padding: 4 },
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
  itemOptionDisabled: { backgroundColor: "#F3F4F6", opacity: 0.6 },
  productInfo: { flex: 1 },
  itemOptionText: { fontSize: 16, fontWeight: "500" },
  itemOptionTextDisabled: { color: "#9CA3AF" },
  priceAndStockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  priceText: { color: "#6B7280" },
  stockText: { color: "#059669", fontWeight: "600" },
  outOfStockText: { color: "#B91C1C" },
  quantityModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityModalContent: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    width: "80%",
  },
  quantityModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  quantityModalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  quantityModalButtons: { flexDirection: "row", gap: 12 },
  quantityModalCancelButton: {
    flex: 1,
    padding: 10,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    alignItems: "center",
  },
  quantityModalCancelText: { fontWeight: "700" },
  quantityModalConfirmButton: {
    flex: 1,
    padding: 10,
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    alignItems: "center",
  },
  quantityModalConfirmText: { color: "#FFF", fontWeight: "700" },
});
