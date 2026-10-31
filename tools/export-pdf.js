/*
 * tools/export-pdf.js — Rendert die Inhaltslisten documents/*.md als PDF nach documents/pdf/<name>.pdf
 * (optional, nur fuer Entwicklung).
 *
 * Ablauf:
 *   1. Jede Markdown-Datei direkt in documents/ wird mit einem kleinen eingebauten Konverter in HTML
 *      umgewandelt. Er kann genau die Teilmenge, die unsere Listen benutzen: Ueberschriften (#, ##, ###),
 *      Absaetze, Aufzaehlungen ("- "), Trennlinien (---), Tabellen, sowie inline Bilder, Links, **fett**,
 *      *kursiv* und `Code`. Keine externe Markdown-Bibliothek (Projektregel: keine Abhaengigkeiten).
 *   2. Bilder werden als data:-URLs eingebettet, damit das PDF eigenstaendig ist und keine lokalen
 *      Dateipfade enthaelt.
 *   3. Headless-Chromium (Playwright) druckt die Seite als A4 quer (die Tabellen sind breit).
 *
 * Aufruf:   node tools/export-pdf.js
 * Voraussetzung: wie tools/smoke-test.js (Node.js + Playwright mit Chromium, keine Admin-Rechte noetig).
 *
 * SICHERHEIT:
 *   - Saemtlicher Text wird HTML-escaped, bevor Markdown-Auszeichnung angewendet wird; Roh-HTML im
 *     Markdown erscheint also als Text und wird nie ausgefuehrt.
 *   - Die Seite laeuft ohne JavaScript und mit einer CSP, die nur eingebettete Styles und data:-Bilder
 *     erlaubt (kein Netzwerk, keine Skripte).
 *   - Bilder werden nur aus documents/ (und Unterordnern) gelesen; Pfade, die hinausfuehren, werden
 *     ignoriert. Links auf andere .md-Dateien werden zu reinem Text (keine lokalen Pfade im PDF);
 *     nur Sprungmarken innerhalb des Dokuments (#abschnitt) bleiben klickbar.
 */
'use strict';

const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Playwright fehlt. Installieren mit: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'documents');
const OUT = path.join(DOCS, 'pdf');
const SAFE_NAME = /^[a-z0-9_-]{1,64}\.md$/; // nur schlichte Dateinamen werden exportiert

// ---------------------------------------------------------------------------------------------------
// Mini-Markdown-Konverter
// ---------------------------------------------------------------------------------------------------

