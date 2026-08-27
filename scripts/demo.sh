#!/usr/bin/env bash
set -euo pipefail

bun run migrate
bun run reset
bun run load:superstore
bun run seed:calendar
bun run seed:notes
bun run seed:sparse
bun run seed:marketing
bun run populate:demo

echo "demo data ready"
