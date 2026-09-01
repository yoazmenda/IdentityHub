#!/bin/sh
# Only migrate+seed when actually starting the server (the default CMD, "serve") — not for
# one-off `docker compose run --rm backend <anything else>` invocations like `npm test` or
# `npm run test:e2e`, which have no business touching the dev database. Both steps are
# idempotent (see their own files), so it's safe to run on every server start, not just the first.
set -e

if [ "$1" = "serve" ]; then
  echo "Running migrations..."
  npm run migrate
  echo "Seeding demo data..."
  npm run seed
  exec npm run start:dev
fi

exec "$@"
