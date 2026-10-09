@echo off
rem Startet Lager-App und Shop lokal: http://localhost:8000/lager/
cd /d "%~dp0.."
echo Lager laeuft auf http://localhost:8000/lager/  (Shop: http://localhost:8000/shop/)
python -m http.server 8000 --bind 127.0.0.1
