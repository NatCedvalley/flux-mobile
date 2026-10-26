#!/usr/bin/env bash
# Proves iOS swipe-back in the simulator (FM-27): signs in against
# scripts/ci/mock-iam.mjs, opens a task from the Projects tab, swipes from
# the left edge, and checks the list is back. Run by
# .github/workflows/ios-simulator.yml.
#
# idb can tap and swipe, but its accessibility tree stops at the WebView, so
# the script taps fixed points on the iPhone 17 (402×874 pt) and judges the
# result from screenshots: the detail page must look clearly different from
# the list, and the screen after the swipe must match the list again.
# Moving the login fields, the tab bar or the Projects list's first row
# means updating the points below.
#
# Needs: UDID (a booted simulator with the app running), OUT_DIR,
# MOCK_IAM_LOG, idb (fb-idb + idb-companion), and python3 with Pillow.
set -euo pipefail

: "${UDID:?UDID must be set}"
: "${OUT_DIR:?OUT_DIR must be set}"
: "${MOCK_IAM_LOG:?MOCK_IAM_LOG must be set}"
mkdir -p "$OUT_DIR"

# Points (x y), from the login screen and the tab layout on an iPhone 17:
# 62 pt top safe area, a 52 pt tab bar above the 34 pt home indicator. On
# the Projects tab the first row sits under the 52 pt project header, the
# 48 pt List/Board segment, the 38 pt group-by strip and a 36 pt group
# header, so it spans about 237-300. (The CI project has no saved view, so
# it opens on the list.)
EMAIL_FIELD='201 155'
PASSWORD_FIELD='201 211'
SIGN_IN_BUTTON='201 286'
PROJECTS_TAB='201 814'
FIRST_TASK_ROW='160 271'

# shellcheck source=scripts/ci/sim-helpers.sh
source "$(dirname "$0")/sim-helpers.sh"

# type_into POINT TEXT — waits for the field to take focus and the keyboard
# to come up first, or idb's first keystrokes are lost.
type_into() {
  tap "$1"
  sleep 2
  idb ui text --udid "$UDID" "$2"
  sleep 1
}

# signed_in SECONDS — polls the mock IAM's log for a login.
signed_in() {
  for _ in $(seq 1 "$1"); do
    grep -q 'POST /api/v1/auth/login → 200' "$MOCK_IAM_LOG" && return 0
    sleep 1
  done
  return 1
}

echo "Signing in against the mock IAM"
type_into "$EMAIL_FIELD" 'ci@flux.test'
type_into "$PASSWORD_FIELD" 'ci-pass'
# Return submits the form. Tapping Sign in while the keyboard is up only
# dismisses the keyboard, so the button is just the fallback, once the
# keyboard is gone. Each tap waits long enough for idb's delivery lag, so a
# late tap never lands on My Work.
idb ui key --udid "$UDID" 40
for attempt in 1 2; do
  signed_in 20 && break
  echo "Not signed in yet; tapping Sign in (attempt $attempt)"
  tap "$SIGN_IN_BUTTON"
done
if ! signed_in 20; then
  echo "The app never signed in: no login request reached the mock IAM"
  screenshot 'sign-in-failed.png'
  exit 1
fi
settle 'my-work.png'

echo "Opening a task from the Projects tab"
tap "$PROJECTS_TAB"
# Switching tabs changes ~4% of the screen (title and tab bar).
if ! wait_until 'list.png' 'my-work.png' above 0.02; then
  echo "Tapping the Projects tab didn't switch tabs (see list.png)"
  exit 1
fi
tap "$FIRST_TASK_ROW"
# Opening a task changes ~35% of the screen. The tapped row's pressed
# highlight alone changes ~7%, and holds still while a slow runner loads
# the detail page, so a lower limit can swipe on the list before detail
# opens.
if ! wait_until 'detail.png' 'list.png' above 0.2; then
  echo "Tapping the first row didn't open a task (see detail.png)"
  exit 1
fi

echo "Swiping back from the left edge"
# Ionic starts the gesture within 50 pt of the left edge.
idb ui swipe --udid "$UDID" --duration 0.4 2 437 320 437
if ! wait_until 'after-swipe.png' 'list.png' below 0.02; then
  echo "Swipe-back didn't return to the list (see after-swipe.png)"
  exit 1
fi

echo "Swipe-back returned to the Projects list"
