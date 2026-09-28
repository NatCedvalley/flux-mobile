#!/usr/bin/env bash
# Proves iOS swipe-back in the simulator (FM-27): signs in against
# scripts/ci/mock-iam.mjs, opens a task from the Projects tab, swipes from
# the left edge, and checks the list is back. Screenshots before and after
# the swipe go to $OUT_DIR. Run by .github/workflows/ios-simulator.yml.
#
# Needs: UDID (a booted simulator with the app running), OUT_DIR, idb
# (fb-idb + idb-companion) and python3. Elements are found by accessibility
# label through `idb ui describe-all`, which includes the WebView's content.
set -euo pipefail

: "${UDID:?UDID must be set}"
: "${OUT_DIR:?OUT_DIR must be set}"
mkdir -p "$OUT_DIR"

# A task title from src/core/mock/in-memory-flux-api.ts, which the app
# still lists on the Projects tab.
TASK_TITLE='Draft Q3 roadmap'

describe() {
  idb ui describe-all --udid "$UDID" --json
}

# Prints "x y" for the centre of the element whose accessibility label is
# $1, ignoring case (the lowest one on screen if several match), or fails.
center_of() {
  describe | python3 -c '
import json, sys
label = sys.argv[1].lower()
matches = [e for e in json.load(sys.stdin) if (e.get("AXLabel") or "").strip().lower() == label]
if not matches:
    sys.exit(1)
f = max(matches, key=lambda e: e["frame"]["y"])["frame"]
print(round(f["x"] + f["width"] / 2), round(f["y"] + f["height"] / 2))
' "$1"
}

has_label() {
  center_of "$1" > /dev/null 2>&1
}

# wait_for LABEL [present|absent] — polls for up to 30 s.
wait_for() {
  local label=$1 want=${2:-present}
  for _ in $(seq 1 30); do
    if has_label "$label"; then
      [ "$want" = present ] && return 0
    else
      [ "$want" = absent ] && return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for '$label' to be $want. Accessibility tree:"
  describe | python3 -c '
import json, sys
for e in json.load(sys.stdin):
    print(e.get("type"), repr(e.get("AXLabel")), e.get("frame"))
'
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/timeout.png" || true
  return 1
}

tap() {
  wait_for "$1"
  # shellcheck disable=SC2046
  idb ui tap --udid "$UDID" $(center_of "$1")
}

screenshot() {
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/$1"
}

echo "Signing in against the mock IAM"
tap 'Email'
idb ui text --udid "$UDID" 'ci@flux.test'
tap 'Password'
idb ui text --udid "$UDID" 'not-a-real-password'
tap 'Sign in'
wait_for 'My Work'
screenshot 'my-work.png'

echo "Opening a task from the Projects tab"
tap 'Projects'
tap "$TASK_TITLE"
wait_for 'Back'
sleep 1 # let the push transition finish
screenshot 'detail.png'

echo "Swiping back from the left edge"
# Points on the iPhone 17 (402×874). Ionic starts the gesture within 50 px
# of the left edge.
idb ui swipe --udid "$UDID" --duration 0.4 2 437 300 437
wait_for 'Back' absent
wait_for "$TASK_TITLE"
sleep 1
screenshot 'after-swipe.png'

echo "Swipe-back returned to the Projects list"
