/* République du Bénin — MEMP — Données officielles d'une circonscription (application jumelle : CS Pobè, DOSP)
   Bloc « officiel » du jeu de départ (data/seed-*.json) : zones pédagogiques, unités pédagogiques (RUP, co-RUP, écoles),
   et pour chaque école zone, UP, année de création, classes autorisées, personnel par statut (FE, ACDPE, AME, autres)
   et effectifs par cours ou section (G, F).
   · premier lancement et installations existantes : une seule fois par version du bloc, seules les cases VIDES sont remplies
     (une saisie de l'utilisateur n'est jamais écrasée) ;
   · « ♻ Réinitialiser » : remet les valeurs officielles (une UP, les effectifs d'une école, une zone ou tout), après confirmation.
   Les UP sont rangées comme dans le tableau synoptique du CP (réglage « synocp-up:<code de zone> ») : les deux écrans
   montrent donc les mêmes RUP et co-RUP. Conception : Maître Aimé FACHE */
import { db } from './db.js';
import { VARIANT } from './config.js';
import { nowISO, norm, hasNum } from './util.js';
import * as E from './effectifs-schema.js';

let CACHE = null;
/** Bloc officiel (ou null) + écoles du jeu de départ */
export async function officiel() {
  if (CACHE !== null) return CACHE || null;
  CACHE = false;
  if (VARIANT.seed) {
    try { const S = await (await fetch(VARIANT.seed)).json(); if (S.officiel) CACHE = { ...S.officiel, schools: S.schools || [] }; } catch { /* hors ligne sans cache */ }
  }
  return CACHE || null;
}

const vide = (v) => v === undefined || v === null || v === '';
const CHAMPS_ECOLE = ['anneeCreation', 'classesAutorisees', 'personnelFichier'];
export const cleUps = (codeZone) => 'synocp-up:' + codeZone;
export async function upsDeZone(codeZone) { return (await db.setting(cleUps(codeZone))) || []; }
export async function enregistrerUps(codeZone, ups) { await db.setting(cleUps(codeZone), ups); }
/** Toutes les UP enregistrées : [{…, codeZone}] */
export async function toutesUps(zones) {
  const out = [];
  for (const z of zones) for (const u of await upsDeZone(z.code)) out.push({ ...u, codeZone: z.code });
  return out;
}
const memeCycle = (a, b) => !a.cycle || !b.cycle || a.cycle === b.cycle;
/** Même UP : même identifiant, sinon même nom et même cycle (« Akouho » maternelle et « Akouho » primaire sont deux UP) */
export const memeUp = (a, b) => (a.id && b.id ? a.id === b.id : norm(a.up || '') === norm(b.up || '') && memeCycle(a, b));
/** L'école appartient à l'UP (nom de l'UP sur la fiche de l'école et cycle de l'UP) */
export const ecoleDansUp = (s, x) => !!s.up && norm(s.up) === norm(x.up || '') && (!x.cycle || x.cycle === s.cycle);
const ficheUp = (u) => ({ id: u.id, cycle: u.cycle, numero: u.numero, up: u.up, siege: '', rup: u.rup || '', rup_tel: '', corup: u.corup || '', corup_tel: '', ecoles: u.ecoles || '', jour: '', arrondissement: u.arrondissement || '', officielle: true, ...(u.ajoutee ? { ajoutee: true } : {}) });

/** Applique les données officielles. force=false : cases vides seulement ; force=true : valeurs officielles remises.
    quoi : zones | ecoles | ups | effectifs ; filtres facultatifs schoolIds, upIds, codeZone. Renvoie le nombre de changements. */
