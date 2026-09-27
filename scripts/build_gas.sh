#!/bin/bash
# Builds the Apps Script files:
#   backend/Code.gs  = shared core + Apps Script adapter (no business data; safe to publish)
#   backend/Seed.gs  = first-time import of the Excel workbook data (kept private, pasted once)
set -e; cd "$(dirname "$0")/.."
./scripts/build_core_module.sh
{ echo "// AUTO-BUILT from core/core.js + backend/adapter.gs.js — edit those, then run scripts/build_gas.sh"; cat core/core.js; cat backend/adapter.gs.js; } > backend/Code.gs
{ echo "// First-time data imported from 'LISMANDY AUTOMATED INVOICE main.xlsm'. Used once by setup()."; printf "var SEED_DATA = "; cat backend/seed.json; echo ";"; } > backend/Seed.gs
echo "built backend/Code.gs ($(wc -c < backend/Code.gs) bytes), backend/Seed.gs ($(wc -c < backend/Seed.gs) bytes)"
