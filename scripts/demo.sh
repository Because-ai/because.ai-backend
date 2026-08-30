#!/usr/bin/env bash
set -euo pipefail

bun run migrate
bun run reset
bun run load:superstore
bun run seed:calendar
bun run seed:notes
bun run seed:sparse
bun run seed:marketing
if bun run populate:demo; then
  echo "demo data ready"
else
  echo "demo data INCOMPLETE: some combinations failed, see the log above" >&2
  exit 1
fi
