#!/usr/bin/env bash
set -e

echo "── Tearing down Postgres + volume ──"
docker compose down -v

echo "── Bringing it back up clean ──"
exec bash "$(dirname "$0")/db-up.sh"
