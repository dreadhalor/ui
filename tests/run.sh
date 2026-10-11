#!/bin/sh
# Touch/mouse gesture checks against the demo page, in headless Chrome via CDP.
# Needs the demo running: `pnpm demo --port 5199` (or set DEMO_URL).
# Each prints PASS/FAIL lines; exits non-zero if any FAIL.
cd "$(dirname "$0")"
out=$(for t in gestures double-tap double-tap-ios-mouse arrow-fade desktop layers confirm; do node "$t.cjs" 2>&1; done)
echo "$out" | grep -E 'PASS|FAIL|Error'
! echo "$out" | grep -qE 'FAIL|Error'
