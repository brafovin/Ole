#!/bin/sh
# Startet den Shop lokal: http://localhost:8000/shop.html  (Beenden mit Strg+C)
cd "$(dirname "$0")" || exit 1
echo "Shop läuft auf http://localhost:8000/shop.html"
python3 -m http.server 8000 --bind 127.0.0.1
