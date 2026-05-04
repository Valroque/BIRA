#!/usr/bin/env bash
set -e

# Drops + recreates `bira_test` against the docker-composed Postgres on
# host port 5433, then runs migrations against it under NODE_ENV=test.
#
# Run once before your first test run (and after any migration change).
# Tests share a single DB and rely on `truncateAll()` in beforeEach for
# isolation — see tests/setup.ts.

CONTAINER="${BIRA_PG_CONTAINER:-bira_postgres_dev}"
TEST_DB="${BIRA_TEST_DB:-bira_test}"
PG_USER="${BIRA_PG_USER:-postgres}"

echo "── Dropping + recreating ${TEST_DB} on container ${CONTAINER} ──"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Postgres container '${CONTAINER}' is not running." >&2
  echo "  Start it with: npm run db:up" >&2
  exit 1
fi

# Connect to the `postgres` maintenance DB so we can drop+create the test DB.
docker exec -i "${CONTAINER}" psql -U "${PG_USER}" -d postgres \
  -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS ${TEST_DB};
CREATE DATABASE ${TEST_DB};
SQL

echo "── Running migrations against ${TEST_DB} ──"
NODE_ENV=test npm run db:migrate

echo "── Done. ${TEST_DB} is ready. ──"
