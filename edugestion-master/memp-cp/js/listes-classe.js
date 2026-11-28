/* Listes de classe — accès rapide, lecture seule (Mon école, CS Pobè, ÉduGestion Pro / Master ; MEMP-CP : effectifs par cours).
   Moteur commun : choix du cours (CI … CM2, sections de maternelle) → de la classe (ou toutes les classes du cours) → liste
   (N° d'ordre, nom, prénoms, sexe, date et lieu de naissance, matricule / EducMaster, nouveau ou redoublant, contact du parent),
   effectifs G / F / T, recherche, tri, « Télécharger PDF », « Télécharger Excel », « Imprimer » (en-tête officiel).

   ListesClasse.monter(el, A) ; A = {
     app, annee: () => '2026-2027',
     ecoles: async () => [{ id, nom }],                       // périmètre du compte (une seule : pas de choix)
     cours: async (ecoleId) => ['CI', …],                       // cours proposés (dans l'ordre)
     charger: async (ecoleId) => ({ classes: [{ id, lib, cours: ['CI', 'CE1'] }], eleves: [{ id, nom, prenoms, sexe: 'G'|'F',
        dateNaiss, lieuNaiss, matricule, educmaster, statut: 'Nouveau'|'Redoublant'|'', contact, cours, classeId }] }),
     ouvrir: (eleveId) => …,                                    // fiche de l'élève (facultatif)
     entete: async (ecole) => html,                             // en-tête officiel des documents
     excel: async (nom, feuilles) => …,                         // feuilles = [{ nom, lignes, entete }] : liste lisible
     excelEducmaster?: async (ids, { ecole, cours, classe, nom }) => …,  // classeur au modèle d'importation d'EducMaster
     excelNotes?: async ({ ecole, cours, classeId, classes }) => …,      // modèle officiel des notes du primaire d'EducMaster
     excelAgents?: async ({ ecole }) => …,                                  // modèle officiel « Mes agents » d'EducMaster
     colonnes?: [[cle, libelle]]                                 // pour une liste d'effectifs (MEMP-CP) : colonnes propres
   } */
