#!/usr/bin/env bash
# Screenshots the handoff's screens (docs/design/mobile-v2/, 3a-3n but 3k)
# in light and dark, for the design conformance check (FM-56). Run by
# .github/workflows/ios-simulator.yml after ios-swipe-back.sh, so the app is
# signed in; the session survives each relaunch in the Keychain. The shots
# are for review, not judged: a screen that doesn't open is a warning, and
# the script fails only if the app doesn't come back up or stops running.
#
# As in ios-swipe-back.sh, idb can't see inside the WebView, so the script
# taps fixed points on the iPhone 17 (402×874 pt, 62 pt top safe area),
# measured on web at that size with scripts/ci/mock-operations.mjs's data.
# Moving the tab bar, the Projects header, its view segment, the order of
# the CI project's rows or task detail's header means updating them.
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
MY_WORK_TAB='67 814'
PROJECTS_TAB='201 814'
INBOX_TAB='335 814'
AVATAR='368 94'
CREATE_BUTTON='356 739'
# The create sheet is a card from 10 pt under the safe area.
CREATE_CANCEL='48 104'
# Projects: the header's switcher, the List/Board/Calendar segment, and
# CI-1, the third row (under To Do's two), which has comments and activity.
SWITCHER='102 88'
LIST_VIEW='51 134'
BOARD_VIEW='156 134'
CALENDAR_VIEW='261 134'
CI_1_ROW='177 433'
# Task detail: the status pill, ⋯, and the Comments and Activity tabs.
STATUS_PILL='75 164'
MORE='372 87'
COMMENTS_TAB='131 212'
ACTIVITY_TAB='227 212'
BACK='30 87'
# Above every sheet (the switcher's starts 120 pt down), under the status
# bar: a tap on the scrim closes the sheet.
SCRIM='201 100'

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

# shot POINT NAME BASE LIMIT — taps POINT, then waits until NAME differs
# from BASE by more than LIMIT, warning (not failing) if it never does.
shot() {
  tap "$1"
  wait_until "$2" "$3" above "$4" \
    || echo "Warning: $2 may not show the intended screen"
}

# Put the default appearance back whatever happens, for the steps after.
trap 'xcrun simctl ui "$UDID" appearance light' EXIT

for scheme in light dark; do
  echo "Screens in $scheme"
  xcrun simctl ui "$UDID" appearance "$scheme"
  COUNT=$(wc -l < "$MOCK_OPERATIONS_LOG")
  xcrun simctl terminate "$UDID" "$APP_ID" || true
  xcrun simctl launch "$UDID" "$APP_ID"
  if ! my_work_loaded 60; then
    echo "The relaunched app never loaded My Work"
    screenshot "design-failed-$scheme.png"
    exit 1
  fi
  p="design-$scheme"
  settle "$p-3a-my-work.png" || echo "Warning: My Work never settled"

  shot "$INBOX_TAB" "$p-3l-inbox.png" "$p-3a-my-work.png" 0.02
  shot "$PROJECTS_TAB" "$p-3b-list.png" "$p-3l-inbox.png" 0.02
  shot "$SWITCHER" "$p-3j-switcher.png" "$p-3b-list.png" 0.2
  shot "$SCRIM" "$p-3b-list-again.png" "$p-3j-switcher.png" 0.2
  shot "$CREATE_BUTTON" "$p-3i-create.png" "$p-3b-list-again.png" 0.2
  shot "$CREATE_CANCEL" "$p-3b-list-again.png" "$p-3i-create.png" 0.2
  shot "$BOARD_VIEW" "$p-3c-board.png" "$p-3b-list-again.png" 0.1
  shot "$CALENDAR_VIEW" "$p-3d-calendar.png" "$p-3c-board.png" 0.1
  shot "$LIST_VIEW" "$p-3b-list-again.png" "$p-3d-calendar.png" 0.1
  shot "$CI_1_ROW" "$p-3e-details.png" "$p-3b-list-again.png" 0.2
  shot "$STATUS_PILL" "$p-3h-status-sheet.png" "$p-3e-details.png" 0.1
  shot "$SCRIM" "$p-3e-details-again.png" "$p-3h-status-sheet.png" 0.1
  shot "$MORE" "$p-3n-overflow.png" "$p-3e-details-again.png" 0.1
  shot "$SCRIM" "$p-3e-details-again.png" "$p-3n-overflow.png" 0.1
  shot "$COMMENTS_TAB" "$p-3f-comments.png" "$p-3e-details-again.png" 0.1
  shot "$ACTIVITY_TAB" "$p-3g-activity.png" "$p-3f-comments.png" 0.1
  shot "$BACK" "$p-3b-list-again.png" "$p-3g-activity.png" 0.2
  shot "$MY_WORK_TAB" "$p-3a-my-work-again.png" "$p-3b-list-again.png" 0.02
  shot "$AVATAR" "$p-settings.png" "$p-3a-my-work-again.png" 0.2
  # The in-between shots only serve as bases.
  rm -f "$OUT_DIR/$p-"*-again.png
done

# Not grep -q: it would stop reading early, and under pipefail the SIGPIPE
# that launchctl then gets fails the check while the app runs.
if ! xcrun simctl spawn "$UDID" launchctl list | grep "UIKitApplication:$APP_ID" > /dev/null; then
  echo "The app stopped running during the design screenshots"
  exit 1
fi
echo "Design screenshots taken"
