import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/services/firebase";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/routes";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState({
    email: "",
    password: "",
    general: "",
  });

  function validate() {
    let valid = true;
    let newErrors = { email: "", password: "", general: "" };

    if (!email.includes("@")) {
      newErrors.email = "Informe um e-mail válido.";
      valid = false;
    }

    if (password.length < 6) {
      newErrors.password = "A senha deve ter no mínimo 6 caracteres.";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  }

  async function handleLogin() {
    if (!validate()) return;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigation.navigate("Home");
    } catch (error: any) {
      setErrors((prev) => ({
        ...prev,
        general: "Credenciais inválidas. Verifique e tente novamente.",
      }));
    }
  }

  return (
    <View style={styles.container}>
      <Ionicons
        name="cart-outline"
        size={58}
        color="#0F265C"
        style={{ marginBottom: 12 }}
      />
      <Text style={styles.title}>SuperMercado Online</Text>
      <Text style={styles.subtitle}>Entrar</Text>

      {errors.general ? (
        <Text style={styles.errorGeneral}>{errors.general}</Text>
      ) : null}

      <View
        style={[styles.inputContainer, errors.email ? styles.inputError : null]}
      >
        <Ionicons name="mail-outline" size={22} color="#0F265C" />
        <TextInput
          placeholder="E-mail"
          placeholderTextColor="#7D8DA6"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setErrors((prev) => ({ ...prev, email: "" }));
          }}
          style={styles.input}
        />
      </View>
      {errors.email ? (
        <Text style={styles.errorText}>{errors.email}</Text>
      ) : null}

      <View
        style={[
          styles.inputContainer,
          errors.password ? styles.inputError : null,
        ]}
      >
        <Ionicons name="lock-closed-outline" size={22} color="#0F265C" />
        <TextInput
          placeholder="Senha"
          placeholderTextColor="#7D8DA6"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setErrors((prev) => ({ ...prev, password: "" }));
          }}
          style={styles.input}
        />
        <Pressable
          onPress={() => setShowPassword((prev) => !prev)}
          style={styles.eyeButton}
          hitSlop={10}
        >
          <Ionicons
            name={showPassword ? "eye-outline" : "eye-off-outline"}
            size={26}
            color="#0F265C"
          />
        </Pressable>
      </View>
      {errors.password ? (
        <Text style={styles.errorText}>{errors.password}</Text>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Entrar</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Não tem uma conta?{" "}
        <Text
          style={styles.footerLink}
          onPress={() => navigation.navigate("Register")}
        >
          Criar conta
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  title: { fontSize: 22, fontWeight: "700", color: "#0F265C" },
  subtitle: { fontSize: 28, fontWeight: "700", color: "#0F265C", marginTop: 4 },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.4,
    borderColor: "#1F5FBF",
    paddingHorizontal: 16,
    borderRadius: 14,
    height: 56,
    width: "100%",
    marginTop: 14,
  },

  input: { flex: 1, marginLeft: 12, fontSize: 16, color: "#0F265C" },

  eyeButton: {
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingLeft: 8,
  },

  inputError: {
    borderColor: "#D32F2F",
  },

  errorText: {
    width: "100%",
    color: "#D32F2F",
    marginTop: 4,
    marginLeft: 4,
    fontSize: 13,
  },

  errorGeneral: {
    color: "#D32F2F",
    fontSize: 15,
    marginBottom: 10,
    textAlign: "center",
  },

  button: {
    width: "100%",
    backgroundColor: "#1F5FBF",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 20,
    alignItems: "center",
  },

  buttonText: { color: "#FFF", fontSize: 18, fontWeight: "700" },

  footer: { marginTop: 20, color: "#7D8DA6", fontSize: 16 },
  footerLink: { color: "#1F5FBF", fontSize: 16, fontWeight: "700" },
});
