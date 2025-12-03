import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

type Props = {
  label: string;
  onPress: () => void;
};

export function Button({ label, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 55,
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  label: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 18,
  },
});
