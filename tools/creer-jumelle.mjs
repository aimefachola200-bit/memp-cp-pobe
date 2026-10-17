// République du Bénin — MEMP — Application CP — Conception : Maître Aimé FACHE (01 96 51 03 33)
// Crée (ou met à jour) l'application jumelle d'une circonscription dans un autre dossier :
//   node tools/creer-jumelle.mjs pobe ../memp-cp-pobe
// Copie l'application, applique tools/jumelles/<id>/variante.json (nom, base locale distincte, comptes de départ)
// et installe les données de départ tools/jumelles/<id>/seed.json (écoles, personnel, zones).
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const [id, dest] = process.argv.slice(2);
if (!id || !dest) { console.error('Usage : node tools/creer-jumelle.mjs <id> <dossier>'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname, J = join(root, 'tools', 'jumelles', id);
const V = JSON.parse(readFileSync(join(J, 'variante.json'), 'utf8'));
const SKIP = new Set(['.git', 'sw-assets.json']);
// on vide la destination (sauf .git) pour retirer les fichiers supprimés de l'application principale
if (existsSync(dest)) for (const n of readdirSync(dest)) if (n !== '.git') rmSync(join(dest, n), { recursive: true, force: true });
(function copy(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const n of readdirSync(src)) {
    if (SKIP.has(n)) continue;
    if (src === join(root, 'tools') && n === 'jumelles') continue;
    const s = join(src, n), d = join(dst, n);
    statSync(s).isDirectory() ? copy(s, d) : copyFileSync(s, d);
  }
})(root, dest);
// variante
const cfg = join(dest, 'js', 'config.js');
let c = readFileSync(cfg, 'utf8');
const bloc = `export const VARIANT = ${JSON.stringify({ id: V.id, titre: V.titre, base: V.base, seed: V.seed, comptes: V.comptes }, null, 2)};`;
c = c.replace(/export const VARIANT = \{[\s\S]*?\n\};/, bloc).replace(/name: 'Application CP',/, `name: ${JSON.stringify(V.nom)},`);
writeFileSync(cfg, c);
const man = join(dest, 'manifest.webmanifest'), m = JSON.parse(readFileSync(man, 'utf8'));
Object.assign(m, { name: V.nom, short_name: V.nomCourt, description: `${V.titre} — ` + m.description });
writeFileSync(man, JSON.stringify(m, null, 2));
mkdirSync(join(dest, 'data'), { recursive: true });
copyFileSync(join(J, 'seed.json'), join(dest, V.seed));
if (existsSync(join(J, 'README.md'))) copyFileSync(join(J, 'README.md'), join(dest, 'README.md'));
execFileSync(process.execPath, [join(dest, 'tools', 'gen-assets.mjs')], { stdio: 'inherit' });
console.log(`Application jumelle « ${V.nom} » prête dans ${dest}`);
