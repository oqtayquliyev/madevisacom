// Fixed numbers (document allowances, free checks, employer prices) and the
// salary currency helper. Plan prices for Starter and Pro live in
// supabase/functions/_shared/plans.ts (re-exported by src/lib/plans.ts).
//
// The country-based Pro price list (purchasing-power pricing with local
// currencies) was retired in October 2026 in favour of flat USD prices.

export * from '@/lib/planPrice';
