/* République du Bénin — MEMP — Module « Bureaux UASCEP » (commun à CS Pobè, Mon école, MEMP-CP, DOSP, ÉduGestion)
   Membres et responsables des bureaux de l'UASCEP par école, unité pédagogique, zone pédagogique, circonscription
   scolaire et département (DDEMP) : ➕ ajouter, ✏️ modifier, 🗑 supprimer, ♻ réinitialiser (nouveau mandat, ancien bureau
   archivé), 🔁 renouvellement, synthèse, anciens bureaux, impression / PDF, Excel (export et import, mêmes colonnes dans
   toutes les applications — voir outils/uascep/spec.md).
   L'application hôte fournit un adaptateur : charger / enregistrer l'état, contexte (entités et droits), Excel, impression.
   Conception : Maître Aimé FACHE */
(function (global) {
  'use strict';
  if (global.UASCEP) return;

  const NIVEAUX = [['ECOLE', 'École'], ['UP', 'Unité pédagogique'], ['ZONE', 'Zone pédagogique'],
    ['CS', 'Circonscription scolaire'], ['DDEMP', 'Département (DDEMP)']];
  const LIB_NIVEAU = Object.fromEntries(NIVEAUX);
  const FONCTIONS = ['Président', 'Vice-président', 'Secrétaire général', 'Secrétaire général adjoint', 'Trésorier général',
    'Trésorier général adjoint', 'Commissaire aux comptes', 'Responsable sport', 'Responsable culture',
    'Responsable santé / hygiène', 'Responsable genre', 'Conseiller', 'Membre'];
  const QUALITES = ['Directeur', 'Directrice', 'Enseignant', 'Enseignante', 'CP', 'CCS', "Parent d'élève", 'Élève', 'Autre'];
  const COLONNES_MEMBRES = ['Niveau', 'Entité', "N° d'ordre", 'Nom', 'Prénoms', 'Sexe', 'École', 'UP', 'Zone pédagogique',
    'Nom du RUP', 'Fonction', 'Qualité', 'Contact', 'E-mail', "Date d'élection", 'Durée du mandat (ans)',
    'Date de fin de mandat', 'Statut du mandat', "Date d'installation", 'Observations'];
  const COLONNES_BUREAUX = ['Niveau', 'Entité', "Date d'élection", 'Durée du mandat (ans)', 'Date de fin de mandat',
    "Date d'installation", "Date de l'assemblée générale", "Lieu de l'assemblée générale", 'PV', 'Observations', 'Statut'];
  const DUREE_DEFAUT = 2, PREAVIS_JOURS = 90;

  /* ---------------- utilitaires ---------------- */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(9).forEach(c => { if (c === null || c === undefined || c === false) return; e.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  /** « 2026-10-27 », « 27/10/2026 », nombre de série Excel → ISO, sinon '' */
  function iso(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' || /^\d{4,5}(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v); if (n > 20000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return d.toISOString().slice(0, 10); }
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return '';
  }
  const fr = (d) => { const s = iso(d); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
  const auj = () => new Date().toISOString().slice(0, 10);
  function plusAns(d, n) {
    const s = iso(d); if (!s || !(+n > 0)) return '';
    const x = new Date(s + 'T12:00:00Z'); x.setUTCFullYear(x.getUTCFullYear() + Math.floor(+n)); x.setUTCDate(x.getUTCDate() - 1);
    const reste = (+n) - Math.floor(+n); if (reste) x.setUTCMonth(x.getUTCMonth() + Math.round(reste * 12));
    return x.toISOString().slice(0, 10);
  }
  /** Statut d'un mandat : [code, libellé] */
  function statutMandat(fin) {
    const f = iso(fin); if (!f) return ['nr', 'Date de fin non renseignée'];
    const j = (new Date(f) - new Date(auj())) / 86400000;
    if (j < 0) return ['expire', 'Expiré'];
    if (j <= PREAVIS_JOURS) return ['bientot', 'À renouveler'];
    return ['encours', 'En cours'];
  }
  const nomComplet = (m) => [String(m.nom || '').toUpperCase(), m.prenoms || ''].filter(Boolean).join(' ').trim();
  function niveauDe(v) {
    const n = norm(v); if (!n) return '';
    const direct = NIVEAUX.find(([c, l]) => norm(c) === n || norm(l) === n); if (direct) return direct[0];
    if (/^ecole|^epp|^em\b/.test(n)) return 'ECOLE';
    if (/unite|^up\b/.test(n)) return 'UP';
    if (/zone/.test(n)) return 'ZONE';
    if (/circonscription|^cs\b|commune/.test(n)) return 'CS';
    if (/ddemp|departement|direction/.test(n)) return 'DDEMP';
    return '';
  }

  /* ---------------- styles (préfixe uas-) ---------------- */
  function styles() {
    if (document.getElementById('uas-styles')) return;
    document.head.append(h('style', { id: 'uas-styles', text: `
      .uas,.uas-voile{--uas-bleu:#1F4E79;--uas-bord:#D0D5DD;--uas-gris:#667085}.uas{color:inherit}
      .uas h2.uas-titre{margin:0 0 4px;font-size:1.25rem}.uas .uas-sous{color:var(--uas-gris);margin:0 0 12px;font-size:.92rem}
      .uas-onglets{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
      .uas-onglet{border:1px solid var(--uas-bord);background:#fff;border-radius:999px;padding:7px 13px;cursor:pointer;font:inherit;font-size:.9rem}
      .uas-onglet.on{background:var(--uas-bleu);border-color:var(--uas-bleu);color:#fff;font-weight:600}
      .uas-barre{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:6px 0 10px}
      .uas-barre label{display:flex;flex-direction:column;gap:3px;font-size:.78rem;color:var(--uas-gris);font-weight:600;min-width:150px;flex:1 1 170px;max-width:320px}
      .uas-barre select,.uas-form input,.uas-form select,.uas-form textarea{font:inherit;padding:7px 9px;border:1px solid var(--uas-bord);border-radius:7px;background:#fff;width:100%;box-sizing:border-box}
      .uas-btn{border:1px solid var(--uas-bord);background:#fff;border-radius:7px;padding:7px 12px;cursor:pointer;font:inherit;font-size:.88rem;white-space:nowrap;color:inherit}
      .uas-btn:hover{border-color:var(--uas-bleu)}.uas-btn.p{background:var(--uas-bleu);border-color:var(--uas-bleu);color:#fff}
      .uas-btn.d{color:#B42318;border-color:#FDA29B}.uas-btn.s{padding:4px 8px;font-size:.8rem}
      .uas-btn:disabled{opacity:.45;cursor:not-allowed}
      .uas-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .uas-carte{background:#fff;border:1px solid var(--uas-bord);border-radius:10px;padding:12px 14px;margin:0 0 12px}
      .uas-carte h3{margin:0 0 6px;font-size:1rem}.uas-info{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:.88rem}
      .uas-info b{font-weight:600}.uas-vide{color:var(--uas-gris);font-style:italic;padding:10px 0}
      .uas-tw{overflow-x:auto;border:1px solid var(--uas-bord);border-radius:10px;background:#fff}
      .uas-t{border-collapse:collapse;width:100%;font-size:.86rem}
      .uas-t th{background:#F9FAFB;color:#475467;text-align:left;padding:7px 8px;border-bottom:1px solid var(--uas-bord);white-space:nowrap;font-size:.76rem;text-transform:uppercase;letter-spacing:.02em}
      .uas-t td{padding:6px 8px;border-bottom:1px solid #EAECF0;vertical-align:top}
      .uas-t td.c{text-align:center}.uas-t tr.tot td{font-weight:700;background:#F2F4F7}
      .uas-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.74rem;font-weight:600;white-space:nowrap}
      .uas-badge.encours{background:#ECFDF3;color:#067647}.uas-badge.bientot{background:#FFFAEB;color:#B54708}
      .uas-badge.expire{background:#FEF3F2;color:#B42318}.uas-badge.nr{background:#F2F4F7;color:#475467}
      .uas-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}
      .uas-voile{position:fixed;inset:0;background:rgba(16,24,40,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 10px;overflow:auto}
      .uas-dialogue{background:#fff;border-radius:12px;width:min(760px,100%);box-shadow:0 12px 40px rgba(0,0,0,.3);color:#1D2939}
      .uas-dialogue>header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--uas-bord);background:var(--uas-bleu);color:#fff;border-radius:12px 12px 0 0}
      .uas-dialogue>header h3{margin:0;font-size:1.02rem}.uas-dialogue>header button{background:none;border:0;color:#fff;font-size:1.3rem;cursor:pointer}
      .uas-dialogue .uas-corps{padding:14px 16px}.uas-dialogue footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--uas-bord)}
      .uas-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px 14px}
      .uas-form label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#344054}
      .uas-form label.large{grid-column:1/-1}.uas-aide{font-size:.78rem;color:var(--uas-gris);font-weight:400}
      .uas-rapport{max-height:240px;overflow:auto;font-size:.85rem;background:#F9FAFB;border:1px solid var(--uas-bord);border-radius:8px;padding:8px}
      .uas-apercu{border:1px solid var(--uas-bord);padding:14px;background:#fff;overflow-x:auto}
      #uas-impression{display:none}
      @media print{.uas-voile{display:none!important}body.uas-imprime>*:not(#uas-impression){display:none!important}body.uas-imprime #uas-impression{display:block!important}}
    ` }));
  }

  /* ---------------- boîte de dialogue ---------------- */
  function dialogue(titre, corps, boutons) {
    return new Promise(resolve => {
      let fini = false;
      const fermer = (v) => { if (fini) return; fini = true; voile.remove(); window.removeEventListener('keydown', echap); resolve(v); };
      const echap = (e) => { if (e.key === 'Escape') fermer(null); };
      const pied = h('footer', {}, (boutons || [{ l: 'Fermer' }]).map(b => h('button', {
        class: 'uas-btn' + (b.p ? ' p' : '') + (b.d ? ' d' : ''), type: 'button',
        onclick: async () => { if (b.action) { const r = await b.action(); if (r === false) return; fermer(r === undefined ? true : r); } else fermer(b.v === undefined ? null : b.v); }
      }, b.l)));
      const voile = h('div', { class: 'uas-voile', onclick: (e) => { if (e.target === voile) fermer(null); } },
        h('div', { class: 'uas-dialogue', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
          h('header', {}, h('h3', {}, titre), h('button', { type: 'button', 'aria-label': 'Fermer', onclick: () => fermer(null) }, '✕')),
          h('div', { class: 'uas-corps' }, corps), pied));
      document.body.append(voile); window.addEventListener('keydown', echap);
      const premier = voile.querySelector('input,select,textarea'); if (premier && !('ontouchstart' in window)) setTimeout(() => premier.focus(), 30);
    });
  }
  /** Impression par défaut (application sans aide à l'impression) : aperçu, puis impression du seul document. */
  function imprimerDefaut(titre, html) {
    const doc = h('div', { class: 'uas-apercu', html });
    dialogue(titre, doc, [{ l: 'Fermer' }, { l: '🖨️ Imprimer / PDF', p: true, action: () => {
      let zone = document.getElementById('uas-impression');
      if (!zone) { zone = h('div', { id: 'uas-impression' }); document.body.append(zone); }
      zone.innerHTML = html; document.body.classList.add('uas-imprime');
      const fin = () => { document.body.classList.remove('uas-imprime'); zone.innerHTML = ''; window.removeEventListener('afterprint', fin); };
      window.addEventListener('afterprint', fin); setTimeout(() => { window.print(); setTimeout(fin, 1500); }, 50);
      return false;
    } }]);
  }
  const confirmer = (titre, texte, libelle = 'Confirmer', danger = true) => dialogue(titre, h('p', {}, texte), [{ l: 'Annuler', v: false }, { l: libelle, d: danger, p: !danger, v: true }]);

  /* ---------------- conversion Excel (mêmes colonnes partout) ---------------- */
  function versLignes(etat, bureaux) {
    const parId = Object.fromEntries(etat.bureaux.map(b => [b.id, b]));
    const ids = new Set((bureaux || etat.bureaux.filter(b => b.statut !== 'archive')).map(b => b.id));
    const membres = etat.membres.filter(m => ids.has(m.bureauId)).sort((a, b) =>
      (NIVEAUX.findIndex(n => n[0] === parId[a.bureauId].niveau) - NIVEAUX.findIndex(n => n[0] === parId[b.bureauId].niveau))
      || String(parId[a.bureauId].entiteLib).localeCompare(String(parId[b.bureauId].entiteLib), 'fr') || (+a.ordre || 0) - (+b.ordre || 0));
    const lm = [COLONNES_MEMBRES].concat(membres.map(m => {
      const b = parId[m.bureauId], fin = m.dateFin || b.dateFin;
      return [LIB_NIVEAU[b.niveau], b.entiteLib, +m.ordre || '', String(m.nom || '').toUpperCase(), m.prenoms || '', m.sexe || '',
        m.ecole || '', m.up || '', m.zone || '', m.rup || '', m.fonction || '', m.qualite || '', m.contact || '', m.email || '',
        fr(m.dateElection || b.dateElection), m.duree || b.duree || '', fr(fin), statutMandat(fin)[1], fr(m.dateInstallation || b.dateInstallation), m.observations || ''];
    }));
    const lb = [COLONNES_BUREAUX].concat([...ids].map(id => parId[id]).map(b => [LIB_NIVEAU[b.niveau], b.entiteLib, fr(b.dateElection),
      b.duree || '', fr(b.dateFin), fr(b.dateInstallation), fr(b.agDate), b.agLieu || '', b.pv || '', b.observations || '', b.statut === 'archive' ? 'Archivé' : 'Actif']));
    return [{ nom: 'Membres UASCEP', lignes: lm, entete: 0 }, { nom: 'Bureaux', lignes: lb, entete: 0 }];
  }
  /** Lignes d'une feuille → objets selon l'en-tête (colonnes reconnues sans accents ni casse) */
  function objets(lignes) {
    const i0 = lignes.findIndex(l => (l || []).some(c => norm(c) === 'niveau') && (l || []).some(c => ['nom', 'entite'].includes(norm(c))));
    if (i0 < 0) return null;
    const tete = lignes[i0].map(norm);
    return lignes.slice(i0 + 1).map((l, k) => ({ _ligne: i0 + k + 2, ...Object.fromEntries(tete.map((t, j) => [t, l ? (l[j] == null ? '' : String(l[j]).trim()) : ''])) }))
      .filter(o => Object.keys(o).some(k => k !== '_ligne' && o[k] !== ''));
  }

  /* ---------------- montage ---------------- */
  async function monter(racine, A) {
    styles();
    const vide = { version: 1, bureaux: [], membres: [], fonctions: [] };
    let etat = Object.assign({}, vide, (await A.charger()) || {});
    ['bureaux', 'membres', 'fonctions'].forEach(k => { if (!Array.isArray(etat[k])) etat[k] = []; });
    if (A.migrer) { const e2 = await A.migrer(etat); if (e2) etat = e2; }
    let ctx = await A.contexte();
    const niveaux = NIVEAUX.filter(n => (ctx.niveaux || NIVEAUX.map(x => x[0])).includes(n[0]));
    const memo = A.memo || { get: () => null, set: () => {} };
    let onglet = memo.get('onglet') || (niveaux[0] || ['SYNTHESE'])[0];
    if (!niveaux.some(n => n[0] === onglet) && onglet !== 'SYNTHESE' && onglet !== 'ARCHIVES') onglet = (niveaux[0] || ['SYNTHESE'])[0];
    const filtres = { zone: memo.get('zone') || '', up: memo.get('up') || '', entite: {} };
    const sauver = async () => { etat.maj = new Date().toISOString(); await A.enregistrer(etat); };
    const toast = (m) => (A.toast ? A.toast(m) : null);
    const entites = (niv) => (ctx.entites[niv] || []);
    const entite = (niv, cle) => entites(niv).find(e => String(e.cle) === String(cle));
    const peut = (niv, cle) => !!(ctx.droits && ctx.droits.ecrire && ctx.droits.ecrire(niv, cle));
    const bureauActif = (niv, cle) => etat.bureaux.find(b => b.niveau === niv && String(b.entite) === String(cle) && b.statut !== 'archive');
    const membresDe = (b) => b ? etat.membres.filter(m => m.bureauId === b.id).sort((x, y) => (+x.ordre || 0) - (+y.ordre || 0)) : [];
    function assurerBureau(niv, cle) {
      let b = bureauActif(niv, cle);
      if (!b) {
        const e = entite(niv, cle) || { lib: cle };
        b = { id: uid(), niveau: niv, entite: String(cle), entiteLib: e.lib, dateElection: '', duree: DUREE_DEFAUT, dateFin: '', dateInstallation: '', agDate: '', agLieu: '', pv: '', observations: '', statut: 'actif', creeLe: auj() };
        etat.bureaux.push(b);
      }
      return b;
    }
    const fonctions = () => [...new Set(FONCTIONS.concat(etat.fonctions || [], etat.membres.map(m => m.fonction).filter(Boolean)))];
    /** Entités de l'onglet après filtres zone / UP */
    function entitesFiltrees(niv) {
      return entites(niv).filter(e => (!filtres.zone || niv === 'CS' || niv === 'DDEMP' || (niv === 'ZONE' ? String(e.cle) === filtres.zone : String(e.zone || '') === filtres.zone))
        && (!filtres.up || niv !== 'ECOLE' || norm(e.up) === norm(filtres.up)));
    }

    function dessiner() {
      racine.replaceChildren();
      const z = h('div', { class: 'uas' });
      // l'application hôte peut afficher elle-même le titre de la page (sansTitre)
      if (!A.sansTitre) z.append(h('h2', { class: 'uas-titre' }, 'Bureaux UASCEP'),
        h('p', { class: 'uas-sous' }, "Membres et responsables des bureaux de l'UASCEP par école, unité pédagogique, zone pédagogique, circonscription et département."));
      const tabs = niveaux.map(([c, l]) => [c, l]).concat([['SYNTHESE', 'Synthèse'], ['ARCHIVES', 'Anciens bureaux']]);
      z.append(h('div', { class: 'uas-onglets', role: 'tablist' }, tabs.map(([c, l]) => h('button', {
        class: 'uas-onglet' + (onglet === c ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': onglet === c ? 'true' : 'false',
        onclick: () => { onglet = c; memo.set('onglet', c); dessiner(); }
      }, l))));
      // outils communs : export / import / impression de l'ensemble
      z.append(h('div', { class: 'uas-actions' },
        h('button', { class: 'uas-btn', type: 'button', onclick: exporterTout }, '📊 Exporter (Excel)'),
        ctx.peutImporter === false ? null : h('button', { class: 'uas-btn', type: 'button', onclick: importer }, '📥 Importer (Excel)'),
        h('button', { class: 'uas-btn', type: 'button', onclick: () => imprimerListe(onglet) }, '🖨️ Imprimer / PDF')));
      if (onglet === 'SYNTHESE') z.append(synthese());
      else if (onglet === 'ARCHIVES') z.append(archives());
      else z.append(vueNiveau(onglet));
      racine.append(z);
    }

    function barreFiltres(niv) {
      const b = h('div', { class: 'uas-barre' });
      const zones = entites('ZONE');
      if (zones.length > 1 && niv !== 'CS' && niv !== 'DDEMP' && !ctx.fixe?.zone) {
        const s = h('select', { 'aria-label': 'Zone pédagogique', onchange: (e) => { filtres.zone = e.target.value; memo.set('zone', filtres.zone); filtres.up = ''; dessiner(); } },
          h('option', { value: '' }, 'Toutes les zones'), zones.map(x => h('option', { value: x.cle, selected: String(x.cle) === filtres.zone }, x.lib)));
        b.append(h('label', {}, 'Zone pédagogique', s));
      }
      if (niv === 'ECOLE') {
        const ups = entites('UP').filter(u => !filtres.zone || String(u.zone || '') === filtres.zone);
        if (ups.length > 1) {
          const s = h('select', { 'aria-label': 'Unité pédagogique', onchange: (e) => { filtres.up = e.target.value; memo.set('up', filtres.up); dessiner(); } },
            h('option', { value: '' }, 'Toutes les UP'), ups.map(u => h('option', { value: u.nomUp || u.lib, selected: norm(u.nomUp || u.lib) === norm(filtres.up) }, u.lib)));
          b.append(h('label', {}, 'Unité pédagogique', s));
        }
      }
      const liste = entitesFiltrees(niv);
      if (liste.length > 1) {
        const cur = filtres.entite[niv] || '';
        const s = h('select', { 'aria-label': LIB_NIVEAU[niv], onchange: (e) => { filtres.entite[niv] = e.target.value; dessiner(); } },
          h('option', { value: '' }, 'Tous (' + liste.length + ')'),
          liste.map(x => { const n = membresDe(bureauActif(niv, x.cle)).length; return h('option', { value: x.cle, selected: String(x.cle) === cur }, x.lib + (n ? ' — ' + n + ' membre(s)' : '')); }));
        b.append(h('label', {}, niv === 'ECOLE' ? 'École' : LIB_NIVEAU[niv], s));
      } else if (liste.length === 1) filtres.entite[niv] = String(liste[0].cle);
      return b;
    }

    function tableMembres(membres, avecEntite, ecrire) {
      if (!membres.length) return h('p', { class: 'uas-vide' }, 'Aucun membre enregistré.');
      const parId = Object.fromEntries(etat.bureaux.map(b => [b.id, b]));
      const cols = ["N° d'ordre"].concat(avecEntite ? ['Bureau'] : [], ['Nom et prénoms', 'Sexe', 'École', 'UP', 'Zone pédagogique', 'Nom du RUP', 'Fonction', 'Qualité', 'Contact', "Date d'élection", 'Date de fin de mandat', 'Statut']).concat(ecrire ? [''] : []);
      return h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
        h('tbody', {}, membres.map(m => {
          const b = parId[m.bureauId] || {}, fin = m.dateFin || b.dateFin, st = statutMandat(fin), w = ecrire && ecrire(b);
          return h('tr', {}, h('td', { class: 'c' }, m.ordre || ''), avecEntite ? h('td', {}, b.entiteLib || '') : null,
            h('td', {}, h('b', {}, String(m.nom || '').toUpperCase()), ' ', m.prenoms || ''), h('td', { class: 'c' }, m.sexe || ''),
            h('td', {}, m.ecole || ''), h('td', {}, m.up || ''), h('td', {}, m.zone || ''), h('td', {}, m.rup || ''),
            h('td', {}, m.fonction || ''), h('td', {}, m.qualite || ''), h('td', {}, m.contact || ''),
            h('td', {}, fr(m.dateElection || b.dateElection)), h('td', {}, fr(fin)), h('td', {}, h('span', { class: 'uas-badge ' + st[0] }, st[1])),
            ecrire ? h('td', { style: 'white-space:nowrap' }, w ? [
              h('button', { class: 'uas-btn s', type: 'button', title: 'Modifier', 'aria-label': 'Modifier ' + nomComplet(m), onclick: () => formMembre(b.niveau, b.entite, m) }, '✏️'), ' ',
              h('button', { class: 'uas-btn s d', type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer ' + nomComplet(m), onclick: () => supprimerMembre(m) }, '🗑')] : '') : null);
        }))));
    }

    function vueNiveau(niv) {
      const box = h('div', {});
      box.append(barreFiltres(niv));
      const liste = entitesFiltrees(niv);
      if (!liste.length) { box.append(h('p', { class: 'uas-vide' }, 'Aucune entité de ce niveau dans votre périmètre.')); return box; }
      const cle = filtres.entite[niv];
      const ecrireB = (b) => peut(b.niveau, b.entite);
      if (!cle) {
        // vue d'ensemble : tous les membres des bureaux de l'onglet
        const bs = liste.map(e => bureauActif(niv, e.cle)).filter(Boolean);
        const membres = bs.flatMap(membresDe);
        const ecrivables = liste.filter(e => peut(niv, e.cle));
        box.append(h('div', { class: 'uas-actions' },
          ecrivables.length ? h('button', { class: 'uas-btn p', type: 'button', onclick: () => choisirPuis(niv, liste, (c) => formMembre(niv, c)) }, '➕ Ajouter un membre') : null,
          ecrivables.length && bs.length ? h('button', { class: 'uas-btn d', type: 'button', onclick: () => reinitialiserTous(niv, bs.filter(ecrireB)) }, '♻ Réinitialiser tous les bureaux') : null));
        box.append(h('p', { class: 'uas-sous' }, `${bs.length} bureau(x) constitué(s) sur ${liste.length} — ${membres.length} membre(s). Choisissez ${niv === 'ECOLE' ? 'une école' : 'une entité'} ci-dessus pour gérer son bureau.`));
        box.append(tableMembres(membres, true, ecrireB));
        return box;
      }
      const e = entite(niv, cle) || { lib: cle };
      const b = bureauActif(niv, cle), w = peut(niv, cle), membres = membresDe(b);
      const st = b ? statutMandat(b.dateFin) : ['nr', 'Bureau non constitué'];
      box.append(h('div', { class: 'uas-carte' },
        h('h3', {}, `Bureau UASCEP — ${LIB_NIVEAU[niv]} : ${e.lib}`),
        h('div', { class: 'uas-info' },
          h('span', {}, h('b', {}, 'Élu le : '), fr(b && b.dateElection) || '—'),
          h('span', {}, h('b', {}, 'Mandat : '), b && b.duree ? b.duree + ' an(s)' : '—'),
          h('span', {}, h('b', {}, 'Fin : '), fr(b && b.dateFin) || '—'),
          h('span', {}, h('span', { class: 'uas-badge ' + st[0] }, st[1])),
          h('span', {}, h('b', {}, 'Installation : '), fr(b && b.dateInstallation) || '—'),
          h('span', {}, h('b', {}, 'Assemblée générale : '), [fr(b && b.agDate), b && b.agLieu].filter(Boolean).join(' — ') || '—'),
          b && b.pv ? h('span', {}, h('b', {}, 'PV : '), b.pv) : null,
          e.rup ? h('span', {}, h('b', {}, 'RUP : '), e.rup) : null),
        b && b.observations ? h('p', { class: 'uas-sous', style: 'margin:6px 0 0' }, b.observations) : null,
        h('div', { class: 'uas-actions' },
          w ? h('button', { class: 'uas-btn p', type: 'button', onclick: () => formMembre(niv, cle) }, '➕ Ajouter un membre') : null,
          w ? h('button', { class: 'uas-btn', type: 'button', onclick: () => formBureau(niv, cle) }, '✏️ Modifier le bureau') : null,
          w && b ? h('button', { class: 'uas-btn', type: 'button', onclick: () => renouveler(b) }, '🔁 Renouvellement') : null,
          w && b ? h('button', { class: 'uas-btn d', type: 'button', onclick: () => reinitialiser([b]) }, '♻ Réinitialiser') : null,
          h('button', { class: 'uas-btn', type: 'button', onclick: () => imprimerBureau(b, e, niv) }, '🖨️ Imprimer / PDF'),
          !w ? h('span', { class: 'uas-sous', style: 'margin:0;align-self:center' }, 'Consultation seulement.') : null)));
      box.append(tableMembres(membres, false, w ? () => true : null));
      return box;
    }

    function choisirPuis(niv, liste, suite) {
      const ok = liste.filter(e => peut(niv, e.cle));
      if (ok.length === 1) return suite(ok[0].cle);
      const s = h('select', {}, ok.map(e => h('option', { value: e.cle }, e.lib)));
      dialogue('Choisir ' + (niv === 'ECOLE' ? "l'école" : "l'entité"), h('div', { class: 'uas-form' }, h('label', { class: 'large' }, LIB_NIVEAU[niv], s)),
        [{ l: 'Annuler' }, { l: 'Continuer', p: true, action: () => { filtres.entite[niv] = s.value; dessiner(); setTimeout(() => suite(s.value), 0); } }]);
    }

    /* ---------- formulaires ---------- */
    function champ(lib, el, large, aide) { return h('label', { class: large ? 'large' : '' }, lib, el, aide ? h('span', { class: 'uas-aide' }, aide) : null); }
    function selectListe(valeurs, v, vide) {
      return h('select', {}, vide ? h('option', { value: '' }, vide) : null, valeurs.map(x => Array.isArray(x)
        ? h('option', { value: x[0], selected: x[0] === v }, x[1]) : h('option', { value: x, selected: x === v }, x)));
    }
    function formMembre(niv, cle, m) {
      if (!peut(niv, cle)) return;
      const e = entite(niv, cle) || { lib: cle }, b = bureauActif(niv, cle);
      const d = m || {}, nouveau = !m;
      const listeId = 'uas-fonctions-' + Math.random().toString(36).slice(2, 7);
      const f = {
        ordre: h('input', { type: 'number', min: '1', value: d.ordre || (membresDe(b).reduce((x, y) => Math.max(x, +y.ordre || 0), 0) + 1) }),
        nom: h('input', { value: d.nom || '', required: true, autocapitalize: 'characters' }),
        prenoms: h('input', { value: d.prenoms || '' }),
        sexe: selectListe([['M', 'Masculin'], ['F', 'Féminin']], d.sexe, '—'),
        fonction: h('input', { value: d.fonction || '', list: listeId }),
        qualite: selectListe(QUALITES, d.qualite, '—'),
        ecole: h('input', { value: d.ecole != null ? d.ecole : (e.ecole || '') }),
        up: h('input', { value: d.up != null ? d.up : (e.up || '') }),
        zone: h('input', { value: d.zone != null ? d.zone : (e.zone ? (entite('ZONE', e.zone) || { lib: e.zone }).lib : '') }),
        rup: h('input', { value: d.rup != null ? d.rup : (e.rup || '') }),
        contact: h('input', { value: d.contact || '', inputmode: 'tel' }),
        email: h('input', { value: d.email || '', type: 'email' }),
        dateElection: h('input', { type: 'date', value: iso(d.dateElection || (b && b.dateElection)) }),
        duree: h('input', { type: 'number', min: '0.5', step: '0.5', value: d.duree || (b && b.duree) || DUREE_DEFAUT }),
        dateFin: h('input', { type: 'date', value: iso(d.dateFin || (b && b.dateFin)) }),
        dateInstallation: h('input', { type: 'date', value: iso(d.dateInstallation || (b && b.dateInstallation)) }),
        observations: h('textarea', { rows: '2' }, d.observations || '')
      };
      let finManuelle = !!(d.dateFin && d.dateFin !== plusAns(d.dateElection, d.duree));
      const recalcul = () => { if (!finManuelle) f.dateFin.value = plusAns(f.dateElection.value, f.duree.value); };
      f.dateElection.addEventListener('change', recalcul); f.duree.addEventListener('input', recalcul);
      f.dateFin.addEventListener('change', () => { finManuelle = !!f.dateFin.value; });
      if (!f.dateFin.value) recalcul();
      const corps = h('div', {}, h('p', { class: 'uas-sous' }, `${LIB_NIVEAU[niv]} : ${e.lib}`),
        h('datalist', { id: listeId }, fonctions().map(x => h('option', { value: x }))),
        h('div', { class: 'uas-form' },
          champ("N° d'ordre", f.ordre), champ('Nom *', f.nom), champ('Prénoms', f.prenoms), champ('Sexe', f.sexe),
          champ('Fonction dans le bureau', f.fonction, false, 'Liste proposée ou saisie libre'), champ('Qualité', f.qualite),
          champ('École', f.ecole), champ('Unité pédagogique', f.up), champ('Zone pédagogique', f.zone), champ('Nom du RUP', f.rup),
          champ('Contact', f.contact), champ('E-mail', f.email), champ("Date d'élection", f.dateElection), champ('Durée du mandat (ans)', f.duree),
          champ('Date de fin de mandat', f.dateFin, false, 'Calculée, modifiable'), champ("Date d'installation", f.dateInstallation),
          champ('Observations', f.observations, true)));
      dialogue(nouveau ? 'Ajouter un membre' : 'Modifier un membre', corps, [{ l: 'Annuler' }, {
        l: '💾 Enregistrer', p: true, action: async () => {
          if (!f.nom.value.trim()) { f.nom.focus(); toast && toast('Le nom est obligatoire.'); return false; }
          const bu = assurerBureau(niv, cle);
          const v = { ordre: +f.ordre.value || '', nom: f.nom.value.trim().toUpperCase(), prenoms: f.prenoms.value.trim(), sexe: f.sexe.value,
            fonction: f.fonction.value.trim(), qualite: f.qualite.value, ecole: f.ecole.value.trim(), up: f.up.value.trim(), zone: f.zone.value.trim(),
            rup: f.rup.value.trim(), contact: f.contact.value.trim(), email: f.email.value.trim(), dateElection: f.dateElection.value,
            duree: +f.duree.value || '', dateFin: f.dateFin.value, dateInstallation: f.dateInstallation.value, observations: f.observations.value.trim() };
          if (v.fonction && !FONCTIONS.includes(v.fonction) && !(etat.fonctions || []).includes(v.fonction)) etat.fonctions.push(v.fonction);
          if (m) Object.assign(m, v, { maj: auj() }); else etat.membres.push(Object.assign({ id: uid(), bureauId: bu.id, cree: auj() }, v));
          // le bureau reprend les dates de mandat quand elles manquent
          if (!bu.dateElection && v.dateElection) { bu.dateElection = v.dateElection; bu.duree = v.duree || bu.duree; bu.dateFin = v.dateFin; }
          if (!bu.dateInstallation && v.dateInstallation) bu.dateInstallation = v.dateInstallation;
          await sauver(); toast && toast('Membre enregistré.'); dessiner();
        }
      }]);
    }
    function formBureau(niv, cle) {
      const e = entite(niv, cle) || { lib: cle }, b = bureauActif(niv, cle) || {};
      const f = { dateElection: h('input', { type: 'date', value: iso(b.dateElection) }), duree: h('input', { type: 'number', min: '0.5', step: '0.5', value: b.duree || DUREE_DEFAUT }),
        dateFin: h('input', { type: 'date', value: iso(b.dateFin) }), dateInstallation: h('input', { type: 'date', value: iso(b.dateInstallation) }),
        agDate: h('input', { type: 'date', value: iso(b.agDate) }), agLieu: h('input', { value: b.agLieu || '' }), pv: h('input', { value: b.pv || '', placeholder: 'Référence ou nom du fichier du PV' }),
        observations: h('textarea', { rows: '2' }, b.observations || ''), appliquer: h('input', { type: 'checkbox', checked: true }) };
      let finManuelle = !!(b.dateFin && b.dateFin !== plusAns(b.dateElection, b.duree));
      const recalcul = () => { if (!finManuelle) f.dateFin.value = plusAns(f.dateElection.value, f.duree.value); };
      f.dateElection.addEventListener('change', recalcul); f.duree.addEventListener('input', recalcul); f.dateFin.addEventListener('change', () => { finManuelle = !!f.dateFin.value; });
      dialogue('Bureau — ' + LIB_NIVEAU[niv] + ' : ' + e.lib, h('div', { class: 'uas-form' },
        champ("Date d'élection", f.dateElection), champ('Durée du mandat (ans)', f.duree), champ('Date de fin de mandat', f.dateFin, false, 'Calculée, modifiable'),
        champ("Date d'installation", f.dateInstallation), champ("Date de l'assemblée générale", f.agDate), champ("Lieu de l'assemblée générale", f.agLieu),
        champ('PV (référence)', f.pv), champ('Observations', f.observations, true),
        h('label', { class: 'large', style: 'flex-direction:row;align-items:center;gap:8px;font-weight:400' }, f.appliquer, 'Appliquer ces dates de mandat aux membres qui n’ont pas de date propre')),
      [{ l: 'Annuler' }, { l: '💾 Enregistrer', p: true, action: async () => {
        const bu = assurerBureau(niv, cle);
        Object.assign(bu, { dateElection: f.dateElection.value, duree: +f.duree.value || DUREE_DEFAUT, dateFin: f.dateFin.value, dateInstallation: f.dateInstallation.value,
          agDate: f.agDate.value, agLieu: f.agLieu.value.trim(), pv: f.pv.value.trim(), observations: f.observations.value.trim(), maj: auj() });
        if (f.appliquer.checked) membresDe(bu).forEach(m => { if (!m.dateElection) { m.dateElection = bu.dateElection; m.duree = bu.duree; m.dateFin = bu.dateFin; } if (!m.dateInstallation) m.dateInstallation = bu.dateInstallation; });
        await sauver(); toast && toast('Bureau enregistré.'); dessiner();
      } }]);
    }

    /* ---------- actions ---------- */
    async function supprimerMembre(m) {
      if (!(await confirmer('Supprimer un membre', `Supprimer ${nomComplet(m)} du bureau ?`, '🗑 Supprimer'))) return;
      etat.membres = etat.membres.filter(x => x.id !== m.id); await sauver(); toast && toast('Membre supprimé.'); dessiner();
    }
    async function reinitialiser(bs) {
      if (!bs.length) return;
      const archiver = h('input', { type: 'checkbox', checked: true });
      const ok = await dialogue('Réinitialiser ' + (bs.length > 1 ? bs.length + ' bureaux' : 'le bureau'), h('div', {},
        h('p', {}, bs.length > 1 ? `Les ${bs.length} bureaux seront vidés pour un nouveau mandat.` : `Le bureau « ${bs[0].entiteLib} » sera vidé pour un nouveau mandat.`),
        h('label', { style: 'display:flex;gap:8px;align-items:center' }, archiver, 'Garder l’ancien bureau dans « Anciens bureaux » (recommandé)')),
      [{ l: 'Annuler', v: false }, { l: '♻ Réinitialiser', d: true, v: true }]);
      if (!ok) return;
      const ids = new Set(bs.map(b => b.id));
      if (archiver.checked) etat.bureaux.forEach(b => { if (ids.has(b.id)) { b.statut = 'archive'; b.archiveLe = auj(); } });
      else { etat.bureaux = etat.bureaux.filter(b => !ids.has(b.id)); etat.membres = etat.membres.filter(m => !ids.has(m.bureauId)); }
      await sauver(); toast && toast('Bureau(x) réinitialisé(s).'); dessiner();
    }
    const reinitialiserTous = (niv, bs) => reinitialiser(bs);
    async function renouveler(b) {
      const d = h('input', { type: 'date', value: auj() }), du = h('input', { type: 'number', min: '0.5', step: '0.5', value: b.duree || DUREE_DEFAUT });
      const ok = await dialogue('Renouvellement du bureau', h('div', { class: 'uas-form' },
        h('p', { class: 'uas-sous large', style: 'grid-column:1/-1' }, "L'ancien bureau passe dans « Anciens bureaux » ; ses membres sont recopiés dans le nouveau, que vous pouvez ensuite modifier."),
        champ("Date d'élection du nouveau bureau", d), champ('Durée du mandat (ans)', du)), [{ l: 'Annuler', v: false }, { l: '🔁 Renouveler', p: true, v: true }]);
      if (!ok) return;
      const nb = Object.assign({}, b, { id: uid(), dateElection: d.value, duree: +du.value || DUREE_DEFAUT, dateFin: plusAns(d.value, du.value), dateInstallation: '', agDate: '', agLieu: '', pv: '', statut: 'actif', creeLe: auj(), archiveLe: undefined });
      const anciens = membresDe(b);
      b.statut = 'archive'; b.archiveLe = auj();
      etat.bureaux.push(nb);
      anciens.forEach(m => etat.membres.push(Object.assign({}, m, { id: uid(), bureauId: nb.id, dateElection: nb.dateElection, duree: nb.duree, dateFin: nb.dateFin, dateInstallation: '', cree: auj() })));
      await sauver(); toast && toast('Nouveau mandat créé.'); dessiner();
    }

    /* ---------- synthèse ---------- */
    function synthese() {
      const box = h('div', {}), actifs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite));
      const parNiv = niveaux.map(([c, l]) => {
        const bs = actifs.filter(b => b.niveau === c), ms = bs.flatMap(membresDe);
        return [l, entites(c).length, bs.length, ms.length, ms.filter(m => m.sexe === 'M').length, ms.filter(m => m.sexe === 'F').length,
          bs.filter(b => statutMandat(b.dateFin)[0] === 'expire').length, bs.filter(b => statutMandat(b.dateFin)[0] === 'bientot').length];
      });
      const tot = parNiv.reduce((s, r) => s.map((v, i) => i ? v + r[i] : 'Total'), ['Total', 0, 0, 0, 0, 0, 0, 0]);
      const tab = (cols, rows, total) => h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
        h('tbody', {}, rows.map(r => h('tr', {}, r.map((v, i) => h('td', { class: i ? 'c' : '' }, v)))), total ? h('tr', { class: 'tot' }, total.map((v, i) => h('td', { class: i ? 'c' : '' }, v))) : null)));
      box.append(h('div', { class: 'uas-carte' }, h('h3', {}, 'Bureaux et membres par niveau'),
        tab(['Niveau', 'Entités', 'Bureaux constitués', 'Membres', 'H', 'F', 'Mandats expirés', 'À renouveler'], parNiv, tot)));
      const fct = {}; actifs.flatMap(membresDe).forEach(m => { const k = m.fonction || '(non précisée)'; fct[k] = fct[k] || [0, 0, 0]; fct[k][2]++; if (m.sexe === 'M') fct[k][0]++; if (m.sexe === 'F') fct[k][1]++; });
      const ordreF = fonctions();
      box.append(h('div', { class: 'uas-carte' }, h('h3', {}, 'Membres par fonction et par sexe'),
        Object.keys(fct).length ? tab(['Fonction', 'H', 'F', 'Total'], Object.entries(fct).sort((a, b) => (ordreF.indexOf(a[0]) + 1 || 99) - (ordreF.indexOf(b[0]) + 1 || 99)).map(([k, v]) => [k, ...v])) : h('p', { class: 'uas-vide' }, 'Aucun membre.')));
      const alerte = actifs.filter(b => ['expire', 'bientot', 'nr'].includes(statutMandat(b.dateFin)[0]) && membresDe(b).length);
      box.append(h('div', { class: 'uas-carte' }, h('h3', {}, 'Mandats expirés, à renouveler ou sans date de fin'),
        alerte.length ? tab(['Bureau', 'Niveau', 'Élu le', 'Fin', 'Statut'], alerte.map(b => [b.entiteLib, LIB_NIVEAU[b.niveau], fr(b.dateElection) || '—', fr(b.dateFin) || '—', statutMandat(b.dateFin)[1]])) : h('p', { class: 'uas-vide' }, 'Aucun mandat à signaler.')));
      return box;
    }

    /* ---------- anciens bureaux ---------- */
    function archives() {
      const box = h('div', {});
      const bs = etat.bureaux.filter(b => b.statut === 'archive' && entite(b.niveau, b.entite)).sort((a, b) => String(b.archiveLe || '').localeCompare(String(a.archiveLe || '')));
      if (!bs.length) { box.append(h('p', { class: 'uas-vide' }, 'Aucun ancien bureau. Un bureau réinitialisé ou renouvelé y est conservé.')); return box; }
      box.append(h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, ['Niveau', 'Entité', 'Élu le', 'Fin du mandat', 'Archivé le', 'Membres', ''].map(c => h('th', {}, c)))),
        h('tbody', {}, bs.map(b => h('tr', {}, h('td', {}, LIB_NIVEAU[b.niveau]), h('td', {}, b.entiteLib), h('td', {}, fr(b.dateElection) || '—'), h('td', {}, fr(b.dateFin) || '—'),
          h('td', {}, fr(b.archiveLe) || '—'), h('td', { class: 'c' }, membresDe(b).length),
          h('td', { style: 'white-space:nowrap' },
            h('button', { class: 'uas-btn s', type: 'button', onclick: () => dialogue('Ancien bureau — ' + b.entiteLib, tableMembres(membresDe(b), false, null)) }, '👁 Voir'), ' ',
            peut(b.niveau, b.entite) && !bureauActif(b.niveau, b.entite) ? h('button', { class: 'uas-btn s', type: 'button', onclick: async () => { b.statut = 'actif'; delete b.archiveLe; await sauver(); dessiner(); } }, '↩ Restaurer') : null, ' ',
            peut(b.niveau, b.entite) ? h('button', { class: 'uas-btn s d', type: 'button', onclick: async () => {
              if (!(await confirmer('Supprimer un ancien bureau', `Supprimer définitivement l'ancien bureau « ${b.entiteLib} » et ses ${membresDe(b).length} membre(s) ?`, '🗑 Supprimer'))) return;
              etat.membres = etat.membres.filter(m => m.bureauId !== b.id); etat.bureaux = etat.bureaux.filter(x => x.id !== b.id); await sauver(); dessiner();
            } }, '🗑') : null)))))));
      return box;
    }

    /* ---------- impression ---------- */
    function tableHtml(membres, avecEntite) {
      const parId = Object.fromEntries(etat.bureaux.map(b => [b.id, b]));
      const cols = ['N°'].concat(avecEntite ? ['Bureau'] : [], ['Nom et prénoms', 'Sexe', 'École', 'UP', 'Zone', 'RUP', 'Fonction', 'Qualité', 'Contact', 'Élu(e) le', 'Fin du mandat']);
      return '<table class="uas-imp"><thead><tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
        + membres.map(m => { const b = parId[m.bureauId] || {}; return '<tr><td>' + esc(m.ordre || '') + '</td>' + (avecEntite ? '<td>' + esc(b.entiteLib) + '</td>' : '')
          + '<td><b>' + esc(String(m.nom || '').toUpperCase()) + '</b> ' + esc(m.prenoms || '') + '</td><td>' + esc(m.sexe || '') + '</td><td>' + esc(m.ecole || '') + '</td><td>' + esc(m.up || '')
          + '</td><td>' + esc(m.zone || '') + '</td><td>' + esc(m.rup || '') + '</td><td>' + esc(m.fonction || '') + '</td><td>' + esc(m.qualite || '') + '</td><td>' + esc(m.contact || '')
          + '</td><td>' + esc(fr(m.dateElection || b.dateElection)) + '</td><td>' + esc(fr(m.dateFin || b.dateFin)) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    const CSS_IMP = '<style>.uas-imp{border-collapse:collapse;width:100%;table-layout:fixed;font:8.5pt Arial,sans-serif}.uas-imp th,.uas-imp td{border:1px solid #555;padding:3px 4px;text-align:left;vertical-align:top;overflow-wrap:break-word;hyphens:auto}'
      + '.uas-imp th{background:#E8EEF5!important;color:#1D2939!important;font-weight:700;text-transform:none;letter-spacing:0;position:static}.uas-imp th:first-child{width:26px}.uas-sig{display:flex;justify-content:space-between;gap:20px;margin-top:26px;font:10pt Arial,sans-serif}.uas-sig div{flex:1;text-align:center;min-height:70px}'
      + 'h2.uas-it{font:bold 13pt Arial,sans-serif;text-align:center;margin:10px 0 4px;text-transform:uppercase}p.uas-ip{font:10pt Arial,sans-serif;margin:2px 0;text-align:center}</style>';
    function signatures(niv) {
      const sig = { ECOLE: ['Le Président du bureau', 'Le Directeur / La Directrice'], UP: ['Le Président du bureau', 'Le Responsable de l’UP'], ZONE: ['Le Président du bureau', 'Le Conseiller pédagogique'],
        CS: ['Le Président du bureau', 'Le Chef de la circonscription scolaire'], DDEMP: ['Le Président du bureau', 'Le Directeur départemental'] }[niv] || ['Le Président du bureau', 'Le Responsable'];
      return '<div class="uas-sig"><div>' + esc(sig[0]) + '</div><div>' + (ctx.lieu ? esc(ctx.lieu) + ', le ' + fr(auj()) + '<br>' : '') + esc(sig[1]) + '</div></div>';
    }
    function imprimerBureau(b, e, niv) {
      const corps = CSS_IMP + (A.entete ? A.entete() : '') + `<h2 class="uas-it">Bureau UASCEP — ${esc(LIB_NIVEAU[niv])} : ${esc(e.lib)}</h2>`
        + `<p class="uas-ip">Élu le ${esc(fr(b && b.dateElection) || '…………')} — mandat de ${esc(b && b.duree || DUREE_DEFAUT)} an(s), jusqu'au ${esc(fr(b && b.dateFin) || '…………')}`
        + (b && b.agLieu ? ' — assemblée générale : ' + esc([fr(b.agDate), b.agLieu].filter(Boolean).join(', ')) : '') + '</p>'
        + tableHtml(membresDe(b), false) + signatures(niv);
      (A.imprimer || imprimerDefaut)('Bureau UASCEP — ' + e.lib, corps);
    }
    function imprimerListe(onglet2) {
      const niv = NIVEAUX.some(n => n[0] === onglet2) ? onglet2 : null;
      const bs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite) && (!niv || (b.niveau === niv && entitesFiltrees(niv).some(e => String(e.cle) === String(b.entite)))));
      const membres = bs.flatMap(membresDe);
      if (!membres.length) { toast && toast('Aucun membre à imprimer.'); return; }
      const titre = 'Membres des bureaux UASCEP' + (niv ? ' — ' + LIB_NIVEAU[niv] : '');
      (A.imprimer || imprimerDefaut)(titre, CSS_IMP + (A.entete ? A.entete() : '') + `<h2 class="uas-it">${esc(titre)}</h2>` + tableHtml(membres, true) + signatures(niv || 'CS'));
    }

    /* ---------- Excel ---------- */
    async function exporterTout() {
      const bs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite));
      const blob = await A.xlsxEcrire(versLignes(etat, bs));
      A.telecharger('bureaux-uascep-' + auj() + '.xlsx', blob);
    }
    async function importer() {
      const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: 'display:none' });
      document.body.append(inp);
      inp.addEventListener('change', async () => {
        const fichier = inp.files && inp.files[0]; inp.remove(); if (!fichier) return;
        let feuilles;
        try { feuilles = await A.xlsxLire(fichier); } catch (e) { toast && toast('Fichier illisible : ' + (e.message || e)); return; }
        let lignesM = null, lignesB = null;
        feuilles.forEach(f => { const o = objets(f.lignes || []); if (!o) return; const k = Object.keys(o[0] || {}); if (k.includes('nom') || k.includes('prenoms')) lignesM = lignesM || o; else lignesB = lignesB || o; });
        if (!lignesM && !lignesB) { toast && toast('Colonnes « Niveau », « Entité », « Nom » introuvables.'); return; }
        const rejets = [], stats = { ajoutes: 0, maj: 0, bureaux: 0 };
        const trouverEntite = (niv, lib) => entites(niv).find(e => norm(e.lib) === norm(lib) || norm(e.cle) === norm(lib) || (e.alias || []).some(a => norm(a) === norm(lib)));
        const tmp = JSON.parse(JSON.stringify(etat));
        const actifTmp = (niv, cle) => tmp.bureaux.find(b => b.niveau === niv && String(b.entite) === String(cle) && b.statut !== 'archive');
        const assurerTmp = (niv, e) => { let b = actifTmp(niv, e.cle); if (!b) { b = { id: uid(), niveau: niv, entite: String(e.cle), entiteLib: e.lib, duree: DUREE_DEFAUT, statut: 'actif', creeLe: auj() }; tmp.bureaux.push(b); stats.bureaux++; } return b; };
        (lignesB || []).forEach(o => {
          const niv = niveauDe(o.niveau), e = niv && trouverEntite(niv, o.entite);
          if (!niv || !e) { rejets.push(`Bureaux, ligne ${o._ligne} : niveau ou entité inconnu (« ${o.niveau} » / « ${o.entite} »)`); return; }
          if (!peut(niv, e.cle)) { rejets.push(`Bureaux, ligne ${o._ligne} : « ${e.lib} » hors de votre périmètre`); return; }
          const b = assurerTmp(niv, e);
          Object.assign(b, { dateElection: iso(o['date d election']) || b.dateElection || '', duree: +String(o['duree du mandat ans'] || '').replace(',', '.') || b.duree || DUREE_DEFAUT,
            dateFin: iso(o['date de fin de mandat']) || b.dateFin || '', dateInstallation: iso(o['date d installation']) || b.dateInstallation || '',
            agDate: iso(o['date de l assemblee generale']) || b.agDate || '', agLieu: o['lieu de l assemblee generale'] || b.agLieu || '', pv: o.pv || b.pv || '', observations: o.observations || b.observations || '' });
          if (!b.dateFin && b.dateElection) b.dateFin = plusAns(b.dateElection, b.duree);
        });
        (lignesM || []).forEach(o => {
          const niv = niveauDe(o.niveau), e = niv && trouverEntite(niv, o.entite);
          if (!niv || !e) { rejets.push(`Membres, ligne ${o._ligne} : niveau ou entité inconnu (« ${o.niveau} » / « ${o.entite} »)`); return; }
          if (!o.nom) { rejets.push(`Membres, ligne ${o._ligne} : nom manquant`); return; }
          if (!peut(niv, e.cle)) { rejets.push(`Membres, ligne ${o._ligne} : « ${e.lib} » hors de votre périmètre`); return; }
          const b = assurerTmp(niv, e);
          const sx = /^f/i.test(o.sexe || '') ? 'F' : /^(m|h|g)/i.test(o.sexe || '') ? 'M' : '';
          const duree = +String(o['duree du mandat ans'] || '').replace(',', '.') || b.duree || DUREE_DEFAUT, el = iso(o['date d election']) || b.dateElection || '';
          const v = { ordre: +o['n d ordre'] || '', nom: String(o.nom).toUpperCase(), prenoms: o.prenoms || '', sexe: sx, ecole: o.ecole || e.ecole || '', up: o.up || e.up || '',
            zone: o['zone pedagogique'] || '', rup: o['nom du rup'] || e.rup || '', fonction: o.fonction || '', qualite: o.qualite || '', contact: o.contact || '', email: o['e mail'] || o.email || '',
            dateElection: el, duree, dateFin: iso(o['date de fin de mandat']) || plusAns(el, duree), dateInstallation: iso(o['date d installation']) || '', observations: o.observations || '' };
          const ex = tmp.membres.find(m => m.bureauId === b.id && norm(m.nom) === norm(v.nom) && norm(m.prenoms) === norm(v.prenoms));
          if (ex) { Object.assign(ex, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined))); stats.maj++; }
          else { if (!v.ordre) v.ordre = tmp.membres.filter(m => m.bureauId === b.id).reduce((x, y) => Math.max(x, +y.ordre || 0), 0) + 1; tmp.membres.push(Object.assign({ id: uid(), bureauId: b.id, cree: auj() }, v)); stats.ajoutes++; }
          if (!b.dateElection && v.dateElection) { b.dateElection = v.dateElection; b.duree = v.duree; b.dateFin = v.dateFin; }
        });
        const ok = await dialogue('Importer des bureaux UASCEP', h('div', {},
          h('p', {}, `${stats.ajoutes} membre(s) à ajouter, ${stats.maj} à mettre à jour, ${stats.bureaux} bureau(x) à créer.`),
          rejets.length ? [h('p', {}, h('b', {}, rejets.length + ' ligne(s) refusée(s) :')), h('div', { class: 'uas-rapport' }, rejets.map(r => h('div', {}, r)))] : null),
        [{ l: 'Annuler', v: false }, { l: '📥 Importer', p: true, v: true }]);
        if (!ok) return;
        etat = tmp; await sauver(); toast && toast('Import terminé.'); dessiner();
      });
      inp.click();
    }

    dessiner();
    return { rafraichir: async () => { ctx = await A.contexte(); dessiner(); }, etat: () => etat };
  }

  global.UASCEP = { monter, NIVEAUX, FONCTIONS, QUALITES, COLONNES_MEMBRES, COLONNES_BUREAUX, versLignes, objets, statutMandat, iso, fr, plusAns, niveauDe };
})(typeof window !== 'undefined' ? window : globalThis);
