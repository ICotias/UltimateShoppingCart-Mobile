import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
};

export function CustomInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={20} color="#0F172A" />
      <TextInput
        placeholder={placeholder}
        style={styles.input}
        placeholderTextColor="#6B7280"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 55,
    borderWidth: 1.5,
    borderColor: "#1E40AF",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: "#0F172A",
  },
});
