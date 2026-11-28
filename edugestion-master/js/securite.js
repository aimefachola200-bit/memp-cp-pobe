/* Sécurité des comptes — commun à CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro Master / Master.
   - Mots de passe : règle de robustesse, refus des mots de passe de départ (admin123, ccs123…) ;
   - Connexion : blocage temporaire après plusieurs échecs (5 essais, puis 5 min, 10 min, 20 min… par identifiant et par appareil) ;
   - Inactivité : déconnexion automatique après N minutes sans action (avertissement 60 s avant).
   Aucune dépendance. API : window.Securite = { faible, regle, MOTS_DEPART, echec, reussite, blocage, texteBlocage, inactivite }.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.Securite) return;
  const MOTS_DEPART = ['admin123', 'admin', 'ccs123', 'cp123', 'dosp123', 'ddemp123', 'directeur123', 'enseignant123', 'ecole123', 'cs123',
    '123456', '1234567', '12345678', '123456789', '000000', 'password', 'motdepasse', 'azerty', 'azerty123', 'qwerty', 'benin123', 'pobe123'];
  const norm = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const regle = 'Au moins 8 caractères, avec des lettres et des chiffres ; ni un mot de passe de départ (admin123…), ni votre identifiant.';

  /** Raison du refus, ou '' si le mot de passe convient */
  function faible(mdp, identifiant) {
    const m = String(mdp || '');
    if (m.length < 8) return 'Choisissez au moins 8 caractères.';
    if (!/[A-Za-zÀ-ÿ]/.test(m) || !/[0-9]/.test(m)) return 'Mélangez des lettres et des chiffres.';
    const n = norm(m);
    if (MOTS_DEPART.indexOf(n) >= 0) return 'Ce mot de passe est un mot de passe de départ, connu de tous : choisissez-en un autre.';
    if (identifiant && (n === norm(identifiant) || n.indexOf(norm(identifiant)) >= 0 && norm(identifiant).length >= 4)) return 'Le mot de passe ne doit pas reprendre votre identifiant.';
    if (/^(.)\1+$/.test(m) || /^(0123456789|1234567890|abcdefgh)/i.test(m)) return 'Évitez les suites et les répétitions de caractères.';
    return '';
  }
  /** Vrai si le mot de passe saisi à la connexion est un mot de passe de départ (changement obligatoire) */
  const deDepart = (mdp) => MOTS_DEPART.indexOf(norm(mdp)) >= 0;

  /* ---------------- blocage après échecs ---------------- */
  const SEUIL = 5, BASE_MS = 5 * 60 * 1000;
  const cle = (app, ident) => 'secu:' + (app || 'app') + ':' + norm(ident);
  const lire = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || { n: 0, palier: 0, jusqua: 0 }; } catch (e) { return { n: 0, palier: 0, jusqua: 0 }; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  /** Millisecondes restantes de blocage (0 si libre) */
  function blocage(app, ident) { const v = lire(cle(app, ident)); return Math.max(0, (v.jusqua || 0) - Date.now()); }
  /** Enregistre un échec ; rend { bloqueMs, restants } */
  function echec(app, ident) {
    const k = cle(app, ident), v = lire(k);
    v.n = (v.n || 0) + 1;
    let bloqueMs = 0;
    if (v.n >= SEUIL) { bloqueMs = BASE_MS * Math.pow(2, v.palier || 0); v.jusqua = Date.now() + bloqueMs; v.palier = Math.min((v.palier || 0) + 1, 5); v.n = 0; }
    ecrire(k, v);
    return { bloqueMs, restants: bloqueMs ? 0 : SEUIL - v.n };
  }
  function reussite(app, ident) { try { localStorage.removeItem(cle(app, ident)); } catch (e) { /* rien */ } }
  function texteBlocage(ms) {
    const min = Math.ceil(ms / 60000);
    return 'Trop d’essais incorrects : ce compte est bloqué sur cet appareil pendant ' + min + ' minute' + (min > 1 ? 's' : '') + '. Réessayez plus tard, ou demandez une réinitialisation à l’administrateur.';
  }

  /* ---------------- déconnexion après inactivité ---------------- */
  let minuteur = null, alerteT = null, bandeau = null, actif = null;
  /** Lance la surveillance : minutes sans action avant fin(), averti 60 s avant. Rend une fonction d'arrêt. */
  function inactivite(minutes, fin) {
    arreter();
    const ms = Math.max(0.01, +minutes || 20) * 60000;
    const relancer = () => {
      clearTimeout(minuteur); clearTimeout(alerteT);
      if (bandeau) { bandeau.remove(); bandeau = null; }
      alerteT = setTimeout(() => {
        bandeau = document.createElement('div');
        bandeau.setAttribute('role', 'alert');
        bandeau.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:520px;margin:0 auto;background:#B42318;color:#fff;border-radius:12px;padding:12px 14px;font:15px/1.4 system-ui,Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
        bandeau.textContent = 'Pour protéger les données, vous serez déconnecté dans une minute faute d’activité. Touchez l’écran pour rester connecté.';
        document.body.append(bandeau);
      }, Math.max(0, ms - 60000));
      minuteur = setTimeout(() => { arreter(); try { fin(); } catch (e) { /* rien */ } }, ms);
    };
    actif = () => relancer();
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => document.addEventListener(t, actif, { passive: true, capture: true }));
    relancer();
    return arreter;
  }
  function arreter() {
    clearTimeout(minuteur); clearTimeout(alerteT);
    if (bandeau) { bandeau.remove(); bandeau = null; }
    if (actif) ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => document.removeEventListener(t, actif, { capture: true }));
    actif = null;
  }

  /* ---------------- verrou d'application (applications sans comptes : CS Pobè, Mon école) ----------------
     Mot de passe d'accès de l'appareil, demandé à l'ouverture et après 20 minutes sans action. Empreinte SHA-256 salée,
     gardée dans le stockage local de l'application ; blocage temporaire après 5 essais. */
  async function empreinte(sel, mdp) {
    const t = new TextEncoder().encode(sel + '|' + mdp);
    if (global.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', t); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 2166136261; for (const x of t) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16);
  }
  function verrou(o) {
    o = Object.assign({ app: 'app', titre: 'Application', couleur: '#1F4E79', minutes: 20 }, o || {});
    const K = 'verrou:' + o.app;
    const lireV = () => { try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { return null; } };
    let ouvert = false, stop = null;
    const actif = () => !!(lireV() || {}).h;
    async function definir(mdp) {
      const f = faible(mdp, ''); if (f) throw new Error(f);
      const sel = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(K, JSON.stringify({ s: sel, h: await empreinte(sel, mdp), le: new Date().toISOString() }));
      demarrerVeille();
    }
    function retirer() { localStorage.removeItem(K); if (stop) stop(); stop = null; }
    async function controler(mdp) { const v = lireV(); return !!v && (await empreinte(v.s, mdp)) === v.h; }
    function demarrerVeille() { if (stop) stop(); stop = actif() ? inactivite(o.minutes, () => verrouiller()) : null; }
    function verrouiller() {
      if (!actif() || ouvert) return Promise.resolve();
      ouvert = true;
      return new Promise(res => {
        const ov = document.createElement('div');
        ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Application verrouillée'); ov.dataset.verrou = '1';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:' + o.couleur + ';display:flex;align-items:center;justify-content:center;padding:16px;font:16px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif';
        ov.innerHTML = '<form style="background:#fff;color:#1D2939;border-radius:14px;padding:20px;width:min(380px,100%);box-shadow:0 10px 40px rgba(0,0,0,.3)">'
          + '<h2 style="margin:0 0 4px;font-size:1.15rem">' + o.titre.replace(/[<>&]/g, '') + '</h2><p style="margin:0 0 12px;color:#475467;font-size:.9rem">Application verrouillée. Saisissez le mot de passe d’accès de cet appareil.</p>'
          + '<input type="password" autocomplete="current-password" aria-label="Mot de passe d’accès" style="width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #D0D5DD;border-radius:8px;min-height:44px">'
          + '<p data-err style="color:#B42318;min-height:1.3em;margin:8px 0;font-size:.88rem"></p>'
          + '<button type="submit" style="width:100%;min-height:44px;border:0;border-radius:8px;background:' + o.couleur + ';color:#fff;font:inherit;font-weight:700;cursor:pointer">Déverrouiller</button>'
          + '<p style="margin:12px 0 0;color:#667085;font-size:.78rem">Mot de passe oublié : seule une restauration de sauvegarde sur un appareil réinstallé permet de reprendre les données.</p></form>';
        document.body.append(ov);
        const f = ov.querySelector('form'), i = f.querySelector('input'), e = f.querySelector('[data-err]');
        setTimeout(() => i.focus(), 50);
        f.addEventListener('submit', async (ev) => {
          ev.preventDefault(); e.textContent = '';
          const reste = blocage(o.app, 'verrou'); if (reste) { e.textContent = texteBlocage(reste); return; }
          if (await controler(i.value)) { reussite(o.app, 'verrou'); ov.remove(); ouvert = false; demarrerVeille(); res(); return; }
          const r = echec(o.app, 'verrou'); i.value = '';
          e.textContent = r.bloqueMs ? texteBlocage(r.bloqueMs) : 'Mot de passe incorrect.' + (r.restants <= 3 ? ' Encore ' + r.restants + ' essai(s).' : '');
        });
      });
    }
    /** À l'ouverture : verrouille si un mot de passe est défini, puis surveille l'inactivité */
    function demarrer() { const p = verrouiller(); demarrerVeille(); return p; }
    /** Fenêtre de réglage (définir, changer, retirer) ; rend une promesse résolue à la fermeture */
    function regler() {
      return new Promise(res => {
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483500;background:rgba(16,24,40,.55);display:flex;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto;font:15px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif';
        const a = actif();
        ov.innerHTML = '<form style="background:#fff;color:#1D2939;border-radius:12px;padding:18px;width:min(440px,100%)">'
          + '<h2 style="margin:0 0 6px;font-size:1.1rem">Mot de passe d’accès à l’application</h2>'
          + '<p style="margin:0 0 10px;color:#475467;font-size:.88rem">Il est demandé à l’ouverture de l’application et après ' + o.minutes + ' minutes sans action. ' + regle + '</p>'
          + (a ? '<label style="display:block;font-size:.85rem;font-weight:600;margin:6px 0 2px">Mot de passe actuel</label><input data-k="a" type="password" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #D0D5DD;border-radius:8px;font:inherit">' : '')
          + '<label style="display:block;font-size:.85rem;font-weight:600;margin:6px 0 2px">Nouveau mot de passe</label><input data-k="n1" type="password" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #D0D5DD;border-radius:8px;font:inherit">'
          + '<label style="display:block;font-size:.85rem;font-weight:600;margin:6px 0 2px">Confirmation</label><input data-k="n2" type="password" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #D0D5DD;border-radius:8px;font:inherit">'
          + '<p data-err style="color:#B42318;min-height:1.2em;margin:8px 0;font-size:.85rem"></p>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">'
          + (a ? '<button type="button" data-act="retirer" style="min-height:40px;padding:0 12px;border:1px solid #FDA29B;color:#B42318;background:#fff;border-radius:8px;font:inherit;cursor:pointer">Retirer le mot de passe</button>' : '')
          + '<button type="button" data-act="fermer" style="min-height:40px;padding:0 12px;border:1px solid #D0D5DD;background:#fff;border-radius:8px;font:inherit;cursor:pointer">Fermer</button>'
          + '<button type="submit" style="min-height:40px;padding:0 14px;border:0;background:' + o.couleur + ';color:#fff;border-radius:8px;font:inherit;font-weight:700;cursor:pointer">Enregistrer</button></div></form>';
        document.body.append(ov);
        const f = ov.querySelector('form'), e = f.querySelector('[data-err]'), v = (k) => (f.querySelector('[data-k="' + k + '"]') || {}).value || '';
        const fin = (x) => { ov.remove(); res(x); };
        f.querySelector('[data-act="fermer"]').onclick = () => fin(false);
        const r = f.querySelector('[data-act="retirer"]');
        if (r) r.onclick = async () => { if (!(await controler(v('a')))) { e.textContent = 'Mot de passe actuel incorrect.'; return; } retirer(); fin(true); };
        f.addEventListener('submit', async (ev) => {
          ev.preventDefault(); e.textContent = '';
          if (a && !(await controler(v('a')))) { e.textContent = 'Mot de passe actuel incorrect.'; return; }
          if (v('n1') !== v('n2')) { e.textContent = 'Les deux saisies ne sont pas identiques.'; return; }
          try { await definir(v('n1')); fin(true); } catch (x) { e.textContent = x.message; }
        });
      });
    }
    return { actif, definir, retirer, controler, verrouiller, demarrer, regler };
  }

  global.Securite = { faible, deDepart, regle, MOTS_DEPART, echec, reussite, blocage, texteBlocage, inactivite, arreterInactivite: arreter, verrou };
})(typeof window !== 'undefined' ? window : globalThis);
