// The price list lives in supabase/functions/_shared/planPrice.ts — one copy,
// read by the app, the server-rendered pricing page and the checkout function,
// so the price shown and the price charged are always the same numbers.
export * from '../../supabase/functions/_shared/planPrice';
