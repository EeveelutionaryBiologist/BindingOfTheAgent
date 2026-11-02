#!/usr/bin/env bash
# tools/setup-dev.sh — Richtet die Entwicklungswerkzeuge ein (nur fuer Entwicklung; das Spiel selbst braucht nichts).
#
# Installiert Playwright (Node-Paket) ins projekteigene node_modules/ (steht in .gitignore, wird also nie
# eingecheckt) und den passenden Headless-Chromium in den Benutzer-Cache (~/.cache/ms-playwright).
# Danach laufen ohne weitere Schritte:
#   node tools/smoke-test.js      node tools/export-sprites.js      node tools/export-pdf.js
#
# Eigenschaften:
#   - keine Admin-/sudo-Rechte noetig (alles im Projektordner bzw. im Benutzer-Cache)
#   - idempotent: Bereits Vorhandenes wird erkannt und nicht neu geladen
#   - --no-save: legt KEINE package.json / package-lock.json an (Projektregel: keine npm-Abhaengigkeiten im Spiel)
#   - Version fest gepinnt, damit Paket und Browser-Build zusammenpassen (sonst "Executable doesn't exist")
#
# Aufruf (aus dem Projektordner oder von ueberall):   bash tools/setup-dev.sh
set -euo pipefail

PLAYWRIGHT_VERSION="1.64.1"   # bei Updates hier anheben; der Browser-Download folgt automatisch

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte Node.js 18+ installieren (z. B. ueber nvm, ohne Admin-Rechte)." >&2
  exit 1
fi

# 1) Node-Paket: nur installieren, wenn es fehlt oder die Version nicht passt
installed="$(node -e "try{console.log(require('./node_modules/playwright/package.json').version)}catch(e){}" 2>/dev/null || true)"
if [ "$installed" != "$PLAYWRIGHT_VERSION" ]; then
  echo "Installiere playwright@$PLAYWRIGHT_VERSION nach node_modules/ ..."
  npm install --no-save --no-audit --no-fund --no-package-lock "playwright@$PLAYWRIGHT_VERSION"
else
  echo "playwright@$PLAYWRIGHT_VERSION ist bereits installiert."
fi

# 2) Browser: Playwright prueft selbst, ob der passende Build schon im Cache liegt, und laedt sonst nach.
#    Nur die Headless-Shell wird gebraucht (die Tools laufen alle headless).
echo "Pruefe Headless-Chromium ..."
npx --no-install playwright install chromium-headless-shell

# 3) Kurzer Selbsttest: Startet der Browser?
node -e "
  const { chromium } = require('playwright');
  chromium.launch().then((b) => b.close()).then(() => console.log('OK: Playwright und Chromium sind einsatzbereit.'))
    .catch((e) => { console.error('Browser startet nicht:', e.message); process.exit(1); });
"
