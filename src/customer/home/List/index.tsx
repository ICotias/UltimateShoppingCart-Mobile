import React, { useState, useRef, useEffect } from "react";
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
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
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

  // Escutar mudanças no estado de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setItems([]);
      }
    });

    return unsubscribe;
  }, []);

  // Carregar itens da lista do usuário
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
      }));
      setItems(data);
    });

    return unsubscribe;
  }, [user, params.id]);

  // Carregar produtos da coleção "products"
  useEffect(() => {
    const productsRef = collection(db, "products");

    const unsubscribe = onSnapshot(productsRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        price: doc.data().price || "0.00",
        barcode: doc.data().barcode,
        stock: doc.data().stock || 0,
      }));
      setAvailableProducts(data);
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

  // Adicionar item usando o nome do produto
  async function addItem(productName: string) {
    if (!productName.trim() || !user || !params.id) return;

    const product = availableProducts.find((p) => p.name === productName);
    const itemExists = items.some(
      (item) => item.name.toLowerCase() === productName.toLowerCase()
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

  async function updateQuantity(id: string, newQuantity: number) {
    if (!user || !params.id || newQuantity < 1) return;

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
        quantity: newQuantity,
      });
      await updateListTimestamp();
    } catch (error: any) {
      console.log("Erro ao atualizar quantidade:", error.message);
      Alert.alert("Erro", "Não foi possível atualizar a quantidade.");
    }
  }

  async function toggleItemStatus(id: string) {
    if (!user || !params.id || paymentConfirmed) return;

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
    if (paymentConfirmed) return;

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
    if (items.length === 0 || paymentConfirmed) {
      Alert.alert("Nada para apagar", "A lista já está vazia ou finalizada.");
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
      console.log("Erro ao limpar itens:", error.message);
      Alert.alert("Erro", "Não foi possível limpar os itens.");
    }
  }

  // Handler para quando escaneia um código de barras
  const handleBarcodeScanned = (barcode: string, productName: string) => {
    console.log("Produto escaneado e marcado como pego:", productName);
    setShowScanner(false);
  };

  // Calcular total dos itens "Pego"
  const pegoItems = items.filter((item) => item.checked);
  const total = pegoItems.reduce((sum, item) => {
    const price = parseFloat(item.price || "0");
    return sum + price * item.quantity;
  }, 0);

  // Atualizar stock após confirmação de pagamento
  async function updateStockAfterPayment() {
    try {
      const batch = writeBatch(db);

      pegoItems.forEach((item) => {
        const product = availableProducts.find((p) => p.name === item.name);

        if (product) {
          const productRef = doc(db, "products", product.id);
          const newStock = Math.max(0, product.stock - item.quantity);
          batch.update(productRef, {
            stock: newStock,
          });
        }
      });

      await batch.commit();
    } catch (error: any) {
      console.log("Erro ao atualizar stock:", error.message);
    }
  }

  // Gerar QR Code PIX
  async function handleBuyClick() {
    setPaymentData({ ...paymentData, loading: true, error: null });

    try {
      if (!user?.email) {
        throw new Error("Email do usuário não encontrado");
      }

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

      setShowPixModal(true);
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

  // Confirmar pagamento
  async function confirmPayment() {
    if (!paymentData.transactionId) return;

    setPaymentData({ ...paymentData, loading: true });

    try {
      const status = await checkPaymentStatus(paymentData.transactionId);

      if (status === "approved") {
        setPaymentConfirmed(true);
        await updateStockAfterPayment();
        Alert.alert(
          "Pagamento aprovado!",
          `Total: R$ ${total.toFixed(2).replace(".", ",")}`
        );
        setPaymentData({ ...paymentData, loading: false });
      } else if (status === "pending") {
        Alert.alert("Pagamento pendente", "Aguardando confirmação...");
        setPaymentData({ ...paymentData, loading: false });
      } else {
        Alert.alert("Pagamento não autorizado", "Tente novamente.");
        setPaymentData({ ...paymentData, loading: false });
      }
    } catch (error: any) {
      Alert.alert("Erro", "Não foi possível verificar o pagamento");
      setPaymentData({ ...paymentData, loading: false });
    }
  }

  const filteredItems = items.filter((item) =>
    filter === "toTake" ? !item.checked : item.checked
  );

  // Se scanner está aberto, mostra o scanner
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
        <View style={styles.placeholder} />
      </View>

      {/* Se pagamento confirmado, mostrar "HISTÓRICO" */}
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
              paymentConfirmed && styles.filterButtonDisabled,
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
              paymentConfirmed && styles.filterButtonDisabled,
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
            Limpar tudo
          </Text>
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
                {/* Quantidade */}
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
                    onPress={() => {
                      if (!paymentConfirmed) {
                        setEditingQuantityId(item.id);
                        setQuantityInput(item.quantity.toString());
                      }
                    }}
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

                {/* Ações */}
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

      {/* Mostrar total e botões APENAS quando filtro = "Já pego" e houver itens (e não está confirmado) */}
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

      {/* Se filtro = "A pegar", mostrar botões normais (se não confirmado) */}
      {filter === "toTake" && !paymentConfirmed && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowItemSelector(true)}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Adicionar Item</Text>
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
              <Text style={styles.pixTitle}>Comprovante de Compra</Text>

              {/* Resumo dos itens */}
              <View style={styles.pixItemsSection}>
                <Text style={styles.pixSectionTitle}>Itens</Text>
                {pegoItems.map((item) => (
                  <View key={item.id} style={styles.pixItem}>
                    <View style={styles.pixItemInfo}>
                      <Text style={styles.pixItemName}>{item.name}</Text>
                      <Text style={styles.pixItemQty}>
                        Quantidade: {item.quantity}
                      </Text>
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

              {/* Divisor */}
              <View style={styles.pixDivider} />

              {/* Total */}
              <View style={styles.pixTotalSection}>
                <Text style={styles.pixTotalLabel}>Total</Text>
                <Text style={styles.pixTotalAmount}>
                  R$ {total.toFixed(2).replace(".", ",")}
                </Text>
              </View>

              {/* QR Code PIX */}
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
                  <View style={styles.pixQrBox}>
                    <ActivityIndicator size="large" color="#1D4ED8" />
                  </View>
                )}
                {paymentData.error && (
                  <Text style={styles.pixErrorText}>{paymentData.error}</Text>
                )}
              </View>

              {/* Instruções */}
              <View style={styles.pixInstructions}>
                <Text style={styles.pixInstructionsTitle}>Como pagar:</Text>
                <Text style={styles.pixInstructionsText}>
                  1. Abra seu app do banco{"\n"}
                  2. Acesse PIX{"\n"}
                  3. Escaneie o QR Code acima{"\n"}
                  4. Confirme o pagamento
                </Text>
              </View>

              {/* Botões de ação */}
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
                        ? "✓ Pagamento Confirmado"
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

      {/* Modal de Seleção de Produtos */}
      <Modal
        visible={showItemSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowItemSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Produto</Text>
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
                const isAlreadyAdded = items.some(
                  (listItem) =>
                    listItem.name.toLowerCase() === item.name.toLowerCase()
                );
                const isOutOfStock = item.stock === 0;

                return (
                  <TouchableOpacity
                    style={[
                      styles.itemOption,
                      (isAlreadyAdded || isOutOfStock) &&
                        styles.itemOptionDisabled,
                    ]}
                    onPress={() =>
                      !isAlreadyAdded && !isOutOfStock && addItem(item.name)
                    }
                    disabled={isAlreadyAdded || isOutOfStock}
                  >
                    <View style={styles.productInfo}>
                      <Text
                        style={[
                          styles.itemOptionText,
                          (isAlreadyAdded || isOutOfStock) &&
                            styles.itemOptionTextDisabled,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.priceAndStockRow}>
                        <Text
                          style={[
                            styles.priceText,
                            (isAlreadyAdded || isOutOfStock) &&
                              styles.itemOptionTextDisabled,
                          ]}
                        >
                          R${" "}
                          {parseFloat(item.price || "0")
                            .toFixed(2)
                            .replace(".", ",")}
                        </Text>
                        <Text
                          style={[
                            styles.stockText,
                            isOutOfStock && styles.outOfStockText,
                          ]}
                        >
                          {isOutOfStock
                            ? "Fora de estoque"
                            : `Estoque: ${item.stock}`}
                        </Text>
                      </View>
                    </View>
                    {isAlreadyAdded && (
                      <MaterialIcons
                        name="check-circle"
                        size={20}
                        color="#9CA3AF"
                      />
                    )}
                    {isOutOfStock && (
                      <MaterialIcons name="block" size={20} color="#B91C1C" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyModalText}>
                  Nenhum produto disponível.
                </Text>
              }
              contentContainerStyle={styles.modalListContent}
            />
          </View>
        </View>
      </Modal>

      {/* Modal de Edição de Quantidade */}
      <Modal
        visible={editingQuantityId !== null && !paymentConfirmed}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingQuantityId(null)}
      >
        <View style={styles.quantityModalOverlay}>
          <View style={styles.quantityModalContent}>
            <Text style={styles.quantityModalTitle}>Alterar Quantidade</Text>
            <TextInput
              style={styles.quantityModalInput}
              placeholder="Digite a quantidade"
              placeholderTextColor="#9CA3AF"
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
                  const newQty = parseInt(quantityInput, 10);
                  if (newQty > 0 && editingQuantityId) {
                    updateQuantity(editingQuantityId, newQty);
                    setEditingQuantityId(null);
                  } else {
                    Alert.alert("Erro", "Digite uma quantidade válida.");
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
  historyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#065F46",
    marginBottom: 12,
  },
  historyBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#065F46",
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
  filterButtonDisabled: {
    backgroundColor: "#F3F4F6",
    opacity: 0.5,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  clearAllText: {
    color: "#B91C1C",
    fontWeight: "700",
  },
  textDisabled: {
    color: "#9CA3AF",
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
  itemDisabled: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    opacity: 0.6,
  },
  itemContent: {
    flex: 1,
  },
  itemText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "600",
  },
  itemTextTaken: {
    textDecorationLine: "line-through",
    color: "#065F46",
  },
  itemDetails: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemPrice: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "600",
  },
  itemStatusLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
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
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  quantityControlDisabled: {
    backgroundColor: "#F3F4F6",
    opacity: 0.5,
  },
  quantityButton: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#1D4ED8",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  quantityDisplay: {
    width: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  iconButton: {
    padding: 8,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  addButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
  scanButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#059669",
    borderRadius: 8,
  },
  scanButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  checkoutContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#059669",
  },
  buyButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#059669",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buyButtonConfirmed: {
    backgroundColor: "#9CA3AF",
  },
  buyButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
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
    zIndex: 10,
    padding: 8,
  },
  pixScrollContent: {
    padding: 20,
    paddingTop: 40,
  },
  pixTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  pixItemsSection: {
    marginBottom: 16,
  },
  pixSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  pixItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pixItemInfo: {
    flex: 1,
  },
  pixItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  pixItemQty: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  pixItemTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
  },
  pixDivider: {
    height: 2,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  pixTotalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 16,
  },
  pixTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  pixTotalAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#059669",
  },
  pixQrSection: {
    alignItems: "center",
    marginVertical: 24,
  },
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
  pixQrCopyText: {
    marginTop: 12,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  pixErrorText: {
    marginTop: 12,
    fontSize: 12,
    color: "#B91C1C",
    textAlign: "center",
  },
  pixInstructions: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 16,
    marginVertical: 16,
  },
  pixInstructionsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  pixInstructionsText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
  pixButtonsContainer: {
    marginTop: 20,
    gap: 12,
  },
  pixConfirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#059669",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  pixConfirmButtonConfirmed: {
    backgroundColor: "#9CA3AF",
  },
  pixConfirmButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  pixCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  pixCancelButtonDisabled: {
    backgroundColor: "#F3F4F6",
    opacity: 0.5,
  },
  pixCancelButtonText: {
    color: "#111827",
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
  productInfo: {
    flex: 1,
  },
  itemOptionText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  priceAndStockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  priceText: {
    fontSize: 14,
    color: "#6B7280",
  },
  stockText: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
  },
  outOfStockText: {
    color: "#B91C1C",
    fontWeight: "700",
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
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  quantityModalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    marginBottom: 16,
  },
  quantityModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  quantityModalCancelButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityModalCancelText: {
    color: "#111827",
    fontWeight: "700",
  },
  quantityModalConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityModalConfirmText: {
    color: "#FFF",
    fontWeight: "700",
  },
  backButton: {
    padding: 8,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
