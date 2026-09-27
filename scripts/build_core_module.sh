#!/bin/bash
# core.js -> ES module for frontend/tests
cd "$(dirname "$0")/.."
{ cat core/core.js; echo; echo "export default LismandyCore;"; } > core/core.mjs
