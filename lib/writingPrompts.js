// lib/writingPrompts.js
//
// Fetches the writing_prompts table once per session (called from
// AuthContext alongside registerPushToken -- same non-blocking,
// fire-and-forget pattern) and returns them pre-shuffled so create.js
// never makes a network call itself. Consuming code cycles through the
// shuffled order with a persistent cursor (see AuthContext's
// getNextPrompt), which guarantees no back-to-back repeat without
// needing to track "last shown" separately.

import { supabase } from './supabase';

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function fetchWritingPrompts() {
  try {
    const { data, error } = await supabase.from('writing_prompts').select('prompt_text');
    if (error || !data?.length) return [];
    return shuffle(data.map((row) => row.prompt_text));
  } catch (error) {
    console.log('fetchWritingPrompts skipped:', error.message);
    return [];
  }
}
