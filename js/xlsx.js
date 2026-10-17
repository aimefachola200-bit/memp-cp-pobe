import { CREDIT } from './config.js';
/* République du Bénin — MEMP — Lecture / écriture de classeurs Excel (.xlsx) sans dépendance externe
   (utilise JSZip). Chaque feuille exportée reçoit le bandeau officiel du Ministère. */

const esc = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/* styles : nom → {font, fill, border, h, v, wrap, fmt} */
const FONTS = [
  '<font><sz val="10"/><name val="Arial"/></font>',
  '<font><b/><sz val="10"/><name val="Arial"/></font>',
  '<font><b/><sz val="14"/><color rgb="FF0B5D3B"/><name val="Arial"/></font>',
  '<font><i/><sz val="9"/><color rgb="FF555555"/><name val="Arial"/></font>',
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>',
];
const FILLS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0B5D3B"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill>'];
const BORDERS = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right><top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border>'];
const STYLES = {
  default: {}, title: { font: 2 }, bold: { font: 1 }, note: { font: 3, wrap: true, v: 'top' },
  section: { font: 4, fill: 4 }, label: { font: 1, fill: 3, border: 1, wrap: true, v: 'center' },
  th: { font: 1, fill: 2, border: 1, h: 'center', v: 'center', wrap: true },
  td: { border: 1, wrap: true, v: 'center' }, tdc: { border: 1, h: 'center', v: 'center', wrap: true },
  tdn: { border: 1, h: 'center', v: 'center', fmt: 1 }, calc: { font: 1, border: 1, h: 'center', v: 'center', fill: 3 },
  total: { font: 1, border: 1, h: 'center', v: 'center', fill: 5 }, center: { h: 'center', wrap: true }, boldc: { font: 1, h: 'center' },
};
const STYLE_NAMES = Object.keys(STYLES);

