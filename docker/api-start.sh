#!/bin/sh
# Starts the agent API in the Docker Compose stack (stage 12 tech spec): reads the keys the
# setup service wrote, applies the migrations, seeds an empty database and serves.
set -e
TICKETS_JWT_PRIVATE_KEY="$(cat /secrets/tickets_private_key)"
SESSION_SECRET="$(cat /secrets/session_secret)"
export TICKETS_JWT_PRIVATE_KEY SESSION_SECRET
./node_modules/.bin/tsx src/scripts/migrate.ts
./node_modules/.bin/tsx src/scripts/seed.ts --if-empty
exec ./node_modules/.bin/tsx src/server.ts
