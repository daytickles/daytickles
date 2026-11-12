// components/FindBlogbitsPopup.js
//
// "Find a Blogbit": opened from the + on Home's Blogbits card while its
// Follow chip is selected. Lists Blogbits the user could follow -- ongoing,
// by other people, not followed yet, with at least one public Tic
// (lib/tales.js fetchDiscoverableTales), newest Tic first. Tapping one
// calls onPick(id); Home opens that Blogbit's page, where the existing
// Follow button follows it. Nothing is followed from here.
//
// Same pattern as components/NailedItPopup.js: a Modal (its own window, so
// TalkBack stays inside it) filling the whole window with
// statusBarTranslucent + navigationBarTranslucent; the panel sits 12dp
// from the left and right safe edges and 12dp above the tab bar
// (bottomOffset = the caller's tab bar height); its height is capped to
// the room above that, and the list scrolls inside it, so nothing clips
// at a large font scale. The dimmed backdrop, Android back, the X and
// Done all close it.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchDiscoverableTales } from '../lib/tales';

const PANEL_FILL = '#FFFDF7';
const PANEL_LINE = '#EADFCB';
const INK = '#4A1F10';
const HELPER = '#5F5B52';
const DONE_INK = '#6B675E';
const ROW_LINE = '#E8DCC8';
const SIDE = 12;
const GAP_ABOVE_TAB_BAR = 12;
const TOP_EDGE = 12;
const CLOSE_SIZE = 44;

export default function FindBlogbitsPopup({ visible, userId, bottomOffset = 0, onClose, onPick }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // 'loading' | 'loaded' | 'error'; tales is the loaded list.
  const [state, setState] = useState('loading');
  const [tales, setTales] = useState([]);
  const mounted = useRef(true);
  // Only the newest load may set state (a quick close and reopen).
  const loadId = useRef(0);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  // A fresh list each time it opens.
  useEffect(() => {
    if (!visible || !userId) return;
    const id = ++loadId.current;
    setState('loading');
    setTales([]);
    fetchDiscoverableTales(userId).then(({ data, error }) => {
      if (!mounted.current || id !== loadId.current) return;
      if (error || !data) {
        console.warn('FindBlogbitsPopup: load failed', error?.code || error?.message || error);
        setState('error');
        return;
      }
      setTales(data);
      setState('loaded');
    });
  }, [visible, userId]);

  const bottom = bottomOffset + GAP_ABOVE_TAB_BAR;
  const maxHeight = Math.max(200, windowHeight - bottom - insets.top - TOP_EDGE);

  let body;
  if (state === 'loading') {
    body = <Text style={styles.message}>Loading…</Text>;
  } else if (state === 'error') {
    body = <Text style={styles.message}>Couldn't load Blogbits. Please try again.</Text>;
  } else if (tales.length === 0) {
    body = <Text style={styles.message}>No Blogbits to follow right now.</Text>;
  } else {
    body = (
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {tales.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.row}
            onPress={() => onPick?.(t.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.authorName ? `${t.title}, by ${t.authorName}. Opens Blogbit.` : `${t.title}. Opens Blogbit.`}
          >
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{t.title}</Text>
            {!!t.authorName && (
              <Text style={styles.author} numberOfLines={1} ellipsizeMode="tail">{`by ${t.authorName}`}</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Find a Blogbit"
        />
        <View
          style={[
            styles.panel,
            { left: insets.left + SIDE, right: insets.right + SIDE, bottom, maxHeight },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.heading} accessibilityRole="header">Find a Blogbit</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={INK} />
            </TouchableOpacity>
          </View>
          <Text style={styles.helper}>Tap one to see it. You can follow it from its page.</Text>

          {body}

          <TouchableOpacity style={styles.done} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The same dim as the Quick Tickle and Nailed it! pop-ups.
  backdrop: { flex: 1, backgroundColor: 'rgba(44,44,42,0.4)' },
  // Soft warm shadow, like NailedItPopup: the shadow* keys are iOS;
  // Android uses elevation only.
  panel: {
    position: 'absolute',
    backgroundColor: PANEL_FILL, borderWidth: 1, borderColor: PANEL_LINE, borderRadius: 26,
    paddingTop: 16, paddingRight: 16, paddingBottom: 8, paddingLeft: 16,
    shadowColor: '#4A1F10', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: INK },
  close: {
    width: CLOSE_SIZE, height: CLOSE_SIZE, marginRight: -10, marginVertical: -8,
    alignItems: 'center', justifyContent: 'center',
  },
  helper: { marginTop: 4, marginBottom: 12, fontSize: 14, color: HELPER },
  message: { marginBottom: 8, fontSize: 15, lineHeight: 21, color: INK },
  // Grows to its rows, shrinks and scrolls when the panel hits maxHeight.
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: 8 },
  row: {
    minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center',
    borderRadius: 18, borderWidth: 1.5, borderColor: ROW_LINE, backgroundColor: PANEL_FILL,
  },
  title: { fontSize: 17, fontWeight: '600', color: INK },
  author: { marginTop: 2, fontSize: 13, color: HELPER },
  done: { minHeight: 44, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '600', color: DONE_INK },
});
