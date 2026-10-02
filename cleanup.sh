#!/usr/bin/env bash
# MadeVisa cleanup — run from the project root:  bash cleanup.sh
# Everything removed here is either never imported, auto-generated, or junk.
# It's all in git history if you ever need it back.
set -e
cd "$(dirname "$0")"

echo "0) Two migrations that were renumbered (same content, new names: 20261123… and 20261124…)"
rm -f supabase/migrations/20261120090000_social_program.sql \
      supabase/migrations/20261121090000_social_reels.sql

echo "1) Source files nothing imports (dead code)"
rm -f src/components/auth/AuthSidePanel.tsx \
      src/components/briefs/OfferCompaniesRow.tsx \
      src/components/location/CountrySwitcher.tsx \
      src/components/ui/StatusBadge.tsx \
      src/data/destinationInfo.ts \
      src/lib/applications.ts \
      src/pages/auth/Turnstile.tsx \
      src/pages/programs/SubmitProgramPage.tsx
rmdir src/components/location src/components/ui 2>/dev/null || true

echo "2) Static sitemap that HIDES your live /api/sitemap on Vercel (SEO bug)"
rm -f public/sitemap.xml

echo "3) Leftovers from Bolt / setup notes that are done"
rm -rf .bolt
rm -f SEO-SETUP.md
rm -rf public/government-logos          # old duplicate folder
rm -rf public/assets/government-logos   # unused: the institutions page no longer shows logos

echo "4) macOS junk"
find . -name .DS_Store -not -path "./node_modules/*" -delete

echo "5) Stop tracking machine-specific files in git (files stay on disk)"
git rm -r --cached --quiet supabase/.temp .bolt 2>/dev/null || true
git ls-files -z | grep -z '\.DS_Store$' | xargs -0 -r git rm --cached --quiet
grep -qx 'supabase/.temp' .gitignore || printf '\n# Supabase CLI local state\nsupabase/.temp\n' >> .gitignore

echo "Done. Now run:  npm run typecheck && npm run build"
