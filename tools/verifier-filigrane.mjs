// Liste de blocage : les filigranes « GO HI TO Mathias » et « TO GA N FF IL » (quelle que soit la casse, l'espacement ou le découpage en
// fragments sur plusieurs lignes) ne doit apparaître ni dans le code ni dans les données pédagogiques.
// Lancer : node tools/verifier-filigrane.mjs [dossier]   (code de sortie 1 si une occurrence est trouvée)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const racine = process.argv[2] || new URL('..', import.meta.url).pathname;
const S = '[\\s\\-_.·|*"\\\\n]{0,8}';
const mot = (m) => m.split('').join(S);
const MOTIFS = [
  new RegExp('(?:(?<=\\\\n)|(?<![A-Za-zÀ-ÿ]))' + mot('GO') + S + '(?:H' + S + ')?' + mot('ITO') + '(?![a-zà-ÿ])', 'i'),   // GOHITO, GO HI TO, GOITO…
  /M\W{0,3}a(?:\s|\\n){1,8}t?h\W{0,3}i(?:\s|\\n){0,8}a\W{0,3}s(?![a-zà-ÿ])|at h i a(?:\s|\\n)/,   // Mathias éclaté
  /(?:(?<=\\n)|(?<![A-Za-z]))TO(?:\s|\\n){1,8}GA?(?:\s|\\n){1,8}(?:N(?:\s|\\n){1,8})?(?:C(?:\s|\\n){1,8})?(?:OF(?:\s|\\n){1,8}F|FF)(?:\s|\\n){1,8}IL(?![a-z])/,   // second filigrane éclaté
];
const EXT = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.webmanifest', '.yml', '.py']);
const SAUT = new Set(['.git', 'node_modules', 'tools']);
let trouves = 0;
(function parcourir(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n); const st = statSync(p);
    if (st.isDirectory()) { if (!SAUT.has(n)) parcourir(p); continue; }
    if (!EXT.has(extname(n))) continue;
    const t = readFileSync(p, 'utf8');
    for (const m of MOTIFS) { const r = m.exec(t); if (r) { trouves++; console.log(p + ' : « ' + JSON.stringify(r[0]).slice(1, -1) + ' »'); } }
  }
})(racine);
console.log(trouves ? trouves + ' occurrence(s) du filigrane interdit' : 'Aucun filigrane interdit.');
process.exit(trouves ? 1 : 0);
