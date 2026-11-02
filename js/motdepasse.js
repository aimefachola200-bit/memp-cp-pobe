/* République du Bénin — MEMP — Mot de passe oublié, question de secours
   « Mot de passe oublié ? » (écran de connexion) :
     1. question de secours (définie dans Paramètres → Compte) : la bonne réponse permet de choisir un nouveau mot de passe ;
     2. réinitialisation sur cet appareil par l'administrateur (ou le CCS / DDEMP / la DOSP du périmètre) : il saisit son
        identifiant et son mot de passe, un mot de passe provisoire est affiché (à changer à la connexion) ;
     3. demande par WhatsApp.
   Réponses stockées hachées (PBKDF2), 5 essais par quart d'heure. Conception : Maître Aimé FACHOLA */
import { h, toast, modal, checkPassword, hashPassword, norm } from './util.js';
import { db } from './db.js';
import { fieldEl } from './ui.js';
import { APP } from './config.js';
import { inScope, addLog } from './data.js';

export const QUESTIONS = ['Nom de jeune fille de votre mère', 'Ville ou village de naissance', 'Nom de votre école primaire', 'Prénom de votre premier enfant',
  "Nom de votre meilleur(e) ami(e) d'enfance", 'Votre plat préféré'];
const normaliser = (r) => norm(r);
const CLE_ESSAIS = 'mdp-essais';
function bloque(id) {
  let e = {}; try { e = JSON.parse(localStorage.getItem(CLE_ESSAIS) || '{}'); } catch { /* stockage indisponible */ }
  const t = Date.now(), l = (e[id] || []).filter(x => t - x < 15 * 60000); e[id] = l;
  try { localStorage.setItem(CLE_ESSAIS, JSON.stringify(e)); } catch { /* idem */ }
  return l.length >= 5;
}
function echec(id) { let e = {}; try { e = JSON.parse(localStorage.getItem(CLE_ESSAIS) || '{}'); } catch { /* */ } (e[id] = e[id] || []).push(Date.now()); try { localStorage.setItem(CLE_ESSAIS, JSON.stringify(e)); } catch { /* */ } }
const provisoire = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; const a = new Uint32Array(8); crypto.getRandomValues(a); return [...a].map(x => c[x % c.length]).join(''); };
const champ = (l, type = 'text', attrs = {}) => h('input', { class: 'input', type, 'aria-label': l, ...attrs });
const ligne = (l, inp) => h('label', { class: 'field' }, h('span', l), inp);

/** Peut-il réinitialiser le compte de cible ? (administrateur ; CCS / DDEMP / DOSP de son périmètre, pas un administrateur) */
const peutReinit = (a, cible) => a.role === 'ADMIN' || (['CCS', 'DDEMP', 'DOSP'].includes(a.role) && cible.role !== 'ADMIN' && cible.id !== a.id && (inScope(a, cible) || (a.codeCs && a.codeCs === cible.codeCs)));

