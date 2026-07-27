// components/PinSetupModal.js
//
// Enable-PIN flow for Settings: enter a 4-digit PIN, then confirm it by
// entering it again. Only writes to SecureStore (via lib/pinLock.js) on a
// successful match — a mismatch just restarts the "enter" step with an
// error, nothing is persisted until both entries agree.

import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { C } from '../lib/theme';
import { savePin } from '../lib/pinLock';
import PinPad from './PinPad';

export default function PinSetupModal({ visible, onCancel, onComplete }) {
  const [step, setStep] = useState('enter');
  const [firstPin, setFirstPin] = useState(null);
  const [error, setError] = useState('');

  function reset() {
    setStep('enter');
    setFirstPin(null);
    setError('');
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  async function handleComplete(pin) {
    if (step === 'enter') {
      setFirstPin(pin);
      setStep('confirm');
      setError('');
      return;
    }

    if (pin === firstPin) {
      await savePin(pin);
      reset();
      onComplete();
    } else {
      setError('PINs did not match — try again.');
      setStep('enter');
      setFirstPin(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <PinPad
            title={step === 'enter' ? 'Create a PIN' : 'Confirm your PIN'}
            subtitle={step === 'enter' ? 'Used to unlock DayTickles' : 'Enter it once more'}
            error={error}
            onComplete={handleComplete}
          />
          <TouchableOpacity onPress={handleCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', backgroundColor: C.bg, borderRadius: 18, padding: 24,
    alignItems: 'center',
  },
  cancel: { marginTop: 20 },
  cancelText: { fontSize: 14, color: C.subtext, fontWeight: '600' },
});