/** Escaped die fuenf HTML-Sonderzeichen. Muss vor jeder Auszeichnung laufen. */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Ueberschrift -> Sprungmarke im GitHub-Stil ("Health and protection" -> "health-and-protection"). */
function slug(text) {
  return text.toLowerCase().replace(/[`*]/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/ /g, '-');
}

/** Bild aus documents/ als data:-URL laden; null, wenn der Pfad unzulaessig ist oder fehlt. */
function imageDataUrl(src, baseDir) {
  if (!/^[A-Za-z0-9_./-]+\.png$/.test(src)) return null;
  const abs = path.resolve(baseDir, src);
  if (!abs.startsWith(DOCS + path.sep) || !fs.existsSync(abs)) return null;
  return 'data:image/png;base64,' + fs.readFileSync(abs).toString('base64');
}

/**
 * Inline-Auszeichnung. Reihenfolge ist wichtig: Code-Spans werden zuerst herausgezogen (Platzhalter),
 * damit Sternchen oder Klammern darin nicht als Auszeichnung gelesen werden; danach Bilder, Links,
 * fett, kursiv; zuletzt werden die Code-Spans wieder eingesetzt.
 */
function inline(raw, ctx) {
  const codes = [];
  let s = raw.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
    const url = imageDataUrl(src, ctx.baseDir);
    if (!url) { ctx.warnings.push('Bild fehlt oder unzulaessig: ' + src); return alt; }
    return '<img src="' + url + '" alt="' + alt + '">';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) =>
    (/^#[a-z0-9-]+$/.test(href) ? '<a href="' + href + '">' + text + '</a>' : '<span class="xref">' + text + '</span>'));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
  return s;
}

/** Zerlegt eine Tabellenzeile "| a | b |" in Zellen. */
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** Wandelt ein ganzes Markdown-Dokument in HTML-Body-Inhalt um. */
function markdownToHtml(md, ctx) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' '), ctx) + '</p>'); para = []; } };
  const flushList = () => {
    if (list) { out.push('<ul>' + list.map((li) => '<li>' + inline(li, ctx) + '</li>').join('') + '</ul>'); list = null; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) {
      flushPara(); flushList();
      const n = h[1].length;
      out.push('<h' + n + ' id="' + slug(h[2]) + '">' + inline(h[2], ctx) + '</h' + n + '>');
      continue;
    }
    if (/^---+$/.test(line.trim())) { flushPara(); flushList(); out.push('<hr>'); continue; }
    // Tabelle: Kopfzeile, gefolgt von einer Trennzeile |---|---|
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara(); flushList();
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      i--;
      // Leere erste Kopfzelle = Bildspalte (schmal, zentriert)
      out.push('<table' + (head[0] === '' ? ' class="pics"' : '') + '><thead><tr>' + head.map((c) => '<th>' + inline(c, ctx) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c, ctx) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    const li = /^- (.*)$/.exec(line);
    if (li) { flushPara(); (list = list || []).push(li[1]); continue; }
    if (list && /^\s+\S/.test(line)) { list[list.length - 1] += ' ' + line.trim(); continue; } // Fortsetzungszeile
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------
// Seitenlayout fuer den Druck
// ---------------------------------------------------------------------------------------------------

const CSS = `
  @page { size: A4 landscape; margin: 14mm 12mm 16mm; }
  body { font: 9.5pt/1.4 system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1d1d1f; }
  h1 { font-size: 20pt; margin: 0 0 6pt; color: #b5482f; }
  h2 { font-size: 14pt; margin: 14pt 0 6pt; border-bottom: 1.5pt solid #e0785c; padding-bottom: 2pt; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; break-after: avoid; }
  p, ul { margin: 4pt 0; }
  ul { padding-left: 14pt; }
  hr { border: 0; border-top: 0.5pt solid #d8d2c8; margin: 10pt 0; }
  code { font: 8.5pt ui-monospace, "DejaVu Sans Mono", Consolas, monospace; background: #f2efea; padding: 0 2pt; border-radius: 2pt; }
  a { color: #b5482f; text-decoration: none; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: #3a3530; color: #fff; text-align: left; font-weight: 600; padding: 3pt 5pt; }
  td { border-bottom: 0.5pt solid #d8d2c8; padding: 3pt 5pt; vertical-align: middle; }
  tbody tr:nth-child(even) td { background: #faf8f5; }
  table.pics td:first-child { width: 52px; text-align: center; }
  td img { max-width: 48px; max-height: 48px; image-rendering: pixelated; display: block; margin: auto; }
  td em { color: #6b625a; }
`;

function page(title, body) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
    '<title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>' + body + '</body></html>';
}

// ---------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------

(async () => {
  const files = fs.readdirSync(DOCS).filter((f) => SAFE_NAME.test(f)).sort();
  if (!files.length) { console.log('Keine Markdown-Dateien in documents/.'); return; }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const tab = await context.newPage();
  let problems = 0;

  for (const file of files) {
    const md = fs.readFileSync(path.join(DOCS, file), 'utf8');
    const ctx = { baseDir: DOCS, warnings: [] };
    const title = (/^# (.*)$/m.exec(md) || [, file])[1];
    await tab.setContent(page(title, markdownToHtml(md, ctx)), { waitUntil: 'load' });
    const target = path.join(OUT, file.replace(/\.md$/, '.pdf'));
    await tab.pdf({
      path: target,
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:7pt;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between">' +
        '<span>' + esc(title) + '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    console.log(path.relative(ROOT, target));
    for (const w of ctx.warnings) { console.log('  ! ' + w); problems++; }
  }
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
