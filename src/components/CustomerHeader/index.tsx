// src/components/Header.tsx
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/routes";
import { auth, db } from "@/services/firebase";

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Props = {
  onPress: () => void;
};

export function CustomerHeader({ onPress }: Props) {
  const navigation = useNavigation<Nav>();
  const [userName, setUserName] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);

  // Escutar mudanças no estado de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserName("");
        // Navegar para Login quando o usuário fizer logout
        navigation.navigate("Login");
      }
    });

    return unsubscribe;
  }, [navigation]);

  // Carregar nome do usuário do Firestore
  useEffect(() => {
    if (!user) {
      setUserName("");
      return;
    }

    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setUserName(data.name || "");
      } else {
        setUserName("");
      }
    });

    return unsubscribe;
  }, [user]);

  async function handleLogout() {
    Alert.alert(
      "Sair",
      "Tem certeza que deseja sair?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
            } catch (error: any) {
              console.log("Erro ao fazer logout:", error.message);
              Alert.alert("Erro", "Não foi possível fazer logout.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  // Limitar nome a 10 caracteres
  const displayName = userName
    ? userName.length > 10
      ? userName.substring(0, 10) + "..."
      : userName
    : "Usuário";

  return (
    <View style={styles.container}>
      <View style={styles.welcomeRow}>
        <Text style={styles.welcome}>Olá, {displayName}!</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={20} color="#B91C1C" />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <View style={styles.iconContainer}>
          <MaterialIcons name="add-shopping-cart" size={32} color="#fff" />
        </View>

        <View>
          <Text style={styles.title}>SuperMercado</Text>
          <Text style={styles.title}>Online</Text>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={onPress}>
          <MaterialIcons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
    marginTop: 30,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    position: "relative",
  },
  welcome: {
    textAlign: "center",
    fontSize: 16,
  },
  logoutButton: {
    position: "absolute",
    right: 0,
    padding: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "blue",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  addButton: {
    marginLeft: "auto",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "blue",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 28,
  },
});
