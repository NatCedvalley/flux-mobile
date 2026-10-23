#!/usr/bin/env bash
# Screenshots the app at iOS's largest standard text size (FM-54), where the
# app's text is 120% of its default. Run by .github/workflows/ios-simulator.yml
# after ios-swipe-back.sh, so the app is signed in; the session survives the
# relaunch in the Keychain. The screenshots are for review, not judged: the
# script fails only if the app doesn't come back up or stops running.
#
# Needs: UDID (a booted simulator with the app installed), OUT_DIR,
# MOCK_OPERATIONS_LOG, idb (fb-idb + idb-companion), and python3 with Pillow.
set -euo pipefail

: "${UDID:?UDID must be set}"
: "${OUT_DIR:?OUT_DIR must be set}"
: "${MOCK_OPERATIONS_LOG:?MOCK_OPERATIONS_LOG must be set}"
mkdir -p "$OUT_DIR"

# shellcheck source=scripts/ci/sim-helpers.sh
source "$(dirname "$0")/sim-helpers.sh"

APP_ID='asia.justflux.mobile'
# As in ios-swipe-back.sh. At this size the tab bar is taller (about 63 pt)
# but still covers 814, and the first row of the Projects list grows
# downwards from about 240, so 271 is still on it.
PROJECTS_TAB='201 814'
FIRST_TASK_ROW='160 271'

# my_work_loaded SECONDS — polls the mock's log for a My Work request after
# the first COUNT lines, i.e. made by the relaunched app.
my_work_loaded() {
  for _ in $(seq 1 "$1"); do
    tail -n "+$((COUNT + 1))" "$MOCK_OPERATIONS_LOG" \
      | grep -q 'GET /api/v1/dashboard/my-tasks' && return 0
    sleep 1
  done
  return 1
}

# Put the default size back whatever happens, for the steps after this one.
trap 'xcrun simctl ui "$UDID" content_size large' EXIT

echo "Relaunching at the largest text size"
xcrun simctl ui "$UDID" content_size extra-extra-extra-large
COUNT=$(wc -l < "$MOCK_OPERATIONS_LOG")
xcrun simctl terminate "$UDID" "$APP_ID" || true
xcrun simctl launch "$UDID" "$APP_ID"
if ! my_work_loaded 60; then
  echo "The relaunched app never loaded My Work"
  screenshot 'large-text-failed.png'
  exit 1
fi
settle 'large-text-my-work.png' || echo "Warning: My Work never settled"

tap "$PROJECTS_TAB"
wait_until 'large-text-projects.png' 'large-text-my-work.png' above 0.02 \
  || echo "Warning: the Projects tab didn't open (see large-text-projects.png)"
tap "$FIRST_TASK_ROW"
wait_until 'large-text-detail.png' 'large-text-projects.png' above 0.2 \
  || echo "Warning: the first row didn't open (see large-text-detail.png)"

# Not grep -q: it would stop reading early, and under pipefail the SIGPIPE
# that launchctl then gets fails the check while the app runs.
if ! xcrun simctl spawn "$UDID" launchctl list | grep "UIKitApplication:$APP_ID" > /dev/null; then
  echo "The app stopped running at the largest text size"
  exit 1
fi
echo "Large-text screenshots taken"
