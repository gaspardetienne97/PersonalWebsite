#!/bin/sh
# The daily shelf download: up to 20 scores (MuseScore's stated daily limit), taken from the paths
# in this order, lowest levels first. Stops when MuseScore limits the account. Needs Orca open and
# signed in to MuseScore. A launchd job runs it daily; the log is .music-scores/fetch.log.
cd "$(dirname "$0")/.." || exit 1
left=${MAX:-20}
date
for p in guitar ukulele piano pads aerophone jazz ear-theory reading; do
  [ "$left" -gt 0 ] || break
  out=$(node scripts/fetch-scores.mjs --path "$p" --max "$left" 2>&1)
  echo "$out"
  n=$(echo "$out" | sed -n 's/^Fetched \([0-9]*\);.*/\1/p')
  left=$((left - ${n:-0}))
  echo "$out" | grep -q "Stopping" && break
done
