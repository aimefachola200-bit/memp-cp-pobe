/* République du Bénin — MEMP — Carrière du personnel : anciennetés et départ à la retraite.
   Mêmes règles que SCOLARIS / GESCOL (module m_carriere) :
   - âge de départ selon la lettre du grade : A = 60 ans, B = 58 ans, C = 55 ans ;
   - date de départ : 1er jour du trimestre qui SUIT le trimestre de naissance
     (janv.–mars → 1er avril ; avril–juin → 1er juillet ; juil.–sept. → 1er octobre ; oct.–déc. → 1er janvier suivant) ;
     année de naissance seule (« 1968 ») → 1er janvier de (année + âge + 1) ;
   - anciennetés arrêtées au 31 décembre de la première année de l'année scolaire en cours ;
   - alerte quand le départ intervient dans les 2 ans. Conception : Maître Aimé FACHE */
import { currentSchoolYear } from './util.js';

export const AGES_RETRAITE = { A: 60, B: 58, C: 55 };
export const CATEGORIES = [{ v: 'FE', l: 'FE' }, { v: 'ACDPE', l: 'ACDPE' }, { v: 'ACDPCTD', l: 'ACDPCTD (AME)' }, { v: 'ACE', l: 'ACE' }, { v: 'Privé', l: 'Privé' }, { v: 'Autre', l: 'Autre' }];
export const DIPLOMES = ['CEP', 'BEPC', 'BAC', 'DEUG', 'DUT / BTS', 'Licence', 'Maîtrise', 'Master', 'Doctorat'];
export const ANCIENNETES = [['generale', 'date_prise_service', 'Ancienneté générale'], ['departement', 'date_service_dep', 'Ancienneté dans le département'],
  ['commune', 'date_service_commune', 'Ancienneté dans la commune'], ['ecole', 'date_service_ecole', "Ancienneté dans l'école"]];
export const REQUIS = [['matricule', 'Matricule ou NIP'], ['statut', 'Catégorie'], ['grade', 'Grade'], ['date_naissance', 'Date de naissance'],
  ['date_prise_service', 'Date de première prise de service'], ['date_service_ecole', "Prise de service dans l'école"], ['diplome_academique', 'Diplôme académique']];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const enDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; };

/** « 15/09/2020 », « 15-09-2020 », « 2020-09-15 », numéro de série Excel ou « 1968 » → ISO (« 1968 » reste « 1968 ») ; '' sinon */
export function lireDate(v, anneeSeuleOk = false) {
  const s = String(v ?? '').trim(); if (!s) return '';
  if (/^\d{4}$/.test(s)) return anneeSeuleOk ? s : '';
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s); if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getMonth() === +m[2] - 1 ? iso(d) : ''; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return enDate(m[0]) ? m[0] : '';
  if (/^\d+(\.\d+)?$/.test(s) && +s > 10000 && +s < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  return '';
}
export const lettreGrade = (g) => { const x = String(g || '').trim().toUpperCase()[0]; return x && AGES_RETRAITE[x] ? x : null; };

export function dateRetraite(naissance, grade) {
  const age = AGES_RETRAITE[lettreGrade(grade)]; if (!age || !naissance) return null;
  if (/^\d{4}$/.test(naissance)) return new Date(+naissance + age + 1, 0, 1);
  const n = enDate(naissance); if (!n) return null;
  const tri = Math.floor(n.getMonth() / 3);
  return tri === 3 ? new Date(n.getFullYear() + age + 1, 0, 1) : new Date(n.getFullYear() + age, 3 * (tri + 1), 1);
}
export function dateReference(auj = new Date()) { return new Date(+currentSchoolYear(auj).slice(0, 4), 11, 31); }
const moisEcoules = (a, b) => { let n = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); if (b.getDate() < a.getDate()) n--; return n; };
export function anciennete(debut, ref) {
  const d = enDate(debut); if (!d || d > ref) return null;
  const fin = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1), n = moisEcoules(d, fin);
  return [Math.floor(n / 12), n % 12];
}
export function fmtDuree(t, court = false) {
  if (!t) return ''; const [a, m] = t;
  if (court) return `${a} a ${m} m`;
  if (!a && !m) return "moins d'un mois";
  return [a ? `${a} an${a > 1 ? 's' : ''}` : '', m || !a ? `${m} mois` : ''].filter(Boolean).join(' ');
}
export const fmtJour = (d) => d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
export const fmtIso = (s) => /^\d{4}$/.test(s || '') ? `(année) ${s}` : (enDate(s) ? fmtJour(enDate(s)) : (s || ''));

/** Fiche enrichie des valeurs calculées (anciennetés, retraite, restant, alerte, dossier incomplet) */
export function calculerFiche(p, auj = new Date()) {
  const ref = dateReference(auj), f = { ...p, anc: {}, ancTxt: {} };
  for (const [cle, champ] of ANCIENNETES) { const t = anciennete(p[champ], ref); f.anc[cle] = t; f.ancTxt[cle] = fmtDuree(t, true); }
  const lettre = lettreGrade(p.grade), ret = dateRetraite(p.date_naissance, p.grade);
  Object.assign(f, { lettreGrade: lettre, ageRetraite: AGES_RETRAITE[lettre] || null, retraite: ret, retraiteTxt: fmtJour(ret), reference: ref });
  f.retraiteAtteinte = !!(ret && ret <= auj);
  const dans2 = new Date(auj.getFullYear() + 2, auj.getMonth(), auj.getDate());
  f.alerteRetraite = !!(ret && ret <= dans2);
  if (ret && !f.retraiteAtteinte) { const n = moisEcoules(auj, ret); f.restant = [Math.floor(n / 12), n % 12]; f.restantTxt = fmtDuree(f.restant); }
  else { f.restant = null; f.restantTxt = ret ? 'départ atteint' : ''; }
  f.retraiteRaison = ret ? '' : (!lettre ? 'grade non renseigné ou hors A, B, C' : 'date de naissance non renseignée');
  f.manquants = REQUIS.filter(([k]) => k === 'matricule' ? !(p.matricule || p.nip) : !p[k]).map(([, l]) => l);
  f.incomplet = f.manquants.length > 0;
  return f;
}
