#!/bin/bash
cd "$(dirname "$0")/.."
./scripts/build_core_module.sh
cp core/core.mjs web/src/lib/core.js
