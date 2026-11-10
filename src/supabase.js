import { createClient } from '@supabase/supabase-js';
import { SUPABASE } from './config.js';

export const sb = createClient(SUPABASE.url, SUPABASE.key, {
  auth: { persistSession: true, storageKey: 'noamaker-admin' },
});

/** Colors the workshop currently has in stock, in display order. */
export async function fetchColors({ includeOutOfStock = false } = {}) {
  let q = sb.from('colors').select('id,name,hex,in_stock,sort_order').order('sort_order').order('id');
  if (!includeOutOfStock) q = q.eq('in_stock', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export const ORDER_STATUS = [
  { id: 'new', label: 'חדשה', emoji: '📥' },
  { id: 'printing', label: 'בהדפסה', emoji: '🖨️' },
  { id: 'ready', label: 'מוכנה', emoji: '📦' },
  { id: 'delivered', label: 'נמסרה', emoji: '🚲' },
  { id: 'cancelled', label: 'בוטלה', emoji: '✖️' },
];