export async function appliquer({ force = false, quoi = ['zones', 'ecoles', 'ups', 'effectifs'], schoolIds = null, upIds = null, codeZone = null, user = null } = {}) {
  const O = await officiel(); if (!O) return { n: 0, absent: true };
  const r = { zones: 0, ecoles: 0, ups: 0, effectifs: 0, nouvelles: 0, ignores: [] };
  const garde = (id) => !schoolIds || schoolIds.includes(id);
  if (quoi.includes('zones')) {
    const refs = (await db.all('ref')).filter(x => x.type === 'zone'), maj = [];
    for (const z of O.zones) {
      const x = refs.find(y => y.code === z.code);
      if (!x) { maj.push({ id: 'zone-' + z.code, type: 'zone', code: z.code, numero: z.numero, cs: z.code.split('-ZP')[0], nom: z.nom }); r.zones++; }
      else if (force ? x.nom !== z.nom : (/^Zone pédagogique \d+$/.test(x.nom || '') || vide(x.nom)) && x.nom !== z.nom) { maj.push({ ...x, nom: z.nom }); r.zones++; }
    }
    if (maj.length) await db.putMany('ref', maj);
  }
  if (quoi.includes('ecoles')) {
    const tous = new Map((await db.all('schools')).map(s => [s.id, s])), maj = [];
    for (const [id, o] of Object.entries(O.ecoles)) {
      if (!garde(id) || (codeZone && o.codeZone !== codeZone)) continue;
      let s = tous.get(id);
      if (!s) { const base = O.schools.find(x => x.id === id); if (!base) continue; s = { ...base, created: nowISO() }; maj.push(s); r.nouvelles++; continue; }
      const avant = JSON.stringify(s); s = { ...s };
      // zone et UP ensemble. Réinitialisation : une école que l'utilisateur a rattachée à une UP « ajoutée » par la CS sans liste
      // d'écoles (ex. Agbarou), ou à une UP alors que le fichier de la CS ne lui en donne aucune, garde sa zone et son UP.
      const garderUp = !vide(s.up) && (vide(o.up) || O.ups.some(x => x.ajoutee && x.codeZone === s.codeZone && norm(x.up) === norm(s.up) && (!x.cycle || x.cycle === s.cycle)));
      if (force ? !garderUp && !vide(o.codeZone) : vide(s.codeZone) && vide(s.numZone)) { s.codeZone = o.codeZone; s.numZone = o.numZone; }
      if (force ? !garderUp : vide(s.up)) s.up = o.up;
      for (const k of CHAMPS_ECOLE) if (o[k] !== undefined && (force || vide(s[k]))) s[k] = o[k];
      if (JSON.stringify(s) !== avant) { maj.push(s); r.ecoles++; }
    }
    if (maj.length) await db.putMany('schools', maj);
  }
  if (quoi.includes('ups')) {
    for (const z of O.zones) {
      if (codeZone && z.code !== codeZone) continue;
      const officielles = O.ups.filter(u => u.codeZone === z.code && (!upIds || upIds.includes(u.id)));
      if (!officielles.length) continue;
      const liste = await upsDeZone(z.code); let n = 0;
      for (const u of officielles) {
        const i = liste.findIndex(x => memeUp(x, u));
        if (i < 0) { liste.push(ficheUp(u)); n++; continue; }
        const x = { ...liste[i] }, avant = JSON.stringify(x);
        for (const k of ['id', 'cycle', 'numero', 'up', 'rup', 'corup', 'arrondissement']) if (u[k] !== undefined && (force || vide(x[k]))) x[k] = u[k];
        if (!u.ajoutee && (force || vide(x.ecoles))) x.ecoles = u.ecoles;
        if (u.ajoutee) x.ajoutee = true;
        x.officielle = true;
        if (JSON.stringify(x) !== avant) { liste[i] = x; n++; }
      }
      // ordre du document : maternelles puis primaires, par numéro ; les UP ajoutées par l'utilisateur restent à la fin
      const rang = (x) => { const k = O.ups.findIndex(u => memeUp(x, u)); return k < 0 ? 1e6 : k; };
      liste.sort((a, b) => rang(a) - rang(b));
      if (n) { await enregistrerUps(z.code, liste); r.ups += n; }
    }
  }
  if (quoi.includes('effectifs')) {
    const schools = new Map((await db.all('schools')).map(s => [s.id, s])), annee = O.annee;
    for (const [id, o] of Object.entries(O.ecoles)) {
      if (!o.effectifs || !garde(id) || (codeZone && o.codeZone !== codeZone)) continue;
      const s = schools.get(id); if (!s) continue;
      let rec = await db.get('effectifs', E.effId(id, annee));
      if (rec && force && (rec.statut === 'Transmise' || rec.statut === 'Validée')) { r.ignores.push(`${s.nom} (fiche ${rec.statut.toLowerCase()})`); continue; }
      const neuf = !rec;
      if (neuf) rec = E.newRecord(s, annee, user || { username: 'données de la CS' });
      let n = 0;
      if (force && !neuf) { for (const k of Object.keys(rec.data)) if (k.startsWith('dir.') && !(k in o.effectifs)) { delete rec.data[k]; n++; } }
      for (const [k, v] of Object.entries(o.effectifs)) if (force || !hasNum(rec.data[k])) { if (String(rec.data[k]) !== String(v)) n++; rec.data[k] = v; }
      if (!n && !neuf) continue;
      rec.source = O.noteEffectifs; rec.prerempli = true; rec.updated = nowISO();
      (rec.history = rec.history || []).push({ date: nowISO(), action: (force ? 'Réinitialisation' : 'Préremplissage') + ' : ' + O.noteEffectifs, by: user?.username || 'données de la CS' });
      await db.put('effectifs', rec); r.effectifs++;
    }
  }
  return r;
}

/** Une fois par version du bloc officiel : cases vides seulement (installations existantes et premier lancement). */
export async function migrerOfficiel() {
  const O = await officiel(); if (!O) return null;
  const cle = 'officiel-cs-v' + (O.version || 1);
  if (await db.setting(cle)) return null;
  if (!(await db.count('schools'))) return null;   // l'installation se termine d'abord (écoles de départ)
  const r = await appliquer({ force: false });
  await db.setting(cle, { date: nowISO(), ...r });
  return r;
}

/** Valeurs officielles d'une école et d'une UP (pour l'affichage « écart avec le fichier de la CS ») */
export async function officielEcole(id) { const O = await officiel(); return O ? O.ecoles[id] || null : null; }
export async function officielUp(u) { const O = await officiel(); return O ? O.ups.find(x => memeUp(u, x)) || null : null; }