export class XlsxBook {
  constructor() { this.sheets = []; this.images = []; }
  sheet(name) {
    const ws = new XlsxSheet(this, name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Feuille');
    this.sheets.push(ws); return ws;
  }
  async toBlob() {
    const JSZip = globalThis.JSZip;
    const z = new JSZip();
    const ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'];
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>République du Bénin — Ministère des Enseignements Maternel et Primaire</dc:title><dc:creator>Application CP — MEMP · ${esc(CREDIT)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
    let wbSheets = '', wbRels = '', imgN = 0;
    this.sheets.forEach((ws, i) => {
      const n = i + 1;
      ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      wbSheets += `<sheet name="${esc(ws.name)}" sheetId="${n}" r:id="rId${n}"/>`;
      wbRels += `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`;
      z.file(`xl/worksheets/sheet${n}.xml`, ws._xml());
      if (ws.img) {
        imgN++;
        ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        z.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
        z.file(`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imgN}.png"/></Relationships>`);
        z.file(`xl/media/image${imgN}.png`, ws.img.bytes);
        const cx = Math.round(ws.img.w * 9525), cy = Math.round(ws.img.h * 9525);
        z.file(`xl/drawings/drawing${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Emblème du Ministère" descr="République du Bénin - Ministère des Enseignements Maternel et Primaire"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      }
    });
    z.file('[Content_Types].xml', ct.join('') + '</Types>');
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wbSheets}</sheets></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    const xfs = STYLE_NAMES.map(nm => { const s = STYLES[nm];
      return `<xf numFmtId="${s.fmt || 0}" fontId="${s.font || 0}" fillId="${s.fill || 0}" borderId="${s.border || 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${s.h || 'general'}" vertical="${s.v || 'bottom'}" wrapText="${s.wrap ? 1 : 0}"/></xf>`; }).join('');
    z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${FONTS.length}">${FONTS.join('')}</fonts><fills count="${FILLS.length}">${FILLS.join('')}</fills><borders count="${BORDERS.length}">${BORDERS.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${STYLE_NAMES.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }
  async toBytes() { return this.toBlob().then(b => b.arrayBuffer ? b.arrayBuffer() : b); }
}

class XlsxSheet {
  constructor(book, name) { this.book = book; this.name = name; this.cells = new Map(); this.merges = []; this.widths = {}; this.heights = {}; this.freezeAt = null; this.img = null; this.landscape = true; }
  set(r, c, v, style = 'default') { this.cells.set(r + ',' + c, { v, s: Math.max(0, STYLE_NAMES.indexOf(style)) }); return this; }
  row(r, c0, arr, style = 'td') { arr.forEach((v, i) => this.set(r, c0 + i, v, style)); return this; }
  merge(r1, c1, r2, c2) { if (r1 !== r2 || c1 !== c2) this.merges.push([r1, c1, r2, c2]); return this; }
  width(c, w) { this.widths[c] = w; return this; }
  height(r, pt) { this.heights[r] = pt; return this; }
  freeze(r, c = 0) { this.freezeAt = [r, c]; return this; }
  /** Place le bandeau officiel en haut de la feuille ; renvoie l'index de la première ligne libre */
  banner(bytes, widthPx = 780, ratio = 140 / 1383) {
    const h = Math.round(widthPx * ratio);
    this.img = { bytes, w: widthPx, h };
    const rows = 4, pt = Math.ceil((h * 0.75) / rows) + 1;
    for (let r = 0; r < rows; r++) this.heights[r] = pt;
    return rows + 1;
  }
  _xml() {
    const byRow = new Map(); let maxR = 0, maxC = 0;
    for (const [k, cell] of this.cells) { const [r, c] = k.split(',').map(Number); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push([c, cell]); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
    for (const r of Object.keys(this.heights)) { maxR = Math.max(maxR, +r); byRow.has(+r) || byRow.set(+r, []); }
    let rows = '';
    [...byRow.keys()].sort((a, b) => a - b).forEach(r => {
      const ht = this.heights[r] ? ` ht="${this.heights[r]}" customHeight="1"` : '';
      rows += `<row r="${r + 1}"${ht}>`;
      byRow.get(r).sort((a, b) => a[0] - b[0]).forEach(([c, cell]) => {
        const ref = colName(c) + (r + 1), v = cell.v;
        if (v === null || v === undefined || v === '') rows += `<c r="${ref}" s="${cell.s}"/>`;
        else if (typeof v === 'number' && isFinite(v)) rows += `<c r="${ref}" s="${cell.s}"><v>${v}</v></c>`;
        else rows += `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      });
      rows += '</row>';
    });
    const cols = Object.keys(this.widths).length ? '<cols>' + Object.entries(this.widths).sort((a, b) => a[0] - b[0]).map(([c, w]) => `<col min="${+c + 1}" max="${+c + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
    const pane = this.freezeAt ? `<sheetViews><sheetView workbookViewId="0"><pane ${this.freezeAt[1] ? `xSplit="${this.freezeAt[1]}" ` : ''}ySplit="${this.freezeAt[0]}" topLeftCell="${colName(this.freezeAt[1])}${this.freezeAt[0] + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
    const merges = this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${colName(m[1])}${m[0] + 1}:${colName(m[3])}${m[2] + 1}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${colName(maxC)}${maxR + 1}"/>${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${this.img ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  }
}

/* ---------------- Lecture ---------------- */
export async function readXlsx(buffer) {
  const z = await globalThis.JSZip.loadAsync(buffer);
  const parse = async (p) => { const f = z.file(p); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
  const wb = await parse('xl/workbook.xml'); if (!wb) throw new Error('Fichier Excel invalide');
  const rels = await parse('xl/_rels/workbook.xml.rels');
  const relMap = {}; rels && [...rels.getElementsByTagName('Relationship')].forEach(r => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const ss = [];
  const sx = await parse('xl/sharedStrings.xml');
  if (sx) [...sx.getElementsByTagName('si')].forEach(si => { ss.push([...si.getElementsByTagName('t')].map(t => t.textContent).join('')); });
  const out = [];
  for (const s of [...wb.getElementsByTagName('sheet')]) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    let target = relMap[rid] || ''; target = target.replace(/^\//, ''); if (!target.startsWith('xl/')) target = 'xl/' + target;
    const doc = await parse(target); if (!doc) continue;
    const rows = [];
    [...doc.getElementsByTagName('row')].forEach(row => {
      const ri = parseInt(row.getAttribute('r'), 10) - 1, arr = [];
      [...row.getElementsByTagName('c')].forEach(c => {
        const ci = colIndex(c.getAttribute('r')), t = c.getAttribute('t');
        let val = '';
        if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else { const v = c.getElementsByTagName('v')[0]; if (v) val = t === 's' ? (ss[+v.textContent] ?? '') : v.textContent; }
        arr[ci] = val;
      });
      rows[ri] = arr;
    });
    for (let i = 0; i < rows.length; i++) rows[i] = rows[i] ? Array.from(rows[i], v => v ?? '') : [];
    out.push({ name: s.getAttribute('name'), rows });
  }
  return out;
}

/* ---------------- CSV ---------------- */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
export const csvEscape = (v) => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
