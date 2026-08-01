// lib/deleteAccount.js
//
// Calls the delete-account Edge Function — the only way to actually
// remove an auth.users row (see that function's own header comment).
// supabase-js automatically attaches the current session's
// Authorization header to functions.invoke(), which is what the
// function uses to verify this is the signed-in user deleting their
// own account.

import { supabase } from './supabase';

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account');
  return { error };
}
