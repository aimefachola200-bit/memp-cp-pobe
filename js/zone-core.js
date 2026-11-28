/* Zone déshéritée — noyau commun aux applications MEMP-CP / DOSP, Mon école Bénin et EduGestion Pro.
   Agents des postes « orange » et « rouge » : prime de zone, rendement / gratification, banque. Liste par école (nom de l'école en tête,
   nombre d'ayants droit en bas, total général), montants fixés une fois par couleur, saisie à la main ou import Excel, impression et Excel.
   Chaque application fournit un adaptateur (données, écoles, Excel, impression) : voir ZoneDesheritee.monter.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.ZoneDesheritee) return;
  const COULEURS = ['Orange', 'Rouge'];
  const STATUTS = ['Fonctionnaire (APE)', 'Contractuel de l’État', 'ACE', 'Agent communal', 'Enseignant communautaire', 'Autre'];
  const FONCTIONS = ['Directeur', 'Autre'];
  const COLONNES = ['Matricule', 'Nom', 'Prénoms', 'Statut', 'Poste actuel', 'Poste déshérité', 'Rendement / Gratification', 'Prime de zone', 'Code banque', 'Banque', 'N° de compte', 'Fonction', 'Observation'];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nb = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(/\s| | /g, '').replace(',', '.')); return isFinite(x) ? Math.round(x) : 0; };
  const fcfa = (v) => (Math.round(v) || 0).toLocaleString('fr-FR').replace(/ /g, ' ');
  const vide = () => ({ agents: [], baremes: { Orange: { rendement: 0, prime: 0 }, Rouge: { rendement: 0, prime: 0 } } });

  function normaliser(e) {
    const o = Object.assign(vide(), e || {});
    if (!Array.isArray(o.agents)) o.agents = [];
    o.baremes = Object.assign(vide().baremes, o.baremes || {});
    return o;
  }
  /** Ayants droit rangés par école (alphabétique), directeur en tête dans chaque école ; totaux par école et général. */
  function grouper(agents, filtre) {
    const f = filtre || {}, par = {};
    agents.filter(a => (!f.couleur || a.couleur === f.couleur) && (!f.ecole || a.ecole === f.ecole)).forEach(a => { (par[a.ecole || '(École non précisée)'] = par[a.ecole || '(École non précisée)'] || []).push(a); });
    const cmp = (x, y) => String(x).localeCompare(String(y), 'fr');
    const groupes = Object.keys(par).sort(cmp).map(nom => {
      const ag = par[nom].slice().sort((a, b) => (a.fonction === 'Directeur' ? 0 : 1) - (b.fonction === 'Directeur' ? 0 : 1) || cmp(a.nom, b.nom) || cmp(a.prenoms, b.prenoms));
      return { ecole: nom, agents: ag, n: ag.filter(a => COULEURS.indexOf(a.couleur) >= 0).length || ag.length, rendement: ag.reduce((s, a) => s + nb(a.rendement), 0), prime: ag.reduce((s, a) => s + nb(a.prime), 0) };
    });
    return { groupes, total: { ecoles: groupes.length, n: groupes.reduce((s, g) => s + g.n, 0), rendement: groupes.reduce((s, g) => s + g.rendement, 0), prime: groupes.reduce((s, g) => s + g.prime, 0) } };
  }
  const ligne = (i, a) => [i, a.matricule || '', String(a.nom || '').toUpperCase(), a.prenoms || '', a.statut || '', a.poste || '', a.couleur || '', nb(a.rendement), nb(a.prime), a.codeBanque || '', a.banque || '', a.compte || '', a.fonction || '', a.obs || ''];
  /** Montants de la couleur, proposés quand le champ est vide. */
  function completer(a, baremes) { const b = baremes[a.couleur]; if (b) { if (!nb(a.rendement)) a.rendement = b.rendement; if (!nb(a.prime)) a.prime = b.prime; } return a; }

  const STY = 'border:1px solid #444;padding:3px 5px;font-size:11px;vertical-align:top';
  /** Corps imprimable : une page par école, puis le récapitulatif. */
  function htmlImpression(G, titre, sousTitre, entete) {
    const th = (l) => '<th style="' + STY + ';background:#e4ecf5">' + esc(l) + '</th>';
    let h = '';
    G.groupes.forEach((g, k) => {
      h += '<div style="' + (k ? 'page-break-before:always;' : '') + 'font-family:Arial,sans-serif">' + (k === 0 ? '' : (entete || ''))
        + '<h2 style="text-align:center;font-size:15px;margin:6px 0">' + esc(titre) + '</h2><p style="text-align:center;margin:0 0 6px">' + esc(sousTitre || '') + '</p>'
        + '<h3 style="font-size:13px;margin:8px 0">ÉCOLE : ' + esc(g.ecole.toUpperCase()) + '</h3><table style="border-collapse:collapse;width:100%"><tr>' + th('N°') + COLONNES.map(th).join('') + '</tr>'
        + g.agents.map((a, i) => '<tr>' + ligne(i + 1, a).map((v, j) => '<td style="' + STY + (j === 7 || j === 8 ? ';text-align:right' : '') + '">' + esc(j === 7 || j === 8 ? fcfa(v) : v) + '</td>').join('') + '</tr>').join('')
        + '<tr><th style="' + STY + '" colspan="3">Nombre d’ayants droit : ' + g.n + '</th><th style="' + STY + '" colspan="5"></th><th style="' + STY + ';text-align:right">' + fcfa(g.rendement) + '</th><th style="' + STY + ';text-align:right">' + fcfa(g.prime) + '</th><th style="' + STY + '" colspan="5"></th></tr></table></div>';
    });
    h += '<div style="' + (G.groupes.length ? 'page-break-before:always;' : '') + 'font-family:Arial,sans-serif">' + (entete || '') + '<h2 style="text-align:center;font-size:15px">RÉCAPITULATIF PAR ÉCOLE</h2><table style="border-collapse:collapse;width:100%"><tr>'
      + ['N°', 'École', 'Ayants droit', 'Rendement / Gratification', 'Prime de zone'].map(th).join('') + '</tr>'
      + G.groupes.map((g, i) => '<tr><td style="' + STY + '">' + (i + 1) + '</td><td style="' + STY + '">' + esc(g.ecole) + '</td><td style="' + STY + ';text-align:right">' + g.n + '</td><td style="' + STY + ';text-align:right">' + fcfa(g.rendement) + '</td><td style="' + STY + ';text-align:right">' + fcfa(g.prime) + '</td></tr>').join('')
      + '<tr><th style="' + STY + '"></th><th style="' + STY + '">TOTAL GÉNÉRAL (' + G.total.ecoles + ' école(s))</th><th style="' + STY + ';text-align:right">' + G.total.n + '</th><th style="' + STY + ';text-align:right">' + fcfa(G.total.rendement) + '</th><th style="' + STY + ';text-align:right">' + fcfa(G.total.prime) + '</th></tr></table>'
      + '<table style="width:100%;margin-top:34px"><tr><td style="text-align:center">Le responsable</td><td style="text-align:center">Le Chef de la circonscription / Le Directeur</td></tr></table></div>';
    return h;
  }
  /** Feuilles Excel : liste par école (titre, agents, total) et récapitulatif. */
  function feuillesExcel(G) {
    const vides = (n) => new Array(n).fill('');
    const lignes = [['N° d’ordre'].concat(COLONNES)];
    G.groupes.forEach(g => {
      lignes.push(['ÉCOLE : ' + g.ecole].concat(vides(COLONNES.length)));
      g.agents.forEach((a, i) => lignes.push(ligne(i + 1, a)));
      lignes.push(['', '', 'Nombre d’ayants droit : ' + g.n, '', '', '', '', g.rendement, g.prime].concat(vides(5)));
      lignes.push(vides(COLONNES.length + 1));
    });
    lignes.push(['', '', 'TOTAL GÉNÉRAL : ' + G.total.n + ' ayant(s) droit, ' + G.total.ecoles + ' école(s)', '', '', '', '', G.total.rendement, G.total.prime].concat(vides(5)));
    const rec = [['École', 'Ayants droit', 'Rendement / Gratification', 'Prime de zone']].concat(G.groupes.map(g => [g.ecole, g.n, g.rendement, g.prime])).concat([['TOTAL', G.total.n, G.total.rendement, G.total.prime]]);
    return [{ nom: 'Liste par école', lignes, entete: 0 }, { nom: 'Récapitulatif', lignes: rec, entete: 0 }];
  }
  /** Lignes d'un fichier Excel -> agents (mêmes colonnes que l'export). */
  function lireImport(lignes, ecoleParDefaut) {
    let k = lignes.findIndex(l => (l || []).some(c => norm(c) === 'nom'));
    if (k < 0) throw new Error('Colonne « Nom » introuvable : utilisez le modèle (bouton « Modèle Excel »).');
    const ent = lignes[k].map(norm);
    const col = (...cand) => ent.findIndex(c => cand.some(x => c === x || c.indexOf(x) === 0));
    const I = { ecole: col('ecole'), matricule: col('matricule', 'n matricule'), nom: col('nom'), prenoms: col('prenoms', 'prenom'), statut: col('statut'), poste: col('poste actuel'), couleur: col('poste desherite', 'couleur'),
      rendement: col('rendement'), prime: col('prime'), codeBanque: col('code banque'), banque: col('banque'), compte: col('n de compte', 'compte', 'n banque'), fonction: col('fonction'), obs: col('observation') };
    if (I.banque === I.codeBanque) I.banque = ent.findIndex((c, j) => c === 'banque');
    const v = (l, key) => (I[key] >= 0 ? String(l[I[key]] == null ? '' : l[I[key]]).trim() : '');
    const out = [];
    lignes.slice(k + 1).forEach(l => {
      if (!v(l, 'nom')) return;
      let c = v(l, 'couleur'); c = /rouge/i.test(c) ? 'Rouge' : /orange/i.test(c) ? 'Orange' : '';
      out.push({ ecole: v(l, 'ecole') || ecoleParDefaut || '', matricule: v(l, 'matricule'), nom: v(l, 'nom'), prenoms: v(l, 'prenoms'), statut: v(l, 'statut'), poste: v(l, 'poste'), couleur: c,
        rendement: nb(v(l, 'rendement')), prime: nb(v(l, 'prime')), codeBanque: v(l, 'codeBanque'), banque: v(l, 'banque'), compte: v(l, 'compte'), fonction: /direct/i.test(v(l, 'fonction')) ? 'Directeur' : (v(l, 'fonction') ? 'Autre' : ''), obs: v(l, 'obs') });
    });
    return out;
  }

  /* ---------------- interface ---------------- */
  async function monter(racine, A) {
    let etat = normaliser(await A.charger());
    const S = { onglet: 'liste', couleur: '', ecole: '', edit: null, msg: '' };
    const ecr = () => (A.peutEcrire ? A.peutEcrire() : true);
    const sauver = async () => { await A.enregistrer(etat); };
    const options = (liste, v, vide) => (vide != null ? '<option value="">' + esc(vide) + '</option>' : '') + liste.map(x => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    const ecolesConnues = () => { const f = A.ecoleFixe ? A.ecoleFixe() : ''; return f ? [f] : (A.ecoles() || []).slice().sort((a, b) => a.localeCompare(b, 'fr')); };
    const boutons = ['liste|Liste par école', 'agents|Agents', 'montants|Montants par couleur', 'import|Import / export Excel'];

    function vListe() {
      const G = grouper(etat.agents, S), toutes = Array.from(new Set(etat.agents.map(a => a.ecole))).sort();
      let h = '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end"><label>Couleur <select data-f="fCouleur">' + options(COULEURS, S.couleur, 'Toutes') + '</select></label>'
        + '<label>École <select data-f="fEcole">' + options(toutes, S.ecole, 'Toutes') + '</select></label>'
        + '<button class="btn btn-primary" data-act="imprimer">Imprimer / PDF</button> <button class="btn" data-act="excel">Excel</button></div>';
      if (!G.groupes.length) return h + '<p class="aide">Aucun agent enregistré. Ajoutez-les dans l’onglet « Agents » ou importez un fichier Excel.</p>';
      G.groupes.forEach(g => {
        h += '<div class="card"><h3>École : ' + esc(g.ecole) + '</h3><div style="overflow:auto"><table class="table"><thead><tr><th>N°</th>' + COLONNES.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
          + g.agents.map((a, i) => '<tr>' + ligne(i + 1, a).map((x, j) => '<td' + (j === 7 || j === 8 ? ' style="text-align:right"' : '') + '>' + esc(j === 7 || j === 8 ? fcfa(x) : x) + '</td>').join('') + '</tr>').join('')
          + '<tr><th colspan="3">Nombre d’ayants droit : ' + g.n + '</th><th colspan="5"></th><th style="text-align:right">' + fcfa(g.rendement) + '</th><th style="text-align:right">' + fcfa(g.prime) + '</th><th colspan="5"></th></tr></tbody></table></div></div>';
      });
      return h + '<p><b>Total général : ' + G.total.n + ' ayant(s) droit dans ' + G.total.ecoles + ' école(s) — rendement / gratification ' + fcfa(G.total.rendement) + ' FCFA — prime de zone ' + fcfa(G.total.prime) + ' FCFA</b></p>';
    }
    function champ(lib, nom, v, extra) { return '<label>' + lib + ' <input data-f="' + nom + '" value="' + esc(v) + '" ' + (extra || '') + '></label>'; }
    function vAgents() {
      const a = S.edit ? (etat.agents.find(x => x.id === S.edit) || {}) : {}, ecs = ecolesConnues(), fixe = A.ecoleFixe ? A.ecoleFixe() : '';
      let h = '';
      if (ecr()) h += '<div class="card"><h3>' + (S.edit ? 'Modifier l’agent' : 'Ajouter un agent') + '</h3><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">'
        + '<label>École <select data-f="ecole"' + (fixe ? ' disabled' : '') + '>' + options(ecs, a.ecole || fixe || '', ecs.length > 1 ? 'Choisir…' : null) + '</select></label>'
        + champ('N° matricule', 'matricule', a.matricule, 'style="width:9em"') + champ('Nom', 'nom', a.nom, 'style="width:11em"') + champ('Prénoms', 'prenoms', a.prenoms, 'style="width:12em"')
        + '<label>Statut <select data-f="statut">' + options(STATUTS, a.statut, '—') + '</select></label>' + champ('Poste actuel', 'poste', a.poste, 'style="width:11em"')
        + '<label>Poste déshérité <select data-f="couleur">' + options(COULEURS, a.couleur, '—') + '</select></label>'
        + champ('Rendement / Gratification', 'rendement', a.rendement || '', 'inputmode="numeric" style="width:8em"') + champ('Prime de zone', 'prime', a.prime || '', 'inputmode="numeric" style="width:8em"')
        + champ('Code banque', 'codeBanque', a.codeBanque, 'style="width:6em"') + champ('Banque', 'banque', a.banque, 'style="width:9em"') + champ('N° de compte', 'compte', a.compte, 'style="width:12em"')
        + '<label>Fonction <select data-f="fonction">' + options(FONCTIONS, a.fonction || 'Autre') + '</select></label>' + champ('Observation', 'obs', a.obs, 'style="width:14em"')
        + '<button class="btn btn-primary" data-act="save">' + (S.edit ? 'Enregistrer' : 'Ajouter') + '</button>' + (S.edit ? ' <button class="btn" data-act="annuler">Annuler</button>' : '') + '</div>'
        + '<p class="aide">Si vous laissez le rendement et la prime vides, les montants de la couleur choisie sont proposés (onglet « Montants par couleur »).</p></div>';
      const liste = etat.agents.slice().sort((x, y) => String(x.ecole).localeCompare(String(y.ecole), 'fr') || String(x.nom).localeCompare(String(y.nom), 'fr'));
      return h + '<div class="card"><h3>' + liste.length + ' agent(s)</h3>' + (liste.length ? '<div style="overflow:auto"><table class="table"><thead><tr><th>École</th><th>Matricule</th><th>Nom et prénoms</th><th>Poste déshérité</th><th>Prime</th><th></th></tr></thead><tbody>'
        + liste.map(x => '<tr><td>' + esc(x.ecole) + '</td><td>' + esc(x.matricule) + '</td><td>' + esc(String(x.nom || '').toUpperCase() + ' ' + (x.prenoms || '')) + '</td><td>' + esc(x.couleur) + '</td><td style="text-align:right">' + fcfa(nb(x.prime)) + '</td><td>'
          + (ecr() ? '<button class="btn btn-sm" data-act="edit" data-id="' + esc(x.id) + '">Modifier</button> <button class="btn btn-sm btn-danger" data-act="del" data-id="' + esc(x.id) + '">Supprimer</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="aide">Aucun agent.</p>') + '</div>';
    }
    function vMontants() {
      const b = etat.baremes;
      return '<div class="card"><h3>Montants fixés par couleur (FCFA)</h3><p class="aide">Fixés une fois : ils sont proposés à chaque nouvel agent et restent modifiables ligne par ligne.</p><div style="display:flex;flex-wrap:wrap;gap:14px;align-items:end">'
        + COULEURS.map(c => '<fieldset style="border:1px solid #ccc;padding:8px"><legend><b>' + c + '</b></legend><label>Rendement / Gratification <input data-f="b_' + c + '_rendement" inputmode="numeric" value="' + esc(b[c].rendement || '') + '" style="width:8em"></label> '
          + '<label>Prime de zone <input data-f="b_' + c + '_prime" inputmode="numeric" value="' + esc(b[c].prime || '') + '" style="width:8em"></label></fieldset>').join('')
        + (ecr() ? '<button class="btn btn-primary" data-act="saveBareme">Enregistrer les montants</button>' : '') + '</div></div>';
    }
    function vImport() {
      return '<div class="card"><h3>Importer un fichier Excel</h3><p class="aide">Colonnes : ' + esc((A.ecoleFixe && A.ecoleFixe() ? '' : 'École, ') + COLONNES.join(', ')) + '. Un agent déjà présent (même école et même matricule) est mis à jour.</p>'
        + '<button class="btn" data-act="modele">Modèle Excel</button> ' + (ecr() ? '<input type="file" data-f="fichier" accept=".xlsx,.csv"> ' : '') + '<button class="btn" data-act="excel">Exporter la liste (Excel)</button></div>'
        + (S.msg ? '<div class="card"><b>' + esc(S.msg) + '</b></div>' : '');
    }
    function vue() {
      const corps = { liste: vListe, agents: vAgents, montants: vMontants, import: vImport }[S.onglet]();
      racine.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">' + boutons.map(b => { const [k, l] = b.split('|'); return '<button class="btn ' + (k === S.onglet ? 'btn-primary' : '') + '" data-onglet="' + k + '">' + l + '</button>'; }).join('') + '</div>' + corps;
    }
    const val = (n) => { const e = racine.querySelector('[data-f="' + n + '"]'); return e ? e.value.trim() : ''; };
    const exporter = async () => { const G = grouper(etat.agents, S); await A.telecharger('zone-desheritee-' + (A.annee ? A.annee() : '') + '.xlsx', await A.xlsxEcrire(feuillesExcel(G))); };
    racine.addEventListener('change', (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      if (f === 'fCouleur') { S.couleur = e.target.value; vue(); } else if (f === 'fEcole') { S.ecole = e.target.value; vue(); }
      else if (f === 'fichier' && e.target.files[0]) importer(e.target.files[0]);
    });
    async function importer(fichier) {
      try {
        const lignes = await A.xlsxLire(fichier), fixe = A.ecoleFixe ? A.ecoleFixe() : '', nouveaux = lireImport(lignes, fixe);
        let ajout = 0, maj = 0, sans = 0;
        nouveaux.forEach(n => {
          if (!n.ecole) { sans++; return; }
          const ex = n.matricule ? etat.agents.find(x => x.ecole === n.ecole && x.matricule === n.matricule) : null;
          completer(n, etat.baremes);
          if (ex) { Object.assign(ex, n); maj++; } else { n.id = A.uid(); etat.agents.push(n); ajout++; }
        });
        await sauver();
        S.msg = ajout + ' agent(s) ajouté(s), ' + maj + ' mis à jour' + (sans ? ', ' + sans + ' ligne(s) ignorée(s) (école absente)' : '') + '.';
      } catch (err) { S.msg = 'Import impossible : ' + (err && err.message ? err.message : err); }
      vue();
    }
    racine.addEventListener('click', async (e) => {
      const o = e.target.closest('[data-onglet]'); if (o) { S.onglet = o.dataset.onglet; S.edit = null; S.msg = ''; vue(); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act, id = b.dataset.id;
      if (act === 'imprimer') { const G = grouper(etat.agents, S); A.imprimer('État des agents de zone déshéritée', htmlImpression(G, 'ÉTAT DES AGENTS DE ZONE DÉSHÉRITÉE', 'Année scolaire ' + (A.annee ? A.annee() : ''), A.entete ? A.entete() : '')); return; }
      if (act === 'excel') { await exporter(); return; }
      if (act === 'modele') { await A.telecharger('modele-zone-desheritee.xlsx', await A.xlsxEcrire([{ nom: 'Agents', lignes: [(A.ecoleFixe && A.ecoleFixe() ? [] : ['École']).concat(COLONNES)], entete: 0 }])); return; }
      if (!ecr()) return;
      if (act === 'save') {
        const fixe = A.ecoleFixe ? A.ecoleFixe() : '', ecole = fixe || val('ecole');
        if (!ecole || !val('nom')) { alert('L’école et le nom sont obligatoires.'); return; }
        const a = S.edit ? etat.agents.find(x => x.id === S.edit) : { id: A.uid() };
        Object.assign(a, { ecole, matricule: val('matricule'), nom: val('nom'), prenoms: val('prenoms'), statut: val('statut'), poste: val('poste'), couleur: val('couleur'), rendement: nb(val('rendement')), prime: nb(val('prime')),
          codeBanque: val('codeBanque'), banque: val('banque'), compte: val('compte'), fonction: val('fonction') || 'Autre', obs: val('obs') });
        completer(a, etat.baremes);
        if (!S.edit) etat.agents.push(a);
        S.edit = null; await sauver(); vue();
      } else if (act === 'edit') { S.edit = id; vue(); } else if (act === 'annuler') { S.edit = null; vue(); }
      else if (act === 'del') { if (confirm('Supprimer cet agent ?')) { etat.agents = etat.agents.filter(x => x.id !== id); await sauver(); vue(); } }
      else if (act === 'saveBareme') { COULEURS.forEach(c => { etat.baremes[c] = { rendement: nb(val('b_' + c + '_rendement')), prime: nb(val('b_' + c + '_prime')) }; }); await sauver(); alert('Montants enregistrés.'); }
    });
    vue();
  }
  global.ZoneDesheritee = { monter, grouper, lireImport, feuillesExcel, htmlImpression, completer, normaliser, COULEURS, COLONNES, nb };
})(typeof window !== 'undefined' ? window : globalThis);
