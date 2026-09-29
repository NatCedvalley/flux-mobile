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
# 62 pt top safe area, a 52 pt tab bar above the 34 pt home indicator.
EMAIL_FIELD='201 155'
PASSWORD_FIELD='201 211'
SIGN_IN_BUTTON='201 286'
PROJECTS_TAB='201 814'
FIRST_TASK_ROW='160 150'

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

echo "Signing in against the mock IAM"
tap "$EMAIL_FIELD"
idb ui text --udid "$UDID" 'ci@flux.test'
tap "$PASSWORD_FIELD"
idb ui text --udid "$UDID" 'not-a-real-password'
tap "$SIGN_IN_BUTTON"
sleep 4
if ! grep -q 'POST /api/v1/auth/login → 200' "$MOCK_IAM_LOG"; then
  echo "The app never signed in: no login request reached the mock IAM"
  screenshot 'sign-in-failed.png'
  exit 1
fi
screenshot 'my-work.png'

echo "Opening a task from the Projects tab"
tap "$PROJECTS_TAB"
sleep 2
screenshot 'list.png'
tap "$FIRST_TASK_ROW"
sleep 2 # let the push transition finish
screenshot 'detail.png'

echo "Swiping back from the left edge"
# Ionic starts the gesture within 50 pt of the left edge.
idb ui swipe --udid "$UDID" --duration 0.4 2 437 320 437
sleep 2
screenshot 'after-swipe.png'

opened=$(difference list.png detail.png)
returned=$(difference list.png after-swipe.png)
echo "list vs detail: $opened of pixels differ (must be over 0.05)"
echo "list vs after swipe: $returned of pixels differ (must be under 0.02)"
if ! python3 -c "import sys; sys.exit(0 if $opened > 0.05 else 1)"; then
  echo "Tapping the first row didn't open a task (see detail.png)"
  exit 1
fi
if ! python3 -c "import sys; sys.exit(0 if $returned < 0.02 else 1)"; then
  echo "Swipe-back didn't return to the list (see after-swipe.png)"
  exit 1
fi

echo "Swipe-back returned to the Projects list"
