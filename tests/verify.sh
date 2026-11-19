#!/usr/bin/env bash
# 公開前チェック：過去に起きた「<の欠落」「&lt;へのエスケープ」「途中で切れたファイル」を検出する
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
first=$(head -c 15 index.html)
if [ "$first" != "<!DOCTYPE html>" ]; then echo "NG: index.html が <!DOCTYPE html> で始まっていません: '$first'"; fail=1; fi
if grep -q '&lt;\(!DOCTYPE\|html\|head\|body\|script\|div\)' index.html; then echo "NG: index.html にエスケープされたタグ(&lt;)があります"; fail=1; fi
grep -q '</html>' index.html || { echo "NG: index.html が </html> で終わっていません（途中で切れている可能性）"; fail=1; }
for f in js/*.js js/app/*.js sw.js; do node --check "$f" || { echo "NG: $f 構文エラー"; fail=1; }; done
python3 -c "import json;json.load(open('manifest.webmanifest'))" || { echo "NG: manifest JSON不正"; fail=1; }
python3 tests/html_check.py index.html || fail=1
for f in index.html css/style.css js/data.js js/app/00-core.js js/app/18-main.js; do
  size=$(wc -c < "$f"); [ "$size" -gt 1000 ] || { echo "NG: $f が小さすぎます(${size}B)"; fail=1; }
done
[ $fail -eq 0 ] && echo "OK: 静的チェックはすべて合格" || exit 1
