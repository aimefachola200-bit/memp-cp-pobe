/* République du Bénin — MEMP — Choix faciles sur téléphone et référentiel des villages
   (même module dans MEMP-CP, CS Pobè / Mon école et ÉduGestion Pro ; conception : Maître Aimé FACHE)

   1. Référentiel national (data/referentiel_villages.json : 12 départements, 77 communes, 546 arrondissements,
      5 290 villages et quartiers de ville), chargé seulement quand un champ en a besoin, gardé hors ligne par le
      service worker. Les champs sont reconnus tout seuls (data-geo="departement|commune|arrondissement|village|lieu",
      sinon la liste, le nom ou le libellé du champ : « Arrondissement », « Ville / village », « Localité »,
      « Lieu de naissance », « Résidence »…) ; dans un même formulaire ils s'enchaînent :
      département → commune → arrondissement → village. Saisie libre toujours possible.
      Valeurs par défaut quand le formulaire n'a ni département ni commune : window.CHOIX_GEO_DEFAUT
      = { departement, commune } (CS Pobè : Plateau / Pobè).
   2. Sur écran tactile, les listes de suggestions (input list=…) et les longues listes déroulantes (plus de 12
      choix) s'ouvrent dans un panneau plein écran au-dessus du clavier : recherche en haut, résultats juste en
      dessous, gros boutons, « Utiliser ce que j'ai tapé », bouton Fermer ; la touche Retour du téléphone ferme.
      Sur ordinateur, rien ne change. */