(function (global) {
  'use strict';
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const COURS_EP = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  const COLS = [['n', 'N°'], ['nom', 'Nom'], ['prenoms', 'Prénoms'], ['sexe', 'Sexe'], ['dateNaiss', 'Né(e) le'], ['lieuNaiss', 'Lieu de naissance'],
    ['matricule', 'Matricule / EducMaster'], ['statut', 'Nouveau / redoublant'], ['contact', 'Contact du parent']];
  const memo = {
    lire() { try { return JSON.parse(global.localStorage.getItem('listesClasse') || '{}') || {}; } catch (e) { return {}; } },
    ecrire(v) { try { global.localStorage.setItem('listesClasse', JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };
  const dateFr = (d) => { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(d); };
  const CSS = `
.lc{--lc-v:#006633;font-size:14px}
.lc-barre{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.lc-barre select,.lc-barre input{padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;background:#fff;color:#1f2937;min-height:40px;max-width:100%}
.lc-barre input[type=search]{flex:1 1 180px}
.lc-cours{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.lc-cours button{min-height:40px;min-width:52px;padding:6px 12px;border-radius:20px;border:1px solid var(--lc-v);background:#fff;color:var(--lc-v);font:inherit;font-weight:600;cursor:pointer}
.lc-cours button.on{background:var(--lc-v);color:#fff}
.lc-cours button small{font-weight:400;opacity:.8;margin-left:4px}
.lc-compte{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.lc-compte span{background:#f1f5f9;border-radius:8px;padding:6px 10px;color:#1f2937}
.lc-compte b{color:var(--lc-v)}
.lc-act{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.lc-act button{min-height:40px;padding:8px 12px;border-radius:8px;border:1px solid var(--lc-v);background:#fff;color:var(--lc-v);font:inherit;cursor:pointer}
.lc-act button.p{background:var(--lc-v);color:#fff}
.lc-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
.lc-t{border-collapse:collapse;width:100%;min-width:760px;color:#1f2937}
.lc-t th{position:sticky;top:0;background:#e8f3ec;color:#14532d;text-align:left;padding:8px;font-weight:600;cursor:pointer;white-space:nowrap;border-bottom:1px solid #cbd5e1}
.lc-t th[data-tri]::after{content:' \\2195';opacity:.35}
.lc-t th.asc::after{content:' \\2191';opacity:1}.lc-t th.desc::after{content:' \\2193';opacity:1}
.lc-t td{padding:7px 8px;border-bottom:1px solid #eef2f7;vertical-align:top}
.lc-t tbody tr{cursor:pointer}.lc-t tbody tr:hover{background:#f8fafc}
.lc-t td.c{text-align:center;width:44px}
.lc-vide{padding:16px;color:#64748b}
.lc-aide{color:#64748b;font-size:12.5px;margin:6px 0 0}
@media (prefers-color-scheme:dark){.lc-barre select,.lc-barre input{background:#0f172a;color:#e2e8f0;border-color:#334155}.lc-tw{background:#0f172a;border-color:#334155}.lc-t{color:#e2e8f0}.lc-t th{background:#14301f;color:#bbf7d0;border-color:#334155}.lc-t td{border-color:#1e293b}.lc-t tbody tr:hover{background:#111827}.lc-compte span{background:#1e293b;color:#e2e8f0}.lc-cours button,.lc-act button{background:#0f172a}}
@media (max-width:600px){.lc-barre select{flex:1 1 100%}}`;

  function h(tag, attrs, ...enfants) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v === null || v === undefined || v === false) return; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v); });
    enfants.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : String(c)); });
    return e;
  }

  async function monter(el, A) {
    if (!document.getElementById('lc-css')) document.head.append(h('style', { id: 'lc-css' }, CSS));
    el.textContent = '';
    const effectifs = !!A.colonnes;   // MEMP-CP : liste des écoles et de leurs effectifs pour un cours
    const cols = A.colonnes || COLS;
    const racine = h('div', { class: 'lc', 'data-lc': '' });
    el.append(racine);
    racine.append(h('div', { class: 'lc-vide' }, 'Chargement…'));
    const ecoles = (await A.ecoles()) || [];
    const m = memo.lire();
    const st = { ecole: ecoles.some(e => String(e.id) === String(m.ecole)) ? String(m.ecole) : (ecoles[0] ? String(ecoles[0].id) : ''), cours: m.cours || '', classe: '', q: '', tri: 'nom', sens: 1 };
    let donnees = { classes: [], eleves: [] }, coursListe = [];
    async function chargerEcole() {
      donnees = st.ecole || effectifs ? ((await A.charger(st.ecole)) || { classes: [], eleves: [] }) : { classes: [], eleves: [] };
      coursListe = (await A.cours(st.ecole)) || COURS_EP;
      if (!coursListe.includes(st.cours)) st.cours = coursListe.find(c => donnees.eleves.some(x => x.cours === c)) || coursListe[0] || '';
      if (st.classe && !donnees.classes.some(c => String(c.id) === st.classe && c.cours.includes(st.cours))) st.classe = '';
    }
    const ecoleCourante = () => ecoles.find(e => String(e.id) === st.ecole) || null;
    const classesDuCours = () => donnees.classes.filter(c => (c.cours || []).includes(st.cours));
    function liste() {
      const cl = st.classe ? donnees.classes.find(c => String(c.id) === st.classe) : null;
      // une classe jumelée ou multigrade réunit les élèves de tous ses cours ; sans classe choisie : tous les élèves du cours
      let l = donnees.eleves.filter(x => !cl ? x.cours === st.cours : (x.classeId ? String(x.classeId) === String(cl.id) : cl.cours.includes(x.cours)));
      if (st.q) { const q = norm(st.q); l = l.filter(x => norm([x.nom, x.prenoms, x.matricule, x.educmaster, x.lieuNaiss, x.contact].join(' ')).includes(q)); }
      const cle = st.tri;
      l = l.slice().sort((a, b) => {
        const va = cle === 'nom' ? norm(a.nom + ' ' + (a.prenoms || '')) : cle === 'dateNaiss' ? String(a.dateNaiss || '') : typeof a[cle] === 'number' ? a[cle] : norm(a[cle]);
        const vb = cle === 'nom' ? norm(b.nom + ' ' + (b.prenoms || '')) : cle === 'dateNaiss' ? String(b.dateNaiss || '') : typeof b[cle] === 'number' ? b[cle] : norm(b[cle]);
        return (va < vb ? -1 : va > vb ? 1 : 0) * st.sens || norm(a.nom + (a.prenoms || '')).localeCompare(norm(b.nom + (b.prenoms || '')));
      });
      return l;
    }
    const comptes = (l) => effectifs ? { G: l.reduce((s, x) => s + (+x.G || 0), 0), F: l.reduce((s, x) => s + (+x.F || 0), 0) } : { G: l.filter(x => x.sexe === 'G').length, F: l.filter(x => x.sexe === 'F').length };
    const libClasse = () => { const cl = st.classe ? donnees.classes.find(c => String(c.id) === st.classe) : null; return cl ? cl.lib : (classesDuCours().length > 1 ? 'toutes les classes du ' + st.cours : st.cours); };
    const valeur = (x, k, i) => k === 'n' ? i + 1 : k === 'dateNaiss' ? dateFr(x.dateNaiss) : k === 'matricule' ? [x.matricule, x.educmaster].filter(Boolean).filter((v, j, t) => t.indexOf(v) === j).join(' / ') : (x[k] == null ? '' : x[k]);
    function titreDoc() { const e = ecoleCourante(); return (effectifs ? 'EFFECTIFS PAR ÉCOLE — ' + st.cours : 'LISTE DE CLASSE — ' + libClasse()) + (e && !effectifs ? ' — ' + e.nom : ''); }
    function nomFichier() { const e = ecoleCourante(); return ('Liste_' + (effectifs ? 'effectifs_' + st.cours : libClasse()) + (e && !effectifs ? '_' + e.nom : '') + '_' + (A.annee ? A.annee() : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''); }

    async function documentHtml() {
      const l = liste(), c = comptes(l), e = ecoleCourante();
      const ent = A.entete ? (await A.entete(e)) || '' : '';
      const th = 'border:1px solid #333;padding:4px 5px;background:#e8f3ec;font-weight:bold;text-align:left;font-size:10pt';
      const td = 'border:1px solid #333;padding:3px 5px;font-size:10pt';
      return ent
        + '<div style="text-align:center;margin:8px 0 6px"><div style="font-weight:bold;font-size:13pt">' + ech(titreDoc()) + '</div>'
        + '<div style="font-size:10.5pt">Année scolaire ' + ech(A.annee ? A.annee() : '') + ' — effectif : ' + (c.G + c.F) + ' (' + c.G + ' garçon(s), ' + c.F + ' fille(s))</div></div>'
        + '<table style="border-collapse:collapse;width:100%"><thead><tr>' + cols.map(([, lib]) => '<th style="' + th + '">' + ech(lib) + '</th>').join('') + '</tr></thead><tbody>'
        + l.map((x, i) => '<tr>' + cols.map(([k]) => '<td style="' + td + (k === 'n' ? ';text-align:center' : '') + '">' + ech(valeur(x, k, i)) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table>'
        + '<div style="margin-top:10px;font-size:10pt">Arrêtée à ' + (effectifs ? l.length + ' école(s), ' + (c.G + c.F) + ' élève(s)' : (c.G + c.F) + ' élève(s)') + '. Éditée le ' + new Date().toLocaleDateString('fr-FR') + '.</div>';
    }
    async function sortie(mode) {
      if (!global.DocExport) { global.print(); return; }
      await global.DocExport.telecharger(mode, titreDoc(), await documentHtml(), mode === 'imprimer' ? null : nomFichier());
    }
    async function excel() {
      const l = liste(), c = comptes(l), e = ecoleCourante();
      const lignes = [[titreDoc()], ['Année scolaire ' + (A.annee ? A.annee() : '') + (e && !effectifs ? ' — ' + e.nom : '')], ['Garçons', c.G, 'Filles', c.F, 'Total', c.G + c.F], [],
        cols.map(([, lib]) => lib)].concat(l.map((x, i) => cols.map(([k]) => { const v = valeur(x, k, i); return typeof v === 'number' ? v : String(v); })));
      await A.excel(nomFichier(), [{ nom: (effectifs ? 'Effectifs ' : 'Liste ') + st.cours, lignes, entete: 5 }]);
    }

    /** Modèle d'importation d'EducMaster (fourni par l'application) pour les élèves affichés */
    async function excelEducmaster() {
      const l = liste(); if (!l.length) return;
      await A.excelEducmaster(l.map(x => x.id), { ecole: ecoleCourante(), cours: st.cours, classe: libClasse(), nom: 'EducMaster_' + nomFichier() });
    }
    function dessiner() {
      memo.ecrire({ ecole: st.ecole, cours: st.cours });
      racine.textContent = '';
      const barre = h('div', { class: 'lc-barre' });
      if (ecoles.length > 1) {
        const sE = h('select', { 'aria-label': 'École', 'data-lc': 'ecole', onchange: async () => { st.ecole = sE.value; st.classe = ''; await chargerEcole(); dessiner(); } },
          ecoles.map(e => h('option', { value: e.id, selected: String(e.id) === st.ecole }, e.nom)));
        barre.append(sE);
      }
      const cls = classesDuCours();
      if (!effectifs && cls.length) {
        const sC = h('select', { 'aria-label': 'Classe', 'data-lc': 'classe', onchange: () => { st.classe = sC.value; dessiner(); } },
          h('option', { value: '' }, cls.length > 1 ? 'Toutes les classes du ' + st.cours : 'Classe : ' + st.cours),
          cls.map(c => h('option', { value: c.id, selected: String(c.id) === st.classe }, c.lib)));
        barre.append(sC);
      }
      const q = h('input', { type: 'search', placeholder: effectifs ? 'Rechercher une école…' : 'Rechercher un élève (nom, matricule…)', value: st.q, 'aria-label': 'Rechercher', 'data-lc': 'recherche' });
      q.addEventListener('input', () => { st.q = q.value; corps(); });
      barre.append(q);
      const coursEl = h('div', { class: 'lc-cours', role: 'tablist', 'aria-label': 'Cours' }, coursListe.map(c => {
        const n = effectifs ? donnees.eleves.filter(x => x.cours === c).reduce((s, x) => s + (+x.G || 0) + (+x.F || 0), 0) : donnees.eleves.filter(x => x.cours === c).length;
        return h('button', { type: 'button', class: c === st.cours ? 'on' : '', 'data-cours': c, role: 'tab', 'aria-selected': c === st.cours ? 'true' : 'false', onclick: () => { st.cours = c; st.classe = ''; dessiner(); } }, c, h('small', null, String(n)));
      }));
      const compte = h('div', { class: 'lc-compte', 'data-lc': 'compte' });
      const act = h('div', { class: 'lc-act' },
        h('button', { type: 'button', class: 'p', 'data-lc': 'pdf', onclick: () => sortie('pdf') }, 'Télécharger PDF'),
        A.excelEducmaster ? h('button', { type: 'button', 'data-lc': 'excel-educmaster', title: 'Classeur au modèle d’importation d’EducMaster, à importer tel quel', onclick: () => excelEducmaster() }, 'Excel EducMaster (importation)') : null,
        A.excelNotes ? h('button', { type: 'button', 'data-lc': 'excel-notes', title: 'Classeur au modèle des notes d’EducMaster (importation), inchangé', onclick: () => A.excelNotes({ ecole: ecoleCourante(), cours: st.cours, classeId: st.classe, classes: classesDuCours() }) }, 'Excel EducMaster (notes)') : null,
        A.excelAgents ? h('button', { type: 'button', 'data-lc': 'excel-agents', title: 'Personnel en activité de l’école, modèle « Mes agents » d’EducMaster', onclick: () => A.excelAgents({ ecole: ecoleCourante() }) }, 'Excel EducMaster (agents)') : null,
        h('button', { type: 'button', 'data-lc': 'excel', onclick: () => excel() }, A.excelEducmaster ? 'Excel liste de classe (lisible)' : 'Télécharger Excel'),
        h('button', { type: 'button', 'data-lc': 'imprimer', onclick: () => sortie('imprimer') }, 'Imprimer'));
      const tw = h('div', { class: 'lc-tw' });
      racine.append(coursEl, barre, compte, act, tw,
        h('p', { class: 'lc-aide' }, effectifs ? 'Effectifs déclarés par école (fiches d’effectifs) ; touchez une école pour ouvrir sa fiche. Lecture seule.'
          : 'Lecture seule : les inscriptions se font dans la rubrique habituelle. Touchez un élève pour ouvrir sa fiche ; touchez un titre de colonne pour trier.'));
      function corps() {
        const l = liste(), c = comptes(l);
        compte.replaceChildren(h('span', null, effectifs ? 'Écoles : ' : 'Classe : ', h('b', null, effectifs ? String(l.length) : libClasse())),
          h('span', null, 'Garçons : ', h('b', null, String(c.G))), h('span', null, 'Filles : ', h('b', null, String(c.F))), h('span', null, 'Total : ', h('b', null, String(c.G + c.F))));
        if (!l.length) { tw.replaceChildren(h('div', { class: 'lc-vide' }, st.q ? 'Aucun résultat pour cette recherche.' : (effectifs ? 'Aucun effectif enregistré pour ce cours.' : 'Aucun élève inscrit dans cette classe.'))); return; }
        const tete = h('tr', null, cols.map(([k, lib]) => h('th', { 'data-tri': k === 'n' ? null : k, class: st.tri === k ? (st.sens > 0 ? 'asc' : 'desc') : null, scope: 'col',
          onclick: k === 'n' ? null : () => { if (st.tri === k) st.sens = -st.sens; else { st.tri = k; st.sens = 1; } corps(); } }, lib)));
        tw.replaceChildren(h('table', { class: 'lc-t' }, h('thead', null, tete), h('tbody', null, l.map((x, i) => h('tr', { 'data-id': x.id, tabindex: '0',
          onclick: () => A.ouvrir && A.ouvrir(x.id, x), onkeydown: (ev) => { if (ev.key === 'Enter' && A.ouvrir) A.ouvrir(x.id, x); } },
        cols.map(([k]) => h('td', { class: k === 'n' ? 'c' : null }, String(valeur(x, k, i)))))))));
      }
      corps();
      if (!ecoles.length && !effectifs) tw.replaceChildren(h('div', { class: 'lc-vide' }, 'Aucune école dans votre périmètre.'));
    }
    await chargerEcole();
    dessiner();
    return { etat: st, rafraichir: async () => { await chargerEcole(); dessiner(); } };
  }
  global.ListesClasse = { monter, COLS };
})(typeof window !== 'undefined' ? window : globalThis);
