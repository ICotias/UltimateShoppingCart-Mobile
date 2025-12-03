import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  title: string;
  subtitle: string;
  description: string;
};

export function HeaderAuth({ title, subtitle, description }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="cart-outline" size={48} color="#1E3A8A" />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  description: {
    marginTop: 12,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 16,
  },
});
