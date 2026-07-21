import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C } from '../lib/theme';

export default function Button({ title, onPress, variant = 'primary', disabled = false }) {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={isPrimary ? styles.primaryText : styles.secondaryText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: C.rust,
  },
  secondary: {
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.rust,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryText: {
    color: C.rust,
    fontSize: 16,
    fontWeight: '600',
  },
});
