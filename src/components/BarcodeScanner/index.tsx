// src/components/BarcodeScanner/index.tsx
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialIcons } from "@expo/vector-icons";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase";

type Props = {
  onBarcodeScanned: (barcode: string, productName: string) => void;
  onClose: () => void;
  listId: string;
  userId: string;
};

export function BarcodeScanner({
  onBarcodeScanned,
  onClose,
  listId,
  userId,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const cameraRef = useRef(null);
  const insets = useSafeAreaInsets();

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Precisa de permissão de câmera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Processa o barcode (automático ou manual)
  const processBarcode = async (barcode: string) => {
    setLoading(true);
    console.log("Processando barcode:", barcode);

    const timeoutId = setTimeout(() => {
      console.log("Timeout: processamento levou mais de 60s");
      setLoading(false);
      setScanned(false);
      Alert.alert(
        "Tempo excedido",
        "Não foi possível processar o código em 60 segundos. Tente novamente."
      );
      onClose();
    }, 60000);

    try {
      // 1. Buscar produto em Firestore
      const productRef = doc(db, "products", barcode);
      const productSnap = await getDoc(productRef);

      if (!productSnap.exists()) {
        clearTimeout(timeoutId);
        Alert.alert(
          "Produto não encontrado",
          `O código ${barcode} não foi cadastrado no sistema.`
        );
        setLoading(false);
        setScanned(false);
        return;
      }

      const product = productSnap.data();
      const productName = product.name;

      // 2. Buscar item na lista com esse nome
      const itemsRef = collection(
        db,
        "users",
        userId,
        "lists",
        listId,
        "items"
      );

      const q = query(itemsRef, where("name", "==", productName));

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        clearTimeout(timeoutId);
        Alert.alert(
          "Item não está na lista",
          `"${productName}" não foi encontrado na sua lista de compras.`
        );
        setLoading(false);
        setScanned(false);
        return;
      }

      // 3. Marcar item como "Pego"
      const itemDoc = querySnapshot.docs[0];
      const itemRef = doc(
        db,
        "users",
        userId,
        "lists",
        listId,
        "items",
        itemDoc.id
      );

      await updateDoc(itemRef, {
        checked: true,
      });

      clearTimeout(timeoutId);
      onBarcodeScanned(barcode, productName);
      Alert.alert(
        "✓ Marcado como pego!",
        `"${productName}" foi movido para "Pego".`
      );
      setLoading(false);
      setScanned(false);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Erro ao processar barcode:", error);
      Alert.alert(
        "Erro",
        "Ocorreu um erro ao processar o código. Tente novamente."
      );
      setLoading(false);
      setScanned(false);
    }
  };

  // Leitura automática pela câmera
  const handleBarcodeScanned = async ({ data }: any) => {
    if (scanned || loading) return;
    setScanned(true);
    await processBarcode(data);
  };

  // Envio manual
  async function handleManualSend() {
    if (!manualCode.trim() || loading || manualLoading) return;
    setManualLoading(true);
    await processBarcode(manualCode);
    setManualCode("");
    setManualLoading(false);
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        onBarcodeScanned={scanned || loading ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "code128", "code39"],
        }}
      />

      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={10}
          >
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Escanear Código</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.scannerFrame} />

        <View style={styles.footer}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color="#1D4ED8" />
              <Text style={styles.footerText}>Processando leitura...</Text>
            </>
          ) : (
            <>
              <Text style={styles.footerText}>
                Aponte a câmera para o código de barras
              </Text>

              <Text style={styles.footerTextSecondary}>
                ou digite o código:
              </Text>

              <View style={styles.manualRow}>
                <TextInput
                  style={styles.manualInput}
                  placeholder="Digite o código"
                  placeholderTextColor="#9CA3AF"
                  value={manualCode}
                  onChangeText={setManualCode}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={styles.manualButton}
                  onPress={handleManualSend}
                  disabled={manualLoading || !manualCode.trim()}
                >
                  {manualLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.manualButtonText}>Enviar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  closeButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerFrame: {
    width: 300,
    height: 90,
    borderWidth: 3,
    borderColor: "#1D4ED8",
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  footer: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  footerText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  footerTextSecondary: {
    color: "#d1d5db",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  manualButton: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1D4ED8",
    justifyContent: "center",
    alignItems: "center",
  },
  manualButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  button: {
    backgroundColor: "#1D4ED8",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  text: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
  },
});
