#!/bin/sh
# Headless screenshots of the archive and the keepcase study.
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
OUT="C:/Users/Bureau/AppData/Local/Temp"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --virtual-time-budget=10000 --window-size=1600,900 \
  --screenshot="$OUT/shelf-after.png" "http://localhost:5173/"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --virtual-time-budget=12000 --window-size=1600,900 \
  --screenshot="$OUT/mockup-after.png" "http://localhost:5173/mockup.html"
ls -la "$OUT/shelf-after.png" "$OUT/mockup-after.png"
