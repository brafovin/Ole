# Rare Form Lager als iPhone-App

Der Ordner `lager/` ist die komplette App (`index.html`, `img/`, `icons/`, `manifest.webmanifest`, `sw.js`).
Der Knopf „Zum Shop“ führt zu `../shop/index.html`. Lege deshalb `lager/` und `shop/` auf derselben Webseite
nebeneinander ab (zum Beispiel `…/lager/` und `…/shop/`), dann klappt der Knopf.

## Auf dem iPhone installieren
1. Die App unter einer `https://`-Adresse öffnen (siehe `../shop/ANLEITUNG.md`, Abschnitte 2 und 3, dort steht, wie man den Ordner online stellt).
2. In **Safari** öffnen → **Teilen → Zum Home-Bildschirm**. Das Symbol hat den hellen Goldton, damit man es vom Shop unterscheidet.
3. Die App startet danach ohne Browserleiste und funktioniert auch offline (Seite und Bilder werden gespeichert; die Schriften von Google nur, solange du online bist, sonst gilt die Systemschrift).

## Lokal ausprobieren
`start-lager.bat` (Windows) bzw. `./start-lager.sh` (Mac/Linux) → http://localhost:8000/lager/
Auf einem iPhone im selben WLAN geht „Zum Home-Bildschirm“ auch mit der Adresse des Computers, aber ohne Offline-Funktion, weil Safari dafür `https` verlangt.

## Hinweis
Bestände, Mindestmengen, Lieferzeiten und Lieferungen sind Beispieldaten und stehen im Code (`index.html`).
Bei einer neuen Version in `sw.js` die Zahl bei `CACHE` hochzählen.
