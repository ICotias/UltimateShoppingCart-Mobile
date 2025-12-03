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
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/routes";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    general: "",
  });

  function validate() {
    let valid = true;
    let newErrors = {
      email: "",
      password: "",
      confirmPassword: "",
      general: "",
    };

    if (!email.includes("@")) {
      newErrors.email = "Informe um e-mail válido.";
      valid = false;
    }

    if (password.length < 6) {
      newErrors.password = "A senha deve ter no mínimo 6 caracteres.";
      valid = false;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "As senhas não coincidem.";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  }

  async function handleRegister() {
    if (!validate()) return;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Salvar nome do usuário no Firestore
      if (userCredential.user && name.trim()) {
        await setDoc(doc(db, "users", userCredential.user.uid), {
          name: name.trim(),
          email: email,
        });
      }

      navigation.navigate("Home");
    } catch (err: any) {
      // Firebase error messages are technical, give user-friendly errors
      setErrors((prev) => ({
        ...prev,
        general:
          err?.code === "auth/email-already-in-use"
            ? "Já existe uma conta com esse e-mail."
            : err?.code === "auth/invalid-email"
            ? "E-mail inválido."
            : "Erro ao registrar. Tente novamente.",
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
      <Text style={styles.subtitle}>Criar uma conta</Text>

      <Text style={styles.description}>
        Preencha seus dados abaixo
        {"\n"}para começar suas compras
      </Text>

      {errors.general ? (
        <Text style={styles.errorGeneral}>{errors.general}</Text>
      ) : null}

      {/* Nome */}
      <View style={styles.inputContainer}>
        <Ionicons name="person-outline" size={22} color="#0F265C" />
        <TextInput
          placeholder="Nome"
          placeholderTextColor="#7D8DA6"
          value={name}
          onChangeText={(t) => {
            setName(t);
          }}
          autoCapitalize="words"
          style={styles.input}
        />
      </View>

      {/* E-mail */}
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
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
      </View>
      {errors.email ? (
        <Text style={styles.errorText}>{errors.email}</Text>
      ) : null}

      {/* Senha */}
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
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setErrors((prev) => ({ ...prev, password: "" }));
          }}
          secureTextEntry={!showPassword}
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

      {/* Confirmar Senha */}
      <View
        style={[
          styles.inputContainer,
          errors.confirmPassword ? styles.inputError : null,
        ]}
      >
        <Ionicons name="lock-closed-outline" size={22} color="#0F265C" />
        <TextInput
          placeholder="Confirmar senha"
          placeholderTextColor="#7D8DA6"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            setErrors((prev) => ({ ...prev, confirmPassword: "" }));
          }}
          secureTextEntry={!showConfirmPassword}
          style={styles.input}
        />
        <Pressable
          onPress={() => setShowConfirmPassword((prev) => !prev)}
          style={styles.eyeButton}
          hitSlop={10}
        >
          <Ionicons
            name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
            size={26}
            color="#0F265C"
          />
        </Pressable>
      </View>
      {errors.confirmPassword ? (
        <Text style={styles.errorText}>{errors.confirmPassword}</Text>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Registrar</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Já tem uma conta?{" "}
        <Text
          style={styles.footerLink}
          onPress={() => navigation.navigate("Login")}
        >
          Entrar
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

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F265C",
  },

  subtitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F265C",
    marginTop: 4,
  },

  description: {
    textAlign: "center",
    color: "#7D8DA6",
    marginVertical: 20,
    fontSize: 15,
    lineHeight: 22,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.4,
    borderColor: "#1F5FBF",
    paddingHorizontal: 16,
    borderRadius: 14,
    height: 56,
    width: "100%",
    marginBottom: 16,
  },

  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: "#0F265C",
  },

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
    marginTop: 12,
    alignItems: "center",
  },

  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  footer: {
    marginTop: 16,
    color: "#7D8DA6",
    fontSize: 16,
  },

  footerLink: {
    color: "#1F5FBF",
    fontSize: 16,
    fontWeight: "700",
  },
});
