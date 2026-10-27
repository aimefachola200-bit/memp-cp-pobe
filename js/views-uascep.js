/* République du Bénin — MEMP — Bureaux UASCEP (module commun js/uascep.js) dans MEMP-CP / DOSP / MEMP-CP Pobè
   Membres et responsables des bureaux de l'UASCEP par école, UP, zone pédagogique, circonscription et DDEMP.
   Périmètre : CP = sa zone (écoles, UP, zone) ; CCS et DOSP = la circonscription ; DDEMP = le département ; administrateur = tout.
   Données : réglage « uascep » (sauvegarde, transmission et restauration comme les autres réglages).
   Conception : Maître Aimé FACHE */
import { toast, download, norm } from './util.js';
import { db } from './db.js';
import { scoped, inScope } from './data.js';
import { readXlsx } from './xlsx.js';
import { upsDeZone } from './officiel-cs.js';

export async function render(id, ctx) {
  if (!window.UASCEP) { ctx.el.append(Object.assign(document.createElement('p'), { textContent: 'Module UASCEP indisponible : rechargez l’application.' })); return; }
  const u = ctx.user;
  ctx.title && ctx.title('Bureaux UASCEP', 'Membres et responsables par école, UP, zone, circonscription et département');
  const ROLES = { CP: ['ECOLE', 'UP', 'ZONE'], CCS: ['ECOLE', 'UP', 'ZONE', 'CS'], DOSP: ['ECOLE', 'UP', 'ZONE', 'CS'], DDEMP: ['ECOLE', 'UP', 'ZONE', 'CS', 'DDEMP'], ADMIN: ['ECOLE', 'UP', 'ZONE', 'CS', 'DDEMP'] };
  const niveaux = ROLES[u.role] || ['ECOLE'];
  const racine = document.createElement('div'); ctx.el.append(racine);

  async function contexte() {
    const ecoles = (await scoped('schools', u)).filter(s => s && s.nom);
    const refs = await db.all('ref');
    const zonesRef = refs.filter(r => r.type === 'zone');
    const csRef = refs.filter(r => r.type === 'cs');
    const codesZone = new Set(ecoles.map(s => s.codeZone).filter(Boolean));
    zonesRef.forEach(z => { if (inScope(u, { codeZone: z.code, codeCs: z.cs, departement: u.departement && (csRef.find(c => c.code === z.cs) || {}).departement })) codesZone.add(z.code); });
    if (u.role === 'CP') { codesZone.clear(); if (u.codeZone) codesZone.add(u.codeZone); }
    const zones = [...codesZone].map(code => { const z = zonesRef.find(r => r.code === code) || {};
      return { cle: code, lib: z.nom || ('Zone pédagogique ' + (+z.numero || +code.split('-ZP')[1] || code)), zone: code, alias: [code, z.numero ? 'Zone ' + (+z.numero) : ''].filter(Boolean), cs: z.cs || code.split('-ZP')[0] }; })
      .sort((a, b) => a.cle.localeCompare(b.cle, 'fr', { numeric: true }));
    const libZone = (c) => (zones.find(z => z.cle === c) || {}).lib || c || '';
    // unités pédagogiques : celles du tableau synoptique du CP, puis celles portées par les écoles
    const ups = [];
    for (const z of zones) {
      (await upsDeZone(z.cle)).forEach(x => { if (x && x.up) ups.push({ cle: z.cle + '|' + norm(x.up) + '|' + (x.cycle || ''), lib: x.up + (x.cycle ? ' (' + (x.cycle === 'Maternelle' ? 'EM' : 'EP') + ')' : '') + (zones.length > 1 ? ' — ' + z.lib : ''), nomUp: x.up, up: x.up, cycle: x.cycle || '', zone: z.cle, rup: x.rup || '', alias: [x.up] }); });
    }
    ecoles.forEach(s => {
      if (!s.up) return;
      const zc = s.codeZoneUp || s.codeZone || '';
      if (ups.some(x => x.zone === zc && norm(x.up) === norm(s.up) && (!x.cycle || !s.cycle || x.cycle === s.cycle))) return;
      ups.push({ cle: zc + '|' + norm(s.up) + '|' + (s.cycle || ''), lib: s.up + (zones.length > 1 ? ' — ' + libZone(zc) : ''), nomUp: s.up, up: s.up, cycle: s.cycle || '', zone: zc, rup: '', alias: [s.up] });
    });
    ups.sort((a, b) => a.lib.localeCompare(b.lib, 'fr'));
    const upDe = (s) => ups.find(x => x.zone === (s.codeZoneUp || s.codeZone || '') && norm(x.up) === norm(s.up || '') && (!x.cycle || !s.cycle || x.cycle === s.cycle));
    const ent = ecoles.map(s => { const x = upDe(s); return { cle: String(s.id), lib: s.nom, ecole: s.nom, zone: s.codeZone || '', up: s.up || '', rup: x ? x.rup : '', alias: [s.code].filter(Boolean) }; })
      .sort((a, b) => a.lib.localeCompare(b.lib, 'fr'));
    // circonscriptions et départements du périmètre
    const css = new Map();
    const ajouterCs = (code, nom) => { if (code && !css.has(code)) css.set(code, { cle: code, lib: 'Circonscription scolaire de ' + (nom || (csRef.find(c => c.code === code) || {}).nom || code), alias: [code, nom, 'CS ' + (nom || '')].filter(Boolean) }); };
    if (u.codeCs) ajouterCs(u.codeCs, u.nomCs);
    ecoles.forEach(s => ajouterCs(s.codeCs, s.nomCs));
    const deps = new Map();
    const ajouterDep = (d) => { if (d && !deps.has(norm(d))) deps.set(norm(d), { cle: String(d).toUpperCase(), lib: 'DDEMP ' + String(d).toUpperCase(), alias: [d, 'DDEMP du ' + d, 'Direction départementale ' + d] }); };
    ajouterDep(u.departement); if (u.role === 'DDEMP' || u.role === 'ADMIN') ecoles.forEach(s => ajouterDep(s.departement));
    const ecrire = (niv) => niveaux.includes(niv);
    return { niveaux, lieu: u.nomCs ? u.nomCs.charAt(0) + u.nomCs.slice(1).toLowerCase() : '', fixe: { zone: u.role === 'CP' },
      entites: { ECOLE: ent, UP: ups, ZONE: zones, CS: [...css.values()], DDEMP: [...deps.values()] }, droits: { ecrire } };
  }

  function entete() {
    const dep = u.departement ? 'DIRECTION DÉPARTEMENTALE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE DU ' + String(u.departement).toUpperCase() : '';
    const cs = u.nomCs ? 'CIRCONSCRIPTION SCOLAIRE DE ' + String(u.nomCs).toUpperCase() : '';
    const zone = u.role === 'CP' && u.codeZone ? 'ZONE PÉDAGOGIQUE ' + (+u.numZone || u.codeZone) : '';
    return '<div style="font:9pt Arial,sans-serif;margin-bottom:8px"><img src="assets/embleme-memp.png" alt="MEMP — République du Bénin" style="display:block;width:100%;max-width:640px;height:auto">'
      + '<div style="margin-top:6px;line-height:1.4;max-width:60%">' + [dep, cs ? '<b>' + cs + '</b>' : '', zone].filter(Boolean).join('<br>') + '</div>'
      + '<div style="border-bottom:2px solid #1F4E79;width:60%;margin-top:4px"></div></div>';
  }

  await window.UASCEP.monter(racine, {
    app: 'MEMP-CP', sansTitre: true,
    charger: async () => (await db.setting('uascep')) || null,
    enregistrer: async (etat) => { await db.setting('uascep', etat); },
    contexte, entete,
    toast: (m) => toast(m),
    memo: { get: (k) => { try { return localStorage.getItem('uascep.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('uascep.' + k, v); } catch (e) { /* indisponible */ } } },
    xlsxEcrire: async (feuilles) => window.XlsxEcrire.classeur(feuilles),
    xlsxLire: async (f) => (await readXlsx(await f.arrayBuffer())).map(x => ({ nom: x.name, lignes: x.rows })),
    telecharger: (nom, blob) => download(blob, nom)
  });
  ctx.actions && ctx.actions([]);
}
