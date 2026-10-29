#!/bin/sh
# Starts the ticket service in the Docker Compose stack (stage 12 tech spec): reads the public
# key the setup service wrote, applies the migrations, seeds an empty database and serves.
set -e
TICKETS_JWT_PUBLIC_KEY="$(cat /secrets/tickets_public_key)"
export TICKETS_JWT_PUBLIC_KEY
./node_modules/.bin/tsx src/scripts/migrate.ts
./node_modules/.bin/tsx src/scripts/seed.ts --if-empty
exec ./node_modules/.bin/tsx src/server.ts
