#!/usr/bin/env bash
set -e

echo "── Starting Postgres container ──"
docker compose up -d postgres

echo "── Waiting for Postgres to become healthy ──"
attempts=0
max_attempts=30
until [ "$(docker inspect --format '{{.State.Health.Status}}' bira_postgres_dev 2>/dev/null)" = "healthy" ]; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge "$max_attempts" ]; then
    echo "ERROR: Postgres did not become healthy after ${max_attempts}s." >&2
    echo "Check container logs with: docker logs bira_postgres_dev" >&2
    exit 1
  fi
  sleep 1
done
echo "Postgres is healthy."

echo "── Running migrations ──"
npm run db:migrate

echo "── Running seeds ──"
npm run seed

echo "── Done. Postgres is up, migrated, and seeded. ──"
