// lib/useShareCard.js
//
// Renders ShareCard off-screen and captures it into a temp JPEG via
// react-native-view-shot, for shareEntry's cardImageUri param. feed.js
// and calendar.js both need this same render-then-capture sequence
// around their own handleShare, so it lives here once rather than
// duplicated per screen.
//
// captureRef needs the card actually mounted and laid out (it screenshots
// real rendered pixels, not a virtual tree), so this can't just be a
// plain async function — the pending card is pushed into state, rendered
// off-screen (large negative offset, not opacity/display, since some
// platforms won't paint a view that was never actually shown), and
// captured only once its Image has fired onLoad. A local file:// URI
// decodes fast but is still asynchronous — capturing on the wrapping
// View's onLayout instead would race the image and could grab a blank
// photo well before it errors out.
//
// onLoad firing isn't enough on its own, though: it only means the JS
// Image element has the bitmap, not that Android's native compositor has
// finished painting it into the layer captureRef reads — capturing
// immediately produced a faded/partially-blended photo (mid-composite),
// not a hard blank. CAPTURE_SETTLE_DELAY_MS gives that a beat to finish.
// A double requestAnimationFrame was the other option, but that only
// guarantees JS/UI-thread scheduling, not native texture compositing on
// a different thread — this fixed delay is what's actually reported to
// resolve this exact react-native-view-shot symptom.

import { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import ShareCard from '../components/ShareCard';

const CAPTURE_SETTLE_DELAY_MS = 200;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useShareCard() {
  const cardRef = useRef(null);
  const [pending, setPending] = useState(null);

  function captureCard({ photo, captionLabel, accentColor }) {
    return new Promise((resolve, reject) => {
      async function onImageLoad() {
        try {
          await wait(CAPTURE_SETTLE_DELAY_MS);
          const uri = await captureRef(cardRef, { format: 'jpg', quality: 0.92 });
          setPending(null);
          resolve(uri);
        } catch (err) {
          setPending(null);
          reject(err);
        }
      }

      function onImageError(err) {
        setPending(null);
        reject(err);
      }

      setPending({ photo, captionLabel, accentColor, onImageLoad, onImageError });
    });
  }

  const hiddenCard = pending ? (
    <View style={styles.offscreen} pointerEvents="none">
      <ShareCard
        ref={cardRef}
        photo={pending.photo}
        captionLabel={pending.captionLabel}
        accentColor={pending.accentColor}
        onImageLoad={pending.onImageLoad}
        onImageError={pending.onImageError}
      />
    </View>
  ) : null;

  return { hiddenCard, captureCard };
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', top: -9999, left: 0 },
});