(function (global) {
  'use strict';
  if (global.Choix) return;
  const doc = global.document;
  const scriptCourant = doc.currentScript;
  const URL_GEO = (scriptCourant && scriptCourant.dataset.geo) || 'data/referentiel_villages.json';
  const SEUIL_SELECT = 12;
  const tactile = () => !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches) && !global.CHOIX_DESACTIVE;
  const cle = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/^(DDEMP|DEPARTEMENT|COMMUNE)\s+(DE L'|DE LA|DU|DES|DE|D')?\s*/, '').replace(/[^A-Z0-9]/g, '');
  const sansAccent = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ------------------------------------------------------------------ référentiel */
  let promesse = null;
  function charger() {
    if (!promesse) {
      promesse = fetch(URL_GEO).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => {
        const G = { deps: [], communes: [], arr: {}, vil: {}, lieux: [] };
        j.d.forEach(d => {
          G.deps.push(d[0]);
          d[1].forEach(c => {
            G.communes.push({ nom: c[0], dep: d[0] });
            c[1].forEach(a => {
              (G.arr[c[0]] = G.arr[c[0]] || []).push(a[0]);
              a[1].forEach(v => { const o = { nom: v, arr: a[0], com: c[0], dep: d[0] }; (G.vil[c[0]] = G.vil[c[0]] || []).push(o); G.lieux.push(o); });
            });
          });
        });
        return G;
      }).catch(e => { promesse = null; throw e; });
    }
    return promesse;
  }

  /* Rôle géographique d'un champ (ou null) */
  function libelleDe(el) {
    let t = [el.dataset.geo, el.getAttribute('list'), el.name, el.id, el.dataset.k, el.dataset.cle, el.getAttribute('aria-label'), el.placeholder].join(' ');
    const lab = (el.id && doc.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label') || (el.parentElement && el.parentElement.querySelector(':scope > label, :scope > span'));
    if (lab && lab !== el) t += ' ' + lab.textContent;
    return sansAccent(t);
  }
  function role(el) {
    if (el.dataset.geo) return el.dataset.geo === 'aucun' ? null : el.dataset.geo;
    if (el.tagName !== 'INPUT' || !/^(text|search|)$/.test(el.type || '')) return null;   // lecture seule : compte pour la cascade
    if (el.dataset.geoRole !== undefined) return el.dataset.geoRole || null;
    const t = libelleDe(el);
    let r = null;
    if (/lieu.{0,4}naiss|lieunaiss|lieu_naiss|ne\(?e?\)? a\b|ville de naissance|residence|domicile|lieu d.habitation|habite a/.test(t)) r = 'lieu';
    else if (/arrondissement/.test(t)) r = 'arrondissement';
    else if (/village|localite|quartier|\bville\b/.test(t) && !/zone|ecole de la ville/.test(t)) r = 'village';
    else if (/\bcommune\b/.test(t)) r = 'commune';
    else if (/\bdepartement\b/.test(t) && !/direction|service|division/.test(t)) r = 'departement';
    el.dataset.geoRole = r || '';
    return r;
  }
  const groupeDe = (el) => el.closest('form, .dialog, .modal, .modal-contenu, .modal-content, fieldset, .card, .carte, section') || doc.body;
  function champs(groupe) {
    const ch = {};
    groupe.querySelectorAll('input, select').forEach(x => { const r = x.tagName === 'SELECT' ? (x.dataset.geo || null) : role(x); if (r) (ch[r] = ch[r] || []).push(x); });
    return ch;
  }
  function contexte(el, G) {
    const ch = champs(groupeDe(el)), def = global.CHOIX_GEO_DEFAUT || {};
    const val = (k) => ((ch[k] || []).find(x => x !== el && x.value) || {}).value || '';
    const dv = val('departement') || (ch.departement ? '' : def.departement || '');
    const dep = dv ? G.deps.find(d => cle(d) === cle(dv) || cle(dv).indexOf(cle(d)) >= 0) || null : null;
    const cv = val('commune') || (ch.commune ? '' : def.commune || '');
    const com = cv ? G.communes.find(c => cle(c.nom) === cle(cv)) || null : null;
    const av = val('arrondissement');
    return { ch, dep, com, arr: av };
  }
  /* Options proposées pour un champ géographique : [{ v, l }] */
  function optionsGeo(el, G) {
    const r = role(el), c = contexte(el, G);
    if (r === 'departement') return G.deps.map(d => ({ v: d }));
    if (r === 'commune') return G.communes.filter(x => !c.dep || x.dep === c.dep).map(x => ({ v: x.nom, l: c.dep ? '' : x.dep }));
    if (r === 'arrondissement') {
      if (c.com) return (G.arr[c.com.nom] || []).map(a => ({ v: a, l: c.com.nom }));
      return G.communes.filter(x => !c.dep || x.dep === c.dep).flatMap(x => (G.arr[x.nom] || []).map(a => ({ v: a, l: x.nom })));
    }
    if (r === 'village') {
      let lst = c.com ? (G.vil[c.com.nom] || []) : (c.dep ? G.lieux.filter(v => v.dep === c.dep) : G.lieux);
      if (c.arr) { const f = lst.filter(v => cle(v.arr) === cle(c.arr)); if (f.length) lst = f.concat(lst.filter(v => cle(v.arr) !== cle(c.arr))); }
      return lst.map(v => ({ v: v.nom, l: v.arr + (c.com ? '' : ', ' + v.com) }));
    }
    if (r === 'lieu') {
      const def = global.CHOIX_GEO_DEFAUT || {};
      const ici = def.commune ? cle(def.commune) : '';
      const communes = G.communes.map(x => ({ v: x.nom, l: 'Commune — ' + x.dep }));
      const vils = G.lieux.map(v => ({ v: v.nom + ' (' + v.com + ')', l: v.arr + ', ' + v.com, ici: ici && cle(v.com) === ici }));
      return vils.filter(x => x.ici).concat(communes, vils.filter(x => !x.ici));
    }
    return [];
  }
  /* Datalist du champ : référentiel en cascade + valeurs propres à l'application (liste d'origine) */
  function majDatalist(el, G) {
    const orig = el.dataset.listeOrigine && doc.getElementById(el.dataset.listeOrigine);
    const propres = orig ? [...orig.options].map(o => ({ v: o.value, l: o.label && o.label !== o.value ? o.label : '' })) : [];
    let dl = el._choixDl;
    if (!dl) {
      dl = doc.createElement('datalist'); dl.id = 'dl-choix-' + Math.random().toString(36).slice(2, 9);
      (el.form || doc.body).appendChild(dl); el._choixDl = dl;
    }
    const vus = new Set(), opts = [];
    propres.concat(optionsGeo(el, G)).forEach(o => { const k = cle(o.v); if (o.v && !vus.has(k)) { vus.add(k); opts.push(o); } });
    dl.replaceChildren(...opts.slice(0, 6000).map(o => { const op = doc.createElement('option'); op.value = o.v; if (o.l) op.label = o.l; return op; }));
    if (el.getAttribute('list') !== dl.id) el.setAttribute('list', dl.id);
    el.setAttribute('autocomplete', 'off');
    return opts;
  }
  function brancher(el) {
    if (el._choixGeo || el.readOnly || el.disabled) return;
    const r = role(el); if (!r) return;
    el._choixGeo = r;
    const l = el.getAttribute('list'); if (l && !/^dl-choix-/.test(l)) el.dataset.listeOrigine = l;
    const prep = () => charger().then(G => majDatalist(el, G)).catch(() => {});
    el.addEventListener('focus', prep);
    el.addEventListener('change', () => charger().then(G => apresChoix(el, G)).catch(() => {}));
    if (!el.getAttribute('list')) el.setAttribute('list', 'dl-choix-attente');   // le sélecteur tactile s'ouvre aussi pour ce champ
  }
  /* Choisir plus bas remplit les niveaux au-dessus s'ils sont vides ; choisir plus haut rafraîchit les listes */
  function apresChoix(el, G) {
    const r = el._choixGeo, c = contexte(el, G), v = el.value;
    const poser = (k, val) => (c.ch[k] || []).forEach(x => { if (x !== el && !x.value && x.tagName === 'INPUT') { x.value = val; x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true })); } });
    if (r === 'commune') { const com = G.communes.find(x => cle(x.nom) === cle(v)); if (com) { if (el.value !== com.nom) el.value = com.nom; poser('departement', com.dep); } }
    if (r === 'arrondissement') {
      const coms = Object.keys(G.arr).filter(k => G.arr[k].some(a => cle(a) === cle(v)));
      const com = c.com || (coms.length === 1 ? G.communes.find(x => x.nom === coms[0]) : null);
      if (com && !c.com) { poser('commune', com.nom); poser('departement', com.dep); }
    }
    if (r === 'village') {
      const lst = c.com ? (G.vil[c.com.nom] || []) : G.lieux, x = lst.find(y => cle(y.nom) === cle(v));
      if (x) { poser('arrondissement', x.arr); poser('commune', x.com); poser('departement', x.dep); }
    }
    ['departement', 'commune', 'arrondissement', 'village'].forEach(k => (c.ch[k] || []).forEach(x => { if (x !== el && x._choixDl) majDatalist(x, G); }));
  }
  function scanner(racine) {
    (racine.querySelectorAll ? racine : doc).querySelectorAll('input').forEach(x => { try { brancher(x); } catch (e) { /* champ ignoré */ } });
  }

  /* ------------------------------------------------------------------ sélecteur tactile */
  let ouvert = null;
  function style() {
    if (doc.getElementById('choix-style')) return;
    const s = doc.createElement('style'); s.id = 'choix-style';
    s.textContent = `
.choix-voile{position:fixed;inset:0;background:rgba(16,24,40,.45);z-index:2147483000}
.choix-panneau{position:fixed;left:0;right:0;top:0;height:100vh;background:#fff;color:#1D2939;display:flex;flex-direction:column;z-index:2147483001;font:16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 -4px 24px rgba(0,0,0,.2)}
.choix-tete{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #D0D5DD;background:#1F4E79;color:#fff}
.choix-tete b{flex:1;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.choix-tete button{background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:8px;min-width:44px;min-height:40px;font-size:15px;padding:0 12px}
.choix-cherche{padding:8px 12px;border-bottom:1px solid #EAECF0}
.choix-cherche input{width:100%;box-sizing:border-box;font-size:17px;padding:11px 12px;border:2px solid #2E6DA4;border-radius:10px;outline:none}
.choix-libre{margin:6px 12px 0;padding:11px 12px;border:1px dashed #2E6DA4;border-radius:10px;background:#EEF4FA;color:#1F4E79;font-weight:600;text-align:left;font-size:15px}
.choix-liste{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:4px 0 12px}
.choix-item{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #F2F4F7;padding:12px 14px;min-height:48px;font-size:16px;color:#1D2939}
.choix-item small{display:block;color:#667085;font-size:12.5px;margin-top:2px}
.choix-item.actuel{background:#EEF4FA;font-weight:600}
.choix-item:active{background:#DCE8F5}
.choix-vide{padding:16px;color:#667085}
.choix-plus{padding:10px 14px;color:#667085;font-size:13px}`;
    doc.head.appendChild(s);
  }
  function placer() {
    if (!ouvert) return;
    const vv = global.visualViewport;
    const h = vv ? vv.height : global.innerHeight, t = vv ? vv.offsetTop : 0;
    ouvert.panneau.style.top = t + 'px'; ouvert.panneau.style.height = h + 'px';
  }
  function libelleChamp(el) {
    const lab = (el.id && doc.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label') || (el.parentElement && el.parentElement.querySelector(':scope > label, :scope > span'));
    return ((lab && lab !== el && lab.textContent) || el.getAttribute('aria-label') || el.placeholder || el.name || 'Choisir').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  async function optionsDe(el) {
    if (el.tagName === 'SELECT') return [...el.options].filter(o => !o.disabled || o.value === '').map(o => ({ v: o.value, t: o.textContent.trim(), l: '' }));
    if (el._choixGeo) { try { const G = await charger(); return majDatalist(el, G).map(o => ({ v: o.v, t: o.v, l: o.l || '' })); } catch (e) { /* référentiel indisponible : liste de l'application */ } }
    const id = el.getAttribute('list'), dl = id && doc.getElementById(id);
    return dl ? [...dl.options].map(o => ({ v: o.value, t: o.value, l: o.label && o.label !== o.value ? o.label : '' })) : [];
  }
  function choisir(el, v) {
    if (el.value !== v) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function fermer(parRetour) {
    if (!ouvert) return;
    const o = ouvert; ouvert = null;
    o.voile.remove(); o.panneau.remove();
    if (global.visualViewport) { global.visualViewport.removeEventListener('resize', placer); global.visualViewport.removeEventListener('scroll', placer); }
    doc.documentElement.style.overflow = o.overflow;
    if (!parRetour && o.historique && history.state && history.state.choix) { o.ignorerRetour = true; history.back(); }
  }
  global.addEventListener('popstate', () => { if (ouvert) fermer(true); });
  async function ouvrir(el) {
    if (ouvert || el.disabled || el.readOnly) return;
    style();
    const estSelect = el.tagName === 'SELECT';
    const voile = doc.createElement('div'); voile.className = 'choix-voile';
    const panneau = doc.createElement('div'); panneau.className = 'choix-panneau'; panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-modal', 'true');
    const titre = libelleChamp(el);
    panneau.innerHTML = '<div class="choix-tete"><b></b><button type="button" class="choix-fermer" aria-label="Fermer">✕ Fermer</button></div>'
      + '<div class="choix-cherche"><input type="search" enterkeyhint="done" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Rechercher…" aria-label="Rechercher"></div>'
      + '<button type="button" class="choix-libre" hidden></button><div class="choix-liste" role="listbox"></div>';
    panneau.querySelector('b').textContent = titre;
    doc.body.append(voile, panneau);
    ouvert = { el, voile, panneau, overflow: doc.documentElement.style.overflow, historique: false };
    doc.documentElement.style.overflow = 'hidden';
    try { history.pushState(Object.assign({}, history.state || {}, { choix: 1 }), ''); ouvert.historique = true; } catch (e) { /* sans historique */ }
    placer();
    if (global.visualViewport) { global.visualViewport.addEventListener('resize', placer); global.visualViewport.addEventListener('scroll', placer); }
    const champ = panneau.querySelector('input'), liste = panneau.querySelector('.choix-liste'), libre = panneau.querySelector('.choix-libre');
    panneau.querySelector('.choix-fermer').onclick = () => fermer();
    voile.onclick = () => fermer();
    liste.innerHTML = '<div class="choix-vide">Chargement…</div>';
    const opts = await optionsDe(el);
    if (!ouvert || ouvert.el !== el) return;
    const actuel = el.value;
    champ.value = estSelect ? '' : (el.value || '');
    function dessiner() {
      const q = sansAccent(champ.value.trim());
      const res = q ? opts.filter(o => sansAccent(o.t + ' ' + o.l + ' ' + o.v).indexOf(q) >= 0) : opts;
      // les réponses qui commencent par la recherche d'abord
      if (q) res.sort((a, b) => (sansAccent(a.t).startsWith(q) ? 0 : 1) - (sansAccent(b.t).startsWith(q) ? 0 : 1));
      const max = 250;
      liste.replaceChildren();
      res.slice(0, max).forEach(o => {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'choix-item' + (o.v === actuel && actuel !== '' ? ' actuel' : '');
        b.setAttribute('role', 'option'); b.textContent = o.t || '—';
        if (o.l) { const s = doc.createElement('small'); s.textContent = o.l; b.appendChild(s); }
        b.onclick = () => { fermer(); choisir(el, o.v); };
        liste.appendChild(b);
      });
      if (!res.length) { const d = doc.createElement('div'); d.className = 'choix-vide'; d.textContent = estSelect ? 'Aucun choix ne correspond.' : 'Rien dans la liste : utilisez ce que vous avez tapé.'; liste.appendChild(d); }
      if (res.length > max) { const d = doc.createElement('div'); d.className = 'choix-plus'; d.textContent = (res.length - max) + ' autre(s) : précisez la recherche.'; liste.appendChild(d); }
      const t = champ.value.trim();
      libre.hidden = estSelect || !t || opts.some(o => o.v === t);
      libre.textContent = 'Utiliser « ' + t + ' »';
    }
    libre.onclick = () => { const t = champ.value.trim(); fermer(); choisir(el, t); };
    champ.addEventListener('input', dessiner);
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fermer();
      if (e.key === 'Enter') { e.preventDefault(); const p = liste.querySelector('.choix-item'); if (!estSelect && champ.value.trim() && (!p || sansAccent(p.textContent).indexOf(sansAccent(champ.value.trim())) !== 0)) libre.click(); else if (p) p.click(); }
    });
    dessiner();
    setTimeout(() => { if (ouvert && ouvert.el === el) champ.focus({ preventScroll: true }); }, 30);
  }
  const concerne = (el) => {
    if (!el || !el.tagName) return false;
    if (el.closest && el.closest('.choix-panneau, [data-choix="non"]')) return false;
    if (el.dataset && el.dataset.choix === 'non') return false;
    if (el.tagName === 'SELECT') return !el.multiple && el.options.length > SEUIL_SELECT;
    if (el.tagName === 'INPUT') return !!el.getAttribute('list') && /^(text|search|)$/.test(el.type || '') && !el.readOnly;
    return false;
  };
  function intercepter(e) {
    if (!tactile()) return;
    const el = e.target && e.target.closest ? e.target.closest('input, select') : null;
    if (!el) return;
    if (el.tagName === 'INPUT' && !el._choixGeo) brancher(el);
    if (!concerne(el)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type !== 'focusin') ouvrir(el);
    else { el.blur(); ouvrir(el); }
  }
  // un simple toucher ouvre le panneau ; faire glisser le doigt (défiler la page) ne l'ouvre pas
  let depart = null;
  const cible = (e) => { const el = e.target && e.target.closest ? e.target.closest('input, select') : null; if (el && el.tagName === 'INPUT' && !el._choixGeo) brancher(el); return el && concerne(el) ? el : null; };
  doc.addEventListener('touchstart', (e) => { const t = e.touches[0]; depart = tactile() && cible(e) && t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  doc.addEventListener('touchend', (e) => {
    if (!depart || !tactile()) return;
    const el = cible(e), t = e.changedTouches[0], d = depart; depart = null;
    if (!el || !t || Math.abs(t.clientX - d.x) > 10 || Math.abs(t.clientY - d.y) > 10) return;
    e.preventDefault(); e.stopPropagation(); ouvrir(el);
  }, { capture: true, passive: false });
  doc.addEventListener('mousedown', intercepter, true);
  doc.addEventListener('focusin', (e) => { if (tactile() && !ouvert && concerne(e.target)) intercepter(e); }, true);

  /* ------------------------------------------------------------------ branchement automatique */
  function demarrer() {
    scanner(doc);
    new MutationObserver((ms) => { ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.tagName === 'INPUT') brancher(n); else if (n.querySelector && n.querySelector('input')) scanner(n); } })); })
      .observe(doc.body, { childList: true, subtree: true });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', demarrer); else demarrer();

  global.Choix = { charger, ouvrir, fermer, scanner, role, optionsGeo: (el) => charger().then(G => optionsGeo(el, G)), cle };
})(window);
