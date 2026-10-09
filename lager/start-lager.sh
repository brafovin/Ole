#!/bin/sh
# Startet Lager-App und Shop lokal: http://localhost:8000/lager/  (Beenden mit Strg+C)
cd "$(dirname "$0")/.." || exit 1
echo "Lager läuft auf http://localhost:8000/lager/   (Shop: http://localhost:8000/shop/)"
python3 -m http.server 8000 --bind 127.0.0.1
