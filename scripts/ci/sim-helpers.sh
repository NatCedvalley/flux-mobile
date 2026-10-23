# Simulator helpers shared by the iOS CI scripts (ios-swipe-back.sh,
# ios-large-text.sh), which source this file. They need UDID (a booted
# simulator), OUT_DIR (where screenshots go), idb, and python3 with Pillow.

tap() {
  # shellcheck disable=SC2086
  idb ui tap --udid "$UDID" $1
}

screenshot() {
  xcrun simctl io "$UDID" screenshot "$OUT_DIR/$1" > /dev/null
}

# Share of pixels that differ between two screenshots, from 0 to 1. The
# simulator's screenshots are pixel-exact, so any change above 2 counts
# (the canvas and row backgrounds differ by only ~6). The top 180 pt is
# cropped off: the status bar's clock can change between shots, and an iOS
# banner ("Ready for Apple Intelligence") once slid in there, blur reaching
# ~170 pt, and passed for the tab switch. Real changes stay far above the
# limits without it (tab switch ~29%, detail ~45%).
difference() {
  python3 - "$OUT_DIR/$1" "$OUT_DIR/$2" <<'PY'
import sys
from PIL import Image, ImageChops

a, b = (Image.open(p).convert('RGB') for p in sys.argv[1:3])
top = 180 * a.width // 402
box = (0, top, a.width, a.height)
diff = ImageChops.difference(a.crop(box), b.crop(box)).convert('L')
changed = sum(diff.point(lambda v: 255 if v > 2 else 0).histogram()[255:])
print(f'{changed / (diff.width * diff.height):.4f}')
PY
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
