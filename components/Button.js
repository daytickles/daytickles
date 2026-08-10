import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, accentFor, darken, textOn } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';

// No accent_theme yet (e.g. pre-auth on login) falls through
// accentFor(undefined) to the rust theme — same shade this defaulted to
// before accent-awareness existed here, so nothing changes for that case.
export default function Button({ title, onPress, variant = 'primary', disabled = false, color, textColor, style }) {
  const isPrimary = variant === 'primary';
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);

  const resolvedColor = color || accentDark;
  const resolvedTextColor = textColor || (isPrimary ? textOn(resolvedColor) : resolvedColor);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        isPrimary
          ? { backgroundColor: resolvedColor }
          : { backgroundColor: C.bg, borderWidth: 1.5, borderColor: resolvedColor },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, { color: resolvedTextColor }]}>{title}</Text>
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
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
