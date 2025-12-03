import { View, Text, StyleSheet } from "react-native";

export function Boatarde() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.text}>Olá</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 48,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
});
