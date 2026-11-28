/* ÉduGestion Pro — œil sur les mots de passe, mot de passe oublié, question de secours, bouton « ← Retour ».

   · Œil \uE043 : chaque champ de mot de passe (connexion, nouveau mot de passe, formulaires) reçoit un bouton
     « afficher / masquer ».
   · « Mot de passe oublié ? » (écran de connexion) :
       1. question de secours (définie dans Mon compte) : la bonne réponse permet de choisir un nouveau mot de passe ;
       2. réinitialisation sur cet appareil par l'administrateur, le directeur de l'école, le CS ou la DDEMP :
          il saisit son identifiant et son mot de passe, un mot de passe provisoire est affiché (à changer à la connexion) ;
       3. demande par WhatsApp.
     Réponses enregistrées sous forme d'empreinte ; 5 essais par quart d'heure.
   · Mon compte : changer son mot de passe, définir sa question de secours. */
(function (global) {
  'use strict';
  const EG = global.EG, U = EG.UI, el = U.el;
  const QUESTIONS = ['Nom de jeune fille de votre mère', 'Ville ou village de naissance', 'Nom de votre école primaire', 'Prénom de votre premier enfant',
    "Nom de votre meilleur(e) ami(e) d'enfance", 'Votre plat préféré'];
  const normaliser = (r) => U.sansAccent(r).replace(/[^a-z0-9]+/g, ' ').trim();
  const empreinteReponse = (r) => EG.hashMotDePasse('secours:' + normaliser(r));
  const base = () => EG.DB;

  /* ---------------- Œil ---------------- */
  const OUVERT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const FERME = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function oeil(input) {
    if (input.dataset.oeil) return;
    input.dataset.oeil = '1';
    const boite = document.createElement('span'); boite.className = 'mdp-boite';
    input.parentNode.insertBefore(boite, input); boite.appendChild(input);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mdp-oeil';
    const maj = () => { const v = input.type === 'text'; b.innerHTML = v ? FERME : OUVERT; b.setAttribute('aria-label', v ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); b.title = b.getAttribute('aria-label'); b.setAttribute('aria-pressed', String(v)); };
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); input.type = input.type === 'password' ? 'text' : 'password'; maj(); input.focus(); });
    boite.appendChild(b); maj();
  }
  function partout(r) {
    if (r.matches && r.matches('input[type=password]')) oeil(r);
    if (r.querySelectorAll) r.querySelectorAll('input[type=password]').forEach(oeil);
  }
  new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => n.nodeType === 1 && partout(n)))).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => partout(document));
  const css = document.createElement('style');
  css.textContent = '.mdp-boite{position:relative;display:block}.mdp-boite>input{width:100%;padding-right:2.6em!important;box-sizing:border-box}'
    + '.mdp-oeil{position:absolute;right:.35em;top:50%;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;line-height:0;padding:.3em;color:#6B7A90;border-radius:6px}'
    + '.mdp-oeil:hover,.mdp-oeil[aria-pressed=true]{color:#008751;background:#E8F3EE}'
    + '.btn-retour{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(0,0,0,.15);background:#fff;color:#0b5d3b;border-radius:18px;padding:4px 11px;font-weight:600;cursor:pointer;margin-right:6px;font-size:.9em;white-space:nowrap}'
    + '.btn-retour:hover{background:#E8F3EE}@media (max-width:520px){.btn-retour .txt{display:none}}@media print{.btn-retour{display:none}}'
    + '.oubli-lien{display:block;text-align:right;margin:8px 0 0;font-size:.92em}.oubli h3{font-size:1rem;margin:16px 0 6px}';
  document.head.appendChild(css);

  /* ---------------- Retour ---------------- */
  let vues = 0;
  global.addEventListener('hashchange', () => { vues++; });
  function retour() {
    if (vues > 0 && history.length > 1) { vues -= 2; history.back(); }
    else U.Routeur.aller('accueil');
  }
  function boutonRetour() {
    return el('button', { class: 'btn-retour', type: 'button', title: 'Revenir à la page précédente', 'aria-label': 'Revenir à la page précédente', onclick: retour },
      [el('span', { text: '←' }), el('span', { class: 'txt', text: 'Retour' })]);
  }

  /* ---------------- Essais ---------------- */
  const CLE = 'eg-mdp-essais';
  function lireEssais() { try { return JSON.parse(localStorage.getItem(CLE) || '{}'); } catch (e) { return {}; } }
  function bloque(id) { const e = lireEssais(), t = Date.now(); e[id] = (e[id] || []).filter(x => t - x < 900000); try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (x) { /* */ } return e[id].length >= 5; }
  function echec(id) { const e = lireEssais(); (e[id] = e[id] || []).push(Date.now()); try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (x) { /* */ } }
  const ADMINS = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE'];
  function peutReinit(a, cible) {
    if (a.id === cible.id) return false;
    if (ADMINS.indexOf(a.role) >= 0) return true;
    if (ADMINS.indexOf(cible.role) >= 0) return false;
    if (a.role === 'DIRECTEUR') return !!a.ecole_id && a.ecole_id === cible.ecole_id;
    if (a.role === 'DDEMP') return cible.role !== 'DDEMP';
    if (a.role === 'CS') return ['DDEMP', 'CS'].indexOf(cible.role) < 0;
    return false;
  }
  const champ = (id, lib, type, attrs) => { const i = el('input', Object.assign({ type: type || 'text', id }, attrs || {})); return [el('div', { class: 'champ' }, [el('label', { for: id, text: lib }), i]), i]; };

  /* ---------------- Mot de passe oublié ---------------- */
  function dialogueOubli(identInitial) {
    const corps = el('div', { class: 'oubli' });
    const fermer = U.modal('\uE032 Mot de passe oublié', corps, f => [el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: f })]);
    function etape1() {
      const [bloc, id] = champ('oubli-id', 'Identifiant', 'text', { autocomplete: 'username', value: identInitial || '' });
      corps.textContent = '';
      corps.append(el('p', { text: 'Indiquez votre identifiant de connexion.' }), bloc,
        el('button', { class: 'btn btn-primaire pleine', type: 'button', text: 'Continuer', onclick: () => suite(id.value.trim()) }));
      setTimeout(() => id.focus(), 30);
    }
    function suite(ident) {
      if (!ident) { U.toast('Indiquez votre identifiant.', 'danger'); return; }
      base().where('users', u => u.identifiant === ident && u.actif !== false).then(l => {
        const u = l[0];
        if (!u) { U.toast('Identifiant inconnu sur cet appareil.', 'danger'); return; }
        corps.textContent = '';
        corps.append(el('p', {}, [el('strong', { text: 'Identifiant : ' }), document.createTextNode(u.identifiant + ' · '),
          el('a', { href: '#', text: 'changer', onclick: e => { e.preventDefault(); identInitial = ''; etape1(); } })]));
        let n = 1;
        if (u.secours_question && u.secours_hash) {
          const [bloc, rep] = champ('oubli-rep', u.secours_question, 'text', { autocomplete: 'off' });
          corps.append(el('h3', { text: (n++) + '. Ma question de secours' }), bloc, el('button', { class: 'btn btn-primaire pleine', type: 'button', text: 'Vérifier ma réponse', onclick: () => {
            if (bloque(u.id)) { U.toast('Trop d’essais : réessayez dans un quart d’heure.', 'danger'); return; }
            empreinteReponse(rep.value).then(h => { if (h !== u.secours_hash) { echec(u.id); U.toast('Réponse incorrecte.', 'danger'); return; } nouveau(u); });
          } }));
        } else corps.append(el('p', { class: 'muet petit', text: 'Aucune question de secours n’est enregistrée pour ce compte (on la définit dans « Mon compte », menu ⋯).' }));
        const [b1, aId] = champ('oubli-aid', 'Identifiant de l’administrateur / du directeur / du CS', 'text', { autocomplete: 'off' });
        const [b2, aMdp] = champ('oubli-amdp', 'Son mot de passe', 'password', { autocomplete: 'off' });
        corps.append(el('h3', { text: (n++) + '. Réinitialisation par l’administrateur, le directeur ou le CS sur cet appareil' }),
          el('p', { class: 'muet petit', text: 'Il saisit ici son identifiant et son mot de passe : un mot de passe provisoire est affiché, à changer à la connexion.' }), b1, b2,
          el('button', { class: 'btn pleine', type: 'button', text: 'Réinitialiser le mot de passe', onclick: () => {
            const ai = aId.value.trim();
            base().where('users', x => x.identifiant === ai && x.actif !== false).then(la => {
              const a = la[0], cle = 'adm-' + (a ? a.id : ai);
              if (bloque(cle)) { U.toast('Trop d’essais : réessayez dans un quart d’heure.', 'danger'); return; }
              return EG.hashMotDePasse(aMdp.value).then(h => {
                if (!a || h !== a.password_hash) { echec(cle); U.toast('Identifiant ou mot de passe incorrect.', 'danger'); return; }
                if (!peutReinit(a, u)) { U.toast('Ce compte ne peut pas réinitialiser celui-ci.', 'danger'); return; }
                const mdp = EG.Sortie.motDePasseProvisoire(8);
                return EG.hashMotDePasse(mdp).then(hp => base().put('users', Object.assign({}, u, { password_hash: hp, doit_changer_mdp: true, actif: true }))).then(maj => {
                  base().audit('REINITIALISATION_MDP', 'users', maj.id, { par: a.identifiant, motif: 'oubli' }); if (window.Securite) window.Securite.reussite((EG.DB.nom || 'edugestion'), u.identifiant);
                  corps.textContent = '';
                  corps.append(el('p', { text: 'Mot de passe provisoire de ' + u.identifiant + ' :' }),
                    el('p', { style: 'font-size:1.6rem;font-weight:800;letter-spacing:.08em;text-align:center', text: mdp }),
                    el('p', { class: 'muet petit', text: 'Connectez-vous avec ce mot de passe : un nouveau vous sera demandé.' }),
                    el('button', { class: 'btn btn-primaire pleine', type: 'button', text: 'Revenir à la connexion', onclick: fermer }));
                });
              });
            });
          } }));
        const msg = encodeURIComponent('Bonjour, j’ai oublié mon mot de passe ÉduGestion Pro (identifiant : ' + u.identifiant + '). Merci de m’aider à le réinitialiser.');
        corps.append(el('h3', { text: 'Ou demander de l’aide' }), el('a', { class: 'btn pleine', href: 'https://wa.me/2290196510333?text=' + msg, target: '_blank', rel: 'noopener', text: '\uE035 Demander par WhatsApp' }));
      });
    }
    function nouveau(u) {
      const [b1, n1] = champ('oubli-n1', 'Nouveau mot de passe (8 caractères, lettres et chiffres)', 'password', { autocomplete: 'new-password' });
      const [b2, n2] = champ('oubli-n2', 'Confirmation', 'password', { autocomplete: 'new-password' });
      corps.textContent = '';
      corps.append(el('p', { text: 'Réponse correcte. Choisissez votre nouveau mot de passe.' }), b1, b2, el('button', { class: 'btn btn-primaire pleine', type: 'button', text: 'Enregistrer', onclick: () => {
        { const fb = window.Securite ? window.Securite.faible(n1.value, u.identifiant) : (n1.value.length < 6 ? '6 caractères minimum.' : ''); if (fb) { U.toast(fb, 'danger'); return; } }
        if (n1.value !== n2.value) { U.toast('Les deux saisies ne sont pas identiques.', 'danger'); return; }
        EG.hashMotDePasse(n1.value).then(h => base().put('users', Object.assign({}, u, { password_hash: h, doit_changer_mdp: false }))).then(maj => {
          if (window.Securite) window.Securite.reussite((EG.DB.nom || 'edugestion'), u.identifiant);
          base().audit('CHANGEMENT_MDP', 'users', maj.id, { motif: 'question de secours' }); U.toast('Mot de passe modifié : vous pouvez vous connecter.'); fermer();
        });
      } }));
    }
    etape1();
  }

  /* ---------------- Mon compte : mot de passe, question de secours ---------------- */
  function verifierActuel(mdp) { return EG.hashMotDePasse(mdp).then(h => base().get('users', EG.session.user.id).then(u => (h === u.password_hash ? u : null))); }
  function changerMotDePasse() {
    const [b0, a] = champ('cm-a', 'Mot de passe actuel', 'password'), [b1, n1] = champ('cm-n1', 'Nouveau mot de passe (8 caractères, lettres et chiffres)', 'password'), [b2, n2] = champ('cm-n2', 'Confirmation', 'password');
    U.modal('Changer mon mot de passe', el('div', {}, [b0, b1, b2]), f => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: f }), el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
      { const fb = window.Securite ? window.Securite.faible(n1.value, (EG.session.user || {}).identifiant) : (n1.value.length < 6 ? '6 caractères minimum.' : ''); if (fb) { U.toast(fb, 'danger'); return; } }
      if (n1.value !== n2.value) { U.toast('Les deux saisies ne sont pas identiques.', 'danger'); return; }
      verifierActuel(a.value).then(u => {
        if (!u) { U.toast('Mot de passe actuel incorrect.', 'danger'); return; }
        return EG.hashMotDePasse(n1.value).then(h => base().put('users', Object.assign({}, u, { password_hash: h, doit_changer_mdp: false }))).then(maj => {
          EG.session.user = maj; base().audit('CHANGEMENT_MDP', 'users', maj.id, {}); U.toast('Mot de passe modifié.'); f();
        });
      });
    } })]);
  }
  function questionSecours() {
    const u = EG.session.user, actuelle = u.secours_question || '';
    const sel = el('select', { id: 'qs-q' }, [...QUESTIONS, 'Autre question (à écrire)…'].map(q => el('option', { value: q, text: q })));
    const autre = el('input', { type: 'text', id: 'qs-autre', placeholder: 'Votre question' });
    if (actuelle && QUESTIONS.indexOf(actuelle) < 0) { sel.value = 'Autre question (à écrire)…'; autre.value = actuelle; } else if (actuelle) sel.value = actuelle;
    const [b1, rep] = champ('qs-r', 'Réponse (les majuscules et les accents ne comptent pas)', 'text', { autocomplete: 'off' }), [b2, mdp] = champ('qs-m', 'Mot de passe actuel', 'password');
    U.modal('\uE032 Ma question de secours', el('div', {}, [
      el('p', { class: 'muet petit', text: 'En cas d’oubli du mot de passe, la bonne réponse permet d’en choisir un nouveau depuis l’écran de connexion (« Mot de passe oublié ? »).' }),
      el('div', { class: 'champ' }, [el('label', { for: 'qs-q', text: 'Question' }), sel]), el('div', { class: 'champ' }, [el('label', { for: 'qs-autre', text: 'Autre question (si choisie)' }), autre]), b1, b2
    ]), f => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: f }), el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
      const question = sel.value.indexOf('Autre question') === 0 ? autre.value.trim() : sel.value;
      if (question.length < 5 || normaliser(rep.value).length < 2) { U.toast('Choisissez une question et donnez une réponse.', 'danger'); return; }
      verifierActuel(mdp.value).then(cur => {
        if (!cur) { U.toast('Mot de passe actuel incorrect.', 'danger'); return; }
        return empreinteReponse(rep.value).then(h => base().put('users', Object.assign({}, cur, { secours_question: question, secours_hash: h }))).then(maj => {
          EG.session.user = maj; base().audit('QUESTION_SECOURS', 'users', maj.id, {}); U.toast('Question de secours enregistrée.'); f();
        });
      });
    } })]);
  }

  EG.MotDePasse = { dialogueOubli, changerMotDePasse, questionSecours, boutonRetour, retour, QUESTIONS };
})(window);
