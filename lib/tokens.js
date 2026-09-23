// lib/tokens.js
//
// Tokens & Rewards -- balance read, wishlist read, and redemption.
// Earning has no client-side entry point at all (see migration 0065's
// award_token_on_goal_tag trigger) -- this file is spend/display only.

import { supabase } from './supabase';

// Negative only if two redeems raced past a zero balance (see
// redeem_wishlist_item's own comment in migration 0065 -- accepted,
// client-clamped rather than DB-locked). Clamp at every display site
// rather than trusting the raw sum never to dip below zero.
export function clampBalance(balance) {
  return Math.max(0, balance ?? 0);
}

export async function fetchTokenBalance() {
  const { data, error } = await supabase.rpc('get_token_balance');
  if (error) throw error;
  return clampBalance(data);
}

export async function fetchWishlistItems() {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select('*')
    .order('cost', { ascending: true });
  if (error) throw error;
  return data;
}

// Cheapest-item cost only, for CornerNav's fill-state check -- doesn't
// need the whole list. Returns null when the wishlist is empty (no
// threshold exists yet, so the circle has nothing to fill toward).
export async function fetchCheapestWishlistCost() {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select('cost')
    .order('cost', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.cost ?? null;
}

export async function addWishlistItem({ userId, label, cost, icon }) {
  const { error } = await supabase.from('wishlist_items').insert({
    user_id: userId,
    label: label.trim(),
    cost,
    icon: icon || null,
  });
  if (error) throw error;
}

export async function deleteWishlistItem(id) {
  const { error } = await supabase.from('wishlist_items').delete().eq('id', id);
  if (error) throw error;
}

// Returns { redeemed: true, balance } or { redeemed: false, reason }.
// reason is one of 'not_found' | 'insufficient_balance'. Never throws
// for those expected outcomes -- only a real network/RPC failure does.
export async function redeemWishlistItem(itemId) {
  const { data, error } = await supabase.rpc('redeem_wishlist_item', { p_item_id: itemId });
  if (error) throw error;
  return { ...data, balance: data.balance != null ? clampBalance(data.balance) : undefined };
}
