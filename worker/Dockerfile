# MadeVisa application worker.
# Build from the repository root (it uses the shared rules in src/lib/apply):
#   docker build -f worker/Dockerfile -t madevisa-worker .
#   docker run -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... madevisa-worker
#
# The Playwright image already has Chromium and everything it needs; its
# version must match playwright-core in worker/package.json (1.56.1).
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
COPY worker/package.json worker/package-lock.json* worker/
RUN cd worker && npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Only what the worker needs from the site: the shared rules and the email builder.
COPY src/lib/apply src/lib/apply
COPY supabase/functions/apply supabase/functions/apply
COPY worker/build.mjs worker/
COPY worker/src worker/src
RUN cd worker && node build.mjs

ENV NODE_ENV=production
USER pwuser
CMD ["node", "worker/dist/worker.mjs"]
