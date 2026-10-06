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
# 38 pt group-by strip and a 36 pt group header, so it spans about 188-250.
EMAIL_FIELD='201 155'
PASSWORD_FIELD='201 211'
SIGN_IN_BUTTON='201 286'
PROJECTS_TAB='201 814'
FIRST_TASK_ROW='160 222'

tap() {
  # shellcheck disable=SC2086
  idb ui tap --udid "$UDID" $1
}

screenshot() {
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/$1" > /dev/null
}

# Share of pixels that differ between two screenshots, from 0 to 1. The
# simulator's screenshots are pixel-exact, so any change above 2 counts
# (the canvas and row backgrounds differ by only ~6). The status bar is
# cropped off, because its clock can change between shots.
difference() {
  python3 - "$OUT_DIR/$1" "$OUT_DIR/$2" <<'PY'
import sys
from PIL import Image, ImageChops

a, b = (Image.open(p).convert('RGB') for p in sys.argv[1:3])
status_bar = 62 * a.width // 402
box = (0, status_bar, a.width, a.height)
diff = ImageChops.difference(a.crop(box), b.crop(box)).convert('L')
changed = sum(diff.point(lambda v: 255 if v > 2 else 0).histogram()[255:])
print(f'{changed / (diff.width * diff.height):.4f}')
PY
}

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

above() { python3 -c "import sys; sys.exit(0 if $1 > $2 else 1)"; }
below() { python3 -c "import sys; sys.exit(0 if $1 < $2 else 1)"; }

# settle NAME — screenshots until two in a row match, so transitions and
# late input have finished: on a slow runner idb delivers input up to ~15 s
# after the command returns.
settle() {
  screenshot "$1"
  for _ in $(seq 1 30); do
    sleep 1
    cp "$OUT_DIR/$1" "$OUT_DIR/.previous.png"
    screenshot "$1"
    below "$(difference .previous.png "$1")" 0.0001 && return 0
  done
  return 1
}

# wait_until NAME BASE above|below LIMIT — screenshots NAME until its
# difference from BASE is above (or below) LIMIT, for up to 45 s, then lets
# the screen settle.
wait_until() {
  local d
  for _ in $(seq 1 45); do
    screenshot "$1"
    d=$(difference "$2" "$1")
    if "$3" "$d" "$4"; then
      settle "$1"
      echo "  $1 vs $2: $(difference "$2" "$1") of pixels differ (must be $3 $4)"
      return 0
    fi
    sleep 1
  done
  echo "  $1 vs $2: $d of pixels differ after 45 s (must be $3 $4)"
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
