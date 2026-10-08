@echo off
rem Startet den Shop lokal: http://localhost:8000/shop.html  (Beenden mit Strg+C)
cd /d "%~dp0"
echo Shop laeuft auf http://localhost:8000/shop.html
start "" http://localhost:8000/shop.html
py -m http.server 8000 --bind 127.0.0.1 || python -m http.server 8000 --bind 127.0.0.1
