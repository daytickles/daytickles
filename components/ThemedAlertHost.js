import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken, textOn } from '../lib/theme';
import { registerAlertHost } from '../lib/themedAlert';

// The app's one popup for every alert, replacing native Alert.alert --
// triggered through lib/themedAlert.js's showAlert(). Cream, centred,
// stacked-button look taken from DeletePhotoModal (the existing "themed
// equivalent of a destructive Alert.alert").
//
// Mounted once in app/_layout.js, inside AppLockGate: it outlives any one
// screen (an alert raised just before its screen unmounts still shows),
// but never draws over the PIN lock screen.
//
// Alerts queue -- one requested while another is showing (including from
// a button's own onPress, e.g. a two-step confirmation) waits its turn.
//
// Button-only: no backdrop tap and no Android back button, same as the
// native Android alerts this replaces. Only the first tap per alert
// counts, so a quick double tap can't fire a Delete/Redeem twice while
// the popup fades out.
//
// On iOS a button's onPress runs only after the popup has fully
// dismissed (onDismiss), since iOS drops a Modal presented while another
// is still animating out; Android has no such problem (and no onDismiss),
// so it runs straight away.
export default function ThemedAlertHost() {
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [queue, setQueue] = useState([]);
  const [closing, setClosing] = useState(false);
  const pressedRef = useRef(false);
  const pendingPressRef = useRef(null);

  useEffect(() => registerAlertHost((alert) => setQueue((q) => [...q, alert])), []);

  const current = queue[0];

  useEffect(() => {
    pressedRef.current = false;
  }, [current]);

  function finish() {
    const onPress = pendingPressRef.current;
    pendingPressRef.current = null;
    setQueue((q) => q.slice(1));
    setClosing(false);
    onPress?.();
  }

  function handlePress(button) {
    if (pressedRef.current) return;
    pressedRef.current = true;
    pendingPressRef.current = button.onPress || null;
    if (Platform.OS === 'ios') setClosing(true);
    else finish();
  }

  // Top to bottom: the primary action (the last non-cancel button, same
  // "last is the positive action" order Alert.alert uses) filled, any
  // other non-cancel buttons outlined, then Cancel as a quiet text link --
  // DeletePhotoModal's own Delete-over-Cancel layout.
  const buttons = current?.buttons ?? [];
  const actions = buttons.filter((b) => b.style !== 'cancel').reverse();
  const cancels = buttons.filter((b) => b.style === 'cancel');

  return (
    <Modal
      visible={!!current && !closing}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
      onDismiss={Platform.OS === 'ios' ? finish : undefined}
    >
      {current && (
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{current.title}</Text>
            {!!current.message && (
              <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
                <Text style={styles.body}>{current.message}</Text>
              </ScrollView>
            )}

            {actions.map((b, i) => {
              const tone = b.style === 'destructive' ? C.error : accentDark;
              const filled = i === 0;
              return (
                <TouchableOpacity
                  key={`a${i}`}
                  onPress={() => handlePress(b)}
                  style={[
                    styles.button,
                    filled ? { backgroundColor: tone } : { borderWidth: 1.5, borderColor: tone },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: filled ? textOn(tone) : tone }]}>{b.text}</Text>
                </TouchableOpacity>
              );
            })}

            {cancels.map((b, i) => (
              <TouchableOpacity key={`c${i}`} onPress={() => handlePress(b)} style={styles.cancel}>
                <Text style={styles.cancelText}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </Modal>
  );
}

// Same backdrop/sheet/title/body/button values as DeletePhotoModal.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  sheet: { width: '100%', maxHeight: '80%', backgroundColor: C.bg, borderRadius: 18, padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10, textAlign: 'center' },
  // Scrolls only when a message is long (e.g. an upload failure's raw
  // error text) -- flexShrink keeps short ones at their natural height.
  bodyScroll: { flexShrink: 1, marginBottom: 16 },
  bodyContent: { flexGrow: 0 },
  body: { fontSize: 14, color: C.text, lineHeight: 20, textAlign: 'center' },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { fontWeight: '700', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 4 },
  cancelText: { fontSize: 14, color: C.subtext, fontWeight: '600' },
});
