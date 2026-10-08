# Rare Form – Shop online stellen (rareform.clothing)

Dieser Ordner `shop/` ist die komplette Seite. Alles, was der Shop braucht, liegt darin
(`index.html`, `fotos/`, `logo/`, `icons/`, `manifest.webmanifest`, `sw.js`).
Wenn jemand `rareform.clothing` eintippt, soll `shop/index.html` erscheinen.

> Eine Domain kann nur der Besitzer selbst kaufen und verbinden. Die Verfügbarkeit von
> `rareform.clothing` wurde am 08.10.2026 im offiziellen Register geprüft (nicht vergeben),
> kann sich aber ändern. Den echten Preis und die Verfügbarkeit zeigt der Anbieter beim Kauf.

## 1. Domain kaufen
Bei einem Anbieter wie Cloudflare, Namecheap oder IONOS `rareform.clothing` suchen und kaufen.
Preis je Anbieter verschieden (bei `.clothing` oft 20–40 € im Jahr). Vorher bitte den Namen
„Rare Form“ bei DPMA / EUIPO auf bestehende Marken prüfen.

## 2. Seite kostenlos online stellen (eine der Möglichkeiten)

### Cloudflare Pages
1. Cloudflare-Konto anlegen → **Workers & Pages → Create → Pages → Connect to Git**.
2. Repository `brafovin/ole` und den Branch auswählen, der den Ordner `shop/` enthält.
3. **Build command:** leer lassen. **Build output directory:** `shop`.
4. Speichern. Nach kurzer Zeit ist der Shop unter einer Adresse wie `…pages.dev` erreichbar.

### Netlify
- Mit Git: **Add new site → Import from Git**, Repo wählen, **Publish directory:** `shop`, Build command leer.
- Ohne Git: den Ordner `shop` im Browser auf **app.netlify.com/drop** ziehen.

## 3. Domain verbinden
- **Cloudflare Pages:** im Pages-Projekt **Custom domains → Set up a custom domain** → `rareform.clothing`.
  Liegt die Domain bei Cloudflare, richtet es den DNS-Eintrag selbst ein.
- **Netlify:** **Domain management → Add a domain** → `rareform.clothing` und den angezeigten
  DNS-Einträgen beim Domain-Anbieter folgen (meist ein `CNAME` bzw. `ALIAS`/`A`-Eintrag).
- Danach `www.rareform.clothing` ebenfalls hinzufügen und auf die Hauptadresse umleiten lassen.
- HTTPS (das Schloss im Browser) richten beide Anbieter automatisch ein. Es kann ein paar Minuten bis Stunden dauern.

## 4. Auf dem iPhone als App
In Safari `https://rareform.clothing` öffnen → **Teilen → Zum Home-Bildschirm**.
Die Seite startet dann ohne Browserleiste, mit Symbol und funktioniert auch offline.

## Bevor echte Kunden kaufen
Der Shop ist eine **Demo**: Bestellungen werden nicht bezahlt, nicht verschickt und nicht gespeichert.
Für den echten Verkauf fehlen noch: Zahlungsanbieter + kleiner Server (`CHECKOUT_ENDPOINT` in `index.html`),
Impressum, Datenschutzerklärung, AGB, Widerrufsbelehrung und die Kontakt-E-Mail (`SUPPORT_MAIL`).

## Lokal ausprobieren
`start-shop.bat` (Windows) bzw. `./start-shop.sh` (Mac/Linux) → http://localhost:8000
