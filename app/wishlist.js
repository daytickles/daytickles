import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { showAlert } from '../lib/themedAlert';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken } from '../lib/theme';
import {
  fetchTokenBalance, fetchWishlistItems, addWishlistItem, deleteWishlistItem, redeemWishlistItem,
} from '../lib/tokens';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';

// Fixed small set, same "app offers a palette, not a free picker" style
// as goals.js's GOAL_COLORS -- optional (spec allows no icon at all),
// so nothing is pre-selected; an unselected item falls back to the
// first icon here at render time only, never persisted as a choice.
const WISHLIST_ICONS = [
  'gift-outline', 'cafe-outline', 'film-outline', 'game-controller-outline',
  'ice-cream-outline', 'book-outline', 'shirt-outline', 'airplane-outline',
];
const FALLBACK_ICON = WISHLIST_ICONS[0];

export default function Wishlist() {
  const { session, profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [items, setItems] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [cost, setCost] = useState('');
  const [icon, setIcon] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  // Shared across Redeem/Delete, same reasoning as goals.js's own
  // `mutating` flag -- neither action should be double-tappable, and
  // Add's own `saving` state stays independent so a redeem in flight
  // doesn't make the Add button misleadingly show "Adding...".
  const [mutating, setMutating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [freshItems, freshBalance] = await Promise.all([fetchWishlistItems(), fetchTokenBalance()]);
      setItems(freshItems);
      setBalance(freshBalance);
    } catch (err) {
      setStatus(`Error loading reward list: ${err.message}`);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  async function handleAdd() {
    if (!label.trim()) {
      setStatus('Enter a reward name.');
      return;
    }
    const costNumber = parseInt(cost, 10);
    if (!Number.isFinite(costNumber) || costNumber <= 0) {
      setStatus('Enter a token cost.');
      return;
    }

    setSaving(true);
    setStatus('');
    try {
      await addWishlistItem({ userId: session.user.id, label, cost: costNumber, icon });
      setLabel('');
      setCost('');
      setIcon(null);
      await loadAll();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setSaving(false);
  }

  function confirmRedeem(item) {
    showAlert(
      `Redeem "${item.label}"?`,
      `This uses ${item.cost} token${item.cost === 1 ? '' : 's'}. It stays on your reward list afterward.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => handleRedeem(item) },
      ]
    );
  }

  async function handleRedeem(item) {
    setMutating(true);
    setStatus('');
    try {
      const result = await redeemWishlistItem(item.id);
      if (result.redeemed) {
        setBalance(result.balance);
        setStatus(`Redeemed "${item.label}".`);
      } else {
        setStatus(result.reason === 'insufficient_balance' ? 'Not enough tokens.' : 'Could not redeem — try again.');
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setMutating(false);
  }

  function confirmDeleteItem(item) {
    showAlert(
      'Remove from reward list?',
      `"${item.label}" will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleDeleteItem(item.id) },
      ]
    );
  }

  async function handleDeleteItem(id) {
    setMutating(true);
    setStatus('');
    try {
      await deleteWishlistItem(id);
      await loadAll();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setMutating(false);
  }

  return (
    <WallpaperBackground>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity
        onPress={() => router.back()}
        disabled={saving || mutating}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.backLink, (saving || mutating) && styles.linkDisabled]}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>My Reward List</Text>
      <Text style={styles.description}>
        Rewards you set for yourself. Earn tokens by tagging Tickles to a token-enabled Goal, then
        redeem them here.
      </Text>
      <Text style={styles.subtitle}>{balance} token{balance === 1 ? '' : 's'}</Text>

      {items.map((item) => {
        const affordable = balance >= item.cost;
        return (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <Ionicons name={item.icon || FALLBACK_ICON} size={20} color={C.rust} style={styles.itemIcon} />
              <View style={styles.itemBody}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemCost}>{item.cost} token{item.cost === 1 ? '' : 's'}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDeleteItem(item)} disabled={mutating}>
                <Text style={[styles.deleteText, mutating && styles.linkDisabled]}>Delete</Text>
              </TouchableOpacity>
            </View>
            <Button
              title="Redeem"
              onPress={() => confirmRedeem(item)}
              disabled={!affordable || mutating}
              variant="secondary"
            />
          </View>
        );
      })}

      {!loading && items.length === 0 && (
        <Text style={styles.empty}>No rewards yet — add one below.</Text>
      )}

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="e.g. Coffee treat"
          placeholderTextColor={C.faint}
          value={label}
          onChangeText={setLabel}
          maxLength={60}
        />
        <TextInput
          style={styles.input}
          placeholder="Token cost"
          placeholderTextColor={C.faint}
          value={cost}
          onChangeText={setCost}
          keyboardType="number-pad"
        />

        <View style={styles.paletteRow}>
          {WISHLIST_ICONS.map((name) => (
            <TouchableOpacity
              key={name}
              onPress={() => {
                Keyboard.dismiss();
                setIcon(icon === name ? null : name);
              }}
              style={[styles.swatch, icon === name && { borderColor: accentDark }]}
            >
              <Ionicons name={name} size={20} color={C.rust} />
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={saving ? 'Adding...' : 'Add Reward'}
          onPress={handleAdd}
          disabled={saving}
          variant="secondary"
        />
      </View>

      {!!status && <Text style={styles.status}>{status}</Text>}
    </ScrollView>
    </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  description: { fontSize: 13, color: C.subtext, lineHeight: 18, marginTop: 6 },
  subtitle: { color: C.subtext, marginBottom: 16, fontWeight: '600' },
  itemCard: {
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  itemIcon: { marginRight: 10 },
  itemBody: { flex: 1 },
  itemLabel: { fontSize: 16, color: C.text },
  itemCost: { fontSize: 13, color: C.subtext, marginTop: 2 },
  deleteText: { color: C.rust, fontWeight: '600', marginLeft: 12 },
  linkDisabled: { opacity: 0.4 },
  empty: { color: C.subtext, fontStyle: 'italic', paddingVertical: 10 },
  form: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 10, marginBottom: 12, fontSize: 16,
    backgroundColor: C.card, color: C.text,
  },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  swatch: {
    width: 36, height: 36, borderRadius: 18, margin: 4,
    borderWidth: 3, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card,
  },
  status: { marginTop: 12, color: C.rust, textAlign: 'center' },
});