export async function dialogueOubli(identInitial = '') {
  const corps = h('div'), id = champ('Identifiant', 'text', { autocomplete: 'username', autocapitalize: 'none', value: identInitial });
  let fermer = () => {};
  const etape1 = () => corps.replaceChildren(h('p', 'Indiquez votre identifiant de connexion.'), ligne('Identifiant', id),
    h('button', { class: 'btn primary', style: { width: '100%' }, onclick: suite }, 'Continuer'));
  async function suite() {
    const ident = id.value.trim().toLowerCase(); if (!ident) return toast('Indiquez votre identifiant.', 'warn');
    const u = (await db.all('users')).find(x => x.username.toLowerCase() === ident && x.actif !== false);
    if (!u) return toast('Identifiant inconnu sur cet appareil.', 'err');
    const blocs = [h('p', h('b', 'Identifiant : '), u.username, ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); etape1(); } }, 'changer'))];
    if (u.secours && u.secours.question) {
      const rep = champ('Réponse', 'text', { autocomplete: 'off' });
      blocs.push(h('h3', { style: { fontSize: '1rem', margin: '16px 0 6px' } }, '1. Ma question de secours'), ligne(u.secours.question, rep),
        h('button', { class: 'btn primary', style: { width: '100%' }, onclick: async () => {
          if (bloque(u.id)) return toast("Trop d'essais : réessayez dans un quart d'heure, ou faites réinitialiser par l'administrateur.", 'err', 6000);
          if (!(await checkPassword(normaliser(rep.value), u.secours))) { echec(u.id); return toast('Réponse incorrecte.', 'err'); }
          nouveau(u);
        } }, 'Vérifier ma réponse'));
    } else blocs.push(h('p', { class: 'notes' }, "Aucune question de secours n'est enregistrée pour ce compte (on la définit dans Paramètres & à propos → Compte)."));
    const aId = champ("Identifiant de l'administrateur / du CCS", 'text', { autocapitalize: 'none' }), aMdp = champ('Son mot de passe', 'password', { autocomplete: 'off' });
    blocs.push(h('h3', { style: { fontSize: '1rem', margin: '16px 0 6px' } }, (u.secours ? '2. ' : '1. ') + "Réinitialisation par l'administrateur (ou le CCS) sur cet appareil"),
      h('p', { class: 'notes' }, 'Il saisit ici son identifiant et son mot de passe : un mot de passe provisoire est affiché, à changer à la connexion.'),
      ligne("Identifiant de l'administrateur / du CCS", aId), ligne('Son mot de passe', aMdp),
      h('button', { class: 'btn', style: { width: '100%' }, onclick: async () => {
        const a = (await db.all('users')).find(x => x.username.toLowerCase() === aId.value.trim().toLowerCase() && x.actif !== false);
        if (!a || bloque('adm-' + (a ? a.id : aId.value)) || !(await checkPassword(aMdp.value, a.pwd))) { echec('adm-' + (a ? a.id : aId.value)); return toast('Identifiant ou mot de passe de l’administrateur incorrect.', 'err'); }
        if (!peutReinit(a, u)) return toast("Ce compte ne peut pas réinitialiser celui-ci (seul l'administrateur réinitialise un administrateur ; le CCS, les comptes de sa circonscription).", 'err', 7000);
        const p = provisoire(), rec = await db.get('users', u.id);
        rec.pwd = await hashPassword(p); rec.mustChange = true; await db.put('users', rec);
        await addLog(a, { action: 'Réinitialisation du mot de passe (oubli)', target: u.username });
        corps.replaceChildren(h('p', 'Mot de passe provisoire de ', h('b', u.username), ' :'), h('p', { style: { fontSize: '1.6rem', fontWeight: 800, letterSpacing: '.08em', textAlign: 'center' } }, p),
          h('p', { class: 'notes' }, 'Connectez-vous avec ce mot de passe : un nouveau vous sera demandé.'), h('button', { class: 'btn primary', style: { width: '100%' }, onclick: () => fermer() }, 'Revenir à la connexion'));
      } }, 'Réinitialiser le mot de passe'));
    const msg = encodeURIComponent(`Bonjour, j'ai oublié mon mot de passe de l'${APP.name} (identifiant : ${u.username}). Merci de m'aider à le réinitialiser.`);
    blocs.push(h('h3', { style: { fontSize: '1rem', margin: '16px 0 6px' } }, 'Ou demander de l’aide'), h('a', { class: 'btn', style: { width: '100%', textAlign: 'center', display: 'block' }, href: `https://wa.me/229${APP.concepteurTelRaw}?text=${msg}`, target: '_blank', rel: 'noopener' }, '\uE035 Demander par WhatsApp'));
    corps.replaceChildren(...blocs);
  }
  function nouveau(u) {
    const n1 = champ('Nouveau mot de passe', 'password', { autocomplete: 'new-password' }), n2 = champ('Confirmation', 'password', { autocomplete: 'new-password' });
    corps.replaceChildren(h('p', 'Réponse correcte. Choisissez votre nouveau mot de passe.'), ligne('Nouveau mot de passe (8 caractères, lettres et chiffres)', n1), ligne('Confirmation', n2),
      h('button', { class: 'btn primary', style: { width: '100%' }, onclick: async () => {
        { const fb = window.Securite ? window.Securite.faible(n1.value, u.username) : (n1.value.length < 6 ? '6 caractères minimum.' : ''); if (fb) return toast(fb, 'err'); }
        if (n1.value !== n2.value) return toast('Les deux saisies ne correspondent pas.', 'err');
        const rec = await db.get('users', u.id); rec.pwd = await hashPassword(n1.value); rec.mustChange = false; await db.put('users', rec);
        toast('Mot de passe modifié : vous pouvez vous connecter.'); fermer();
      } }, 'Enregistrer le nouveau mot de passe'));
  }
  etape1();
  modal({ title: '\uE032 Mot de passe oublié', body: corps, actions: [{ label: 'Fermer' }] });
  fermer = () => document.querySelector('.overlay .dialog-head .icon-btn')?.click();
}

/** Définir / changer sa question de secours (mot de passe actuel exigé). */
export function dialogueSecours(user, apres) {
  const v = { q: (user.secours && user.secours.question) || QUESTIONS[0], autre: '', r: '', mdp: '' };
  const enListe = QUESTIONS.includes(v.q);
  const body = h('div', h('p', { class: 'notes' }, "En cas d'oubli du mot de passe, la bonne réponse permet d'en choisir un nouveau depuis l'écran de connexion (« Mot de passe oublié ? »). Les majuscules et les accents ne comptent pas."),
    fieldEl({ k: 'q', l: 'Question', t: 'select', options: [...QUESTIONS, 'Autre question (à écrire)…'] }, enListe ? v.q : 'Autre question (à écrire)…', (k, x) => { v.q = x; }),
    fieldEl({ k: 'autre', l: 'Autre question (si choisie)' }, enListe ? '' : v.q, (k, x) => { v.autre = x; }),
    fieldEl({ k: 'r', l: 'Réponse' }, '', (k, x) => { v.r = x; }), fieldEl({ k: 'mdp', l: 'Mot de passe actuel', t: 'password' }, '', (k, x) => { v.mdp = x; }));
  modal({ title: '\uE032 Ma question de secours', body, actions: [{ label: 'Annuler' }, { label: 'Enregistrer', kind: 'primary', keepOpen: true, onClick: async (e, close) => {
    const rec = await db.get('users', user.id);
    if (!(await checkPassword(v.mdp, rec.pwd))) { toast('Mot de passe actuel incorrect.', 'err'); return false; }
    const question = v.q.startsWith('Autre question') ? v.autre.trim() : v.q;
    if (question.length < 5 || normaliser(v.r).length < 2) { toast('Choisissez une question et donnez une réponse (2 caractères au moins).', 'err'); return false; }
    rec.secours = { question, ...(await hashPassword(normaliser(v.r))) }; await db.put('users', rec);
    toast('Question de secours enregistrée.'); close(); if (apres) apres(rec);
  } }] });
}
