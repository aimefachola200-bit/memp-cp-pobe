/* ÉduGestion Pro Master — import des fichiers du personnel (FE, ACDPE, ACDPCTD).

   Lit tels quels les fichiers que le ministère remet aux circonscriptions :
   - « FE / ACDPE » : N° matricule, nom, prénoms, poste, grade, indice, corps, fonction, statut…
   - « AME » : identifiant AME, nom, prénoms, poste, diplôme de recrutement, corps, fonction…

   Chaque agent est rattaché à son école d'après son « nom de poste » (le rapprochement se corrige
   à l'écran avant validation). Les agents du bureau de la circonscription (DAF, DS, DOSP, conseillers
   pédagogiques, chef de circonscription…) vont dans le Répertoire, pas dans une école.

   Cloisonnement : un agent n'entre que dans la circonscription choisie, et seulement si la colonne
   « CS » de son fichier est bien celle-là. Ces fichiers contiennent des données personnelles : ils
   ne sont jamais livrés avec l'application, chaque circonscription charge les siens. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = U.sansAccent;
  const nrm = t => sa(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });
  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();

  /* Colonnes reconnues (titre normalisé → champ). Plusieurs titres possibles pour un même champ. */
  const COLONNES = [
    ['matricule', /^(n matricule|matricule|identifiant a m e|identifiant ame|identifiant)$/],
    ['nom', /^nom$/], ['prenoms', /^prenoms?$/], ['nom_epoux', /^nom epoux$/],
    ['cs', /^cs$/], ['poste', /^nom poste$/], ['grade', /^grade$/], ['indice', /^indice$/],
    ['sit_famille', /^sit famille/], ['naissance', /^date de naissance$/], ['lieu', /^lieu naissance$/],
    ['genre', /^(le genre|genre|sexe)$/], ['prise_service', /^date 1ere prise service$/], ['corps', /^corps$/],
    ['fonction', /^fonction$/], ['nb_classes', /^nbre de classe$/], ['statut', /^nom statut/],
    ['arrivee_poste', /^date arrive poste$/], ['telephone', /^(numero telephone|telephone)$/], ['diplome', /^diplome de recrutement$/]
  ];

  function dateISO(v) {
    if (v === null || v === undefined || v === '') return null;
    const t = String(v).trim();
    if (/^\d{5}(\.\d+)?$/.test(t) && Number(t) > 20000 && Number(t) < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(Number(t)) * 86400000).toISOString().slice(0, 10);
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(t);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  }

  function telephone(v) {
    let t = String(v === null || v === undefined ? '' : v).replace(/[^\d+]/g, '');
    if (/^\d{9}$/.test(t) && t[0] === '1') t = '0' + t;
    return t || null;
  }

  /** Lit un classeur du ministère : { agents: [...], manquantes: [titres essentiels absents] }. */
  function lireFichier(lignes, nomFichier) {
    let h = -1;
    for (let i = 0; i < Math.min(lignes.length, 15); i++) {
      const c = (lignes[i] || []).map(nrm);
      if (c.indexOf('nom') >= 0 && (c.indexOf('prenoms') >= 0 || c.indexOf('prenom') >= 0)) { h = i; break; }
    }
    if (h < 0) return { agents: [], manquantes: ['Nom', 'Prénoms'], nomFichier };
    const col = {};
    lignes[h].forEach((t, i) => { const k = nrm(t); COLONNES.forEach(([champ, re]) => { if (col[champ] === undefined && re.test(k)) col[champ] = i; }); });
    const manquantes = ['nom', 'prenoms', 'poste'].filter(c => col[c] === undefined);
    const lire = (l, c) => { const v = col[c] === undefined ? '' : l[col[c]]; return v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim(); };
    const agents = [];
    lignes.slice(h + 1).forEach((l, n) => {
      if (!l || !lire(l, 'nom')) return;
      agents.push({
        fichier: nomFichier, ligne: h + n + 2,
        matricule: lire(l, 'matricule'), nom: lire(l, 'nom'), prenoms: lire(l, 'prenoms'), cs: lire(l, 'cs'), poste: lire(l, 'poste'),
        grade: lire(l, 'grade'), indice: lire(l, 'indice'), sit_famille: lire(l, 'sit_famille'), naissance: dateISO(lire(l, 'naissance')), lieu: lire(l, 'lieu'),
        genre: lire(l, 'genre'), prise_service: dateISO(lire(l, 'prise_service')), corps: lire(l, 'corps'), fonction: lire(l, 'fonction'),
        statut: lire(l, 'statut'), arrivee_poste: dateISO(lire(l, 'arrivee_poste')), telephone: telephone(lire(l, 'telephone')), diplome: lire(l, 'diplome')
      });
    });
    return { agents, manquantes, nomFichier };
  }

  /* ---------- rapprochement poste → école ---------- */

  const MOTS_VIDES = { de: 1, du: 1, des: 1, la: 1, le: 1, les: 1, l: 1, d: 1 };
  function forme(nom) {
    const entier = sa(nom);
    const brut = entier.replace(/\(.*?\)/g, ' ');
    const jetons = brut.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    let type = null;
    if (jetons[0] === 'epp' || jetons[0] === 'ep') { type = 'P'; jetons.shift(); }
    else if (jetons[0] === 'em') { type = 'M'; jetons.shift(); }
    else if (jetons[0] === 'ecole') jetons.shift();
    const compact = t => t.replace(/[^a-z0-9]+/g, '');
    /* « (ex Pobè/D) » : l'ancien nom sert aussi à reconnaître l'école. */
    const alias = [compact(jetons.join(' '))];
    (entier.match(/\(([^)]*)\)/g) || []).forEach(g => {
      const m = /\bex\b\s*(.*)\)/.exec(g);
      if (m) { const c = compact(m[1].replace(/^(epp|ep|em)\s+/, '')); if (c) alias.push(c); }
    });
    return { type, coeur: jetons.join(' '), jetons: jetons.filter(j => !MOTS_VIDES[j]), alias: alias.filter(Boolean), lettre: /^[a-d]$/.test(jetons[jetons.length - 1] || '') ? jetons[jetons.length - 1] : null };
  }

  /** Distance d'édition bornée à 1 (une lettre en trop, en moins ou différente). */
  function aUneLettrePres(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
  }

  /** { ecole, sur } : « exact », « proche », ou ecole null si aucun rapprochement sûr. */
  function trouverEcole(poste, ecoles) {
    const p = forme(poste);
    if (!p.coeur) return { ecole: null, sur: null };
    const fs = ecoles.map(e => ({ e, f: forme(e.nom), type: e.cycle === 'MATERNELLE' ? 'M' : 'P' }));
    const compat = x => !p.type || p.type === x.type;
    let c = fs.filter(x => compat(x) && x.f.coeur === p.coeur);
    if (c.length === 1) return { ecole: c[0].e, sur: 'exact' };
    if (c.length > 1) return { ecole: null, sur: null };
    /* Même nom à l'espace ou au tiret près, ou ancien nom (« ex … ») identique. */
    c = fs.filter(x => compat(x) && x.f.alias.some(a => p.alias.indexOf(a) >= 0));
    if (c.length === 1) return { ecole: c[0].e, sur: 'exact' };
    if (c.length > 1) return { ecole: null, sur: null };
    /* Faute de frappe d'une lettre (Akpaman / Akpanman) : proposé, à confirmer. */
    c = fs.filter(x => compat(x) && x.f.alias[0].length >= 8 && p.alias[0].length >= 8 && aUneLettrePres(x.f.alias[0], p.alias[0]));
    if (c.length === 1) return { ecole: c[0].e, sur: 'proche' };
    /* Un poste « X/B » ne se rabat jamais sur l'école « X » ou « X/A » : c'est une autre école. */
    if (p.lettre) return { ecole: null, sur: null };
    const inclus = (a, b) => a.length && a.every(j => b.indexOf(j) >= 0);
    c = fs.filter(x => compat(x) && !x.f.lettre && (inclus(p.jetons, x.f.jetons) || inclus(x.f.jetons, p.jetons)));
    if (c.length === 1) return { ecole: c[0].e, sur: 'proche' };
    if (c.length > 1) {
      c.sort((a, b) => Math.abs(a.f.jetons.length - p.jetons.length) - Math.abs(b.f.jetons.length - p.jetons.length));
      if (Math.abs(c[0].f.jetons.length - p.jetons.length) < Math.abs(c[1].f.jetons.length - p.jetons.length)) return { ecole: c[0].e, sur: 'proche' };
    }
    return { ecole: null, sur: null };
  }

  const estPosteCS = (poste, cs) => {
    const t = ' ' + nrm(poste) + ' ';
    return / cs /.test(t) || nrm(poste) === nrm(cs.nom) || /^(daf|dap|ds|dosp|dp|daf cs)\b/.test(nrm(poste));
  };
  /** La colonne « CS » du fichier désigne-t-elle la circonscription visée ? Vide = on ne peut pas savoir : accepté. */
  function memeCS(valeur, cs) {
    if (!valeur) return true;
    const v = nrm(valeur).replace(/^(la )?cs /, '').trim(), c = nrm(cs.nom).replace(/^cs /, '');
    return v === c || c.indexOf(v + ' ') === 0 || v.indexOf(c + ' ') === 0;
  }

  /* ---------- transformation d'un agent en fiche ---------- */

  const sexe = g => { const t = sa(g); return /^m/.test(t) ? 'M' : /^f/.test(t) ? 'F' : null; };
  function fonctionEcole(a) {
    const t = sa(a.fonction), corps = sa(a.corps);
    if (/directeur|directrice|dircteur/.test(t) && !/adjoint/.test(t)) return 'DIRECTEUR';
    if (/conseill/.test(t)) return 'CONSEILLER_PEDAGOGIQUE';
    if (/agents? d.entretien|gardien|cuisin|manoeuvre|service\b/.test(corps) && !/administratif/.test(corps)) return 'SOUTIEN';
    if (/administratif|secretaire|comptable/.test(corps) || /secretaire|comptable|collaborateur/.test(t)) return 'ADMINISTRATIF';
    return 'ENSEIGNANT';
  }
  function fonctionContact(a) {
    const t = sa(a.fonction);
    if (/chef de circonscription|chef de cs/.test(t)) return 'CHEF_CS';
    if (/conseill/.test(t)) return 'CONSEILLER_PEDAGOGIQUE';
    return 'AUTRE';
  }
  function situation(t) {
    const m = /^([a-z])/i.exec(String(t || '').trim());
    return m ? ({ M: 'MARIE', C: 'CELIBATAIRE', D: 'DIVORCE', V: 'VEUF' }[m[1].toUpperCase()] || null) : null;
  }
  function fichePersonnel(a, ecole) {
    const g = /^([A-Z]\d?)-?(\d+)?$/i.exec(String(a.grade).replace(/\s/g, ''));
    const cat = g ? g[1].toUpperCase() : null;
    const rec = {
      matricule: a.matricule || null, nom: a.nom, prenoms: a.prenoms, sexe: sexe(a.genre), date_naissance: a.naissance, lieu_naissance: a.lieu || null,
      telephone: a.telephone, ecole_id: ecole.id, fonction: fonctionEcole(a), grade: a.grade || null,
      categorie: ['A1', 'A2', 'A3', 'B1', 'C1'].indexOf(cat) >= 0 ? cat : null, echelon: g && g[2] ? Number(g[2]) : null,
      indice_reel: a.indice && !isNaN(Number(a.indice)) ? Number(a.indice) : null, emploi: a.corps || null, qualite: a.statut || null,
      date_premiere_prise_service: a.prise_service, date_arrivee_poste: a.arrivee_poste, situation_familiale: situation(a.sit_famille),
      diplome_recrutement: a.diplome || null, actif: true
    };
    Object.keys(rec).forEach(k => { if (rec[k] === null || rec[k] === '') delete rec[k]; });
    return rec;
  }

  /* =======================================================================
     Onglet « Personnel (FE, ACDPE, ACDPCTD) » de l'écran Import et export
     ======================================================================= */

  EG.OngletsImport = EG.OngletsImport || {};
  EG.OngletsImport.personnel = function (zone, etat, ctx) {
    if (!peutGerer()) { zone.appendChild(U.vide('L’import du personnel est réservé aux comptes de circonscription, de direction départementale et à l’administration.')); return; }
    if (!etat.cs) { zone.appendChild(U.vide('Choisissez d’abord la circonscription : les agents ne sont jamais copiés dans une autre.')); return; }
    const cs = ctx.index[etat.cs];
    const ecolesCS = ctx.ecoles.filter(e => e.territoire_id === cs.id && ctx.idsEcoles[e.id] && e.actif !== false).sort(tri);
    const dep = EG.Perimetre.ancetre(ctx.index, cs.id, 'DEPARTEMENT');
    const communes = ctx.terr.filter(t => t.type === 'COMMUNE' && dep && t.parent_id === dep.id).sort(tri);
    let commune = (communes.filter(c => nrm(c.nom) === nrm(cs.nom).replace(/ \d+$/, ''))[0] || communes[0] || {}).id || '';
    const agents = [], fichiers = [];
    const choix = {}; /* poste → id d'école, 'CS' ou 'NON' */
    const options = { directeurs: true };

    zone.appendChild(el('p', { class: 'muet', text: 'Chargez le fichier du personnel FE / ACDPE et/ou celui des AME de ' + cs.nom + ', tel que remis par le ministère. Chaque agent est rattaché à son école d’après son « nom de poste » ; vous corrigez les rapprochements avant de valider.' }));
    if (!ecolesCS.length) { zone.appendChild(U.vide('Cette circonscription n’a pas encore d’école : installez d’abord son jeu de données ou importez ses écoles, pour que les agents puissent leur être rattachés.')); return; }

    const fichier = el('input', { type: 'file', accept: '.xlsx,.csv', multiple: true, 'aria-label': 'Fichiers du personnel' });
    const message = el('p', { class: 'muet petit' });
    const zoneApercu = el('div');
    fichier.addEventListener('change', () => {
      const liste = Array.prototype.slice.call(fichier.files || []);
      if (!liste.length) return;
      message.textContent = 'Lecture…';
      liste.reduce((p, f) => p.then(() => EG.Tableur.lire(f).then(l => {
        const r = lireFichier(l, f.name);
        if (r.manquantes.length) { message.textContent = '« ' + f.name + ' » : colonnes introuvables (' + r.manquantes.join(', ') + '). Ce fichier n’a pas été retenu.'; return; }
        fichiers.push({ nom: f.name, nb: r.agents.length });
        r.agents.forEach(a => agents.push(a));
      }).catch(e => { message.textContent = '« ' + f.name + ' » est illisible : ' + e.message; })), Promise.resolve()).then(() => {
        if (agents.length) message.textContent = pl(agents.length, 'agent') + ' lu(s) dans ' + pl(fichiers.length, 'fichier') + '.';
        analyser();
      });
    });
    zone.appendChild(el('div', { class: 'carte' }, [
      el('div', { class: 'champ' }, [el('label', { text: 'Fichiers du personnel (Excel ou CSV)' }), fichier]),
      el('div', { class: 'champ' }, [el('label', { text: 'Commune du bureau de la circonscription (pour le répertoire)' }),
        el('select', { 'aria-label': 'Commune du bureau', onchange: e => { commune = e.target.value; } },
          communes.map(c => { const o = el('option', { value: c.id, text: c.nom }); if (c.id === commune) o.selected = true; return o; }))]),
      message
    ]));
    zone.appendChild(zoneApercu);

    function analyser() {
      zoneApercu.textContent = '';
      if (!agents.length) return;
      /* Regroupement par nom de poste, avec proposition d'école. */
      const parPoste = {}, ordre = [];
      let horsCS = 0;
      agents.forEach(a => {
        a.horsCS = !memeCS(a.cs, cs) && !estPosteCS(a.poste, cs);
        if (a.horsCS) { horsCS++; return; }
        const k = a.poste || '(sans poste)';
        if (!parPoste[k]) { parPoste[k] = { poste: k, agents: [] }; ordre.push(k); }
        parPoste[k].agents.push(a);
      });
      ordre.forEach(k => {
        if (choix[k] !== undefined) return;
        if (estPosteCS(k, cs)) { choix[k] = 'CS'; return; }
        const r = trouverEcole(k, ecolesCS);
        parPoste[k].sur = r.sur;
        choix[k] = r.ecole ? r.ecole.id : '';
      });
      const sonCS = ordre.reduce((s, k) => s + parPoste[k].agents.length, 0);
      const aRattacher = () => ordre.filter(k => choix[k] === '');
      zoneApercu.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(agents.length), 'Agents lus', ''),
        U.stat(U.nombre(sonCS), 'Agents de ' + cs.nom, 'ok'),
        U.stat(U.nombre(horsCS), 'Écartés (autre circonscription)', horsCS ? 'attention' : ''),
        U.stat(U.nombre(ordre.length), 'Postes distincts', '')
      ]));
      if (horsCS) zoneApercu.appendChild(el('p', { class: 'muet petit', text: horsCS + ' agent(s) dont la colonne « CS » n’est pas ' + cs.nom + ' ne seront pas importés : ils appartiennent à une autre circonscription.' }));

      const zoneEtat = el('div');
      const lignes = ordre.map(k => {
        const g = parPoste[k];
        const sel = el('select', { 'aria-label': 'École de ' + k, onchange: e => { choix[k] = e.target.value; majEtat(); } }, [
          el('option', { value: '', text: '— À choisir —' }),
          el('option', { value: 'CS', text: '\uE024 Personnel de la circonscription (répertoire)' }),
          el('option', { value: 'NON', text: '\uE036 Ne pas importer' })
        ].concat(ecolesCS.map(e => el('option', { value: e.id, text: e.nom }))));
        sel.value = choix[k];
        const badge = el('td');
        const maj = () => { badge.textContent = ''; badge.appendChild(choix[k] === '' ? U.badge('À choisir', 'attention') : choix[k] === 'NON' ? U.badge('Ignoré', 'info') : choix[k] === 'CS' ? U.badge('Répertoire', 'info') : U.badge(g.sur === 'proche' ? 'Rapprochement proche' : 'Reconnue', g.sur === 'proche' ? 'attention' : 'ok')); };
        maj();
        g.maj = maj;
        return el('tr', {}, [el('td', { text: k }), el('td', { class: 'num', text: g.agents.length }), el('td', {}, sel), badge]);
      });
      zoneApercu.appendChild(U.carte('Rattachement des postes aux écoles', el('div', { class: 'tableau-enveloppe' },
        el('table', { class: 'tableau tableau-edition' }, [el('thead', {}, el('tr', {}, ['Nom de poste dans le fichier', 'Agents', 'École', 'État'].map(t => el('th', { text: t })))), el('tbody', {}, lignes)]))));
      const casDir = el('input', { type: 'checkbox', checked: true, onchange: e => { options.directeurs = e.target.checked; } });
      zoneApercu.appendChild(el('label', { class: 'ligne-coche' }, [casDir, ' Renseigner aussi le nom et le téléphone du directeur dans la fiche de chaque école']));
      zoneApercu.appendChild(zoneEtat);

      const bouton = el('button', { class: 'btn btn-primaire', text: 'Importer', onclick: () => importer(parPoste, ordre, bouton) });
      function majEtat() {
        ordre.forEach(k => parPoste[k].maj());
        const restants = aRattacher().reduce((s, k) => s + parPoste[k].agents.length, 0);
        const pretsEcole = ordre.filter(k => choix[k] && choix[k] !== 'CS' && choix[k] !== 'NON').reduce((s, k) => s + parPoste[k].agents.length, 0);
        const pretsCS = ordre.filter(k => choix[k] === 'CS').reduce((s, k) => s + parPoste[k].agents.length, 0);
        zoneEtat.textContent = '';
        zoneEtat.appendChild(el('p', { class: 'petit', text: pl(pretsEcole, 'agent') + ' vers les écoles, ' + pl(pretsCS, 'agent') + ' vers le répertoire de la circonscription'
          + (restants ? ', ' + pl(restants, 'agent') + ' encore à rattacher (ils seront laissés de côté).' : '.') }));
        bouton.disabled = !(pretsEcole + pretsCS);
      }
      zoneApercu.appendChild(el('div', { class: 'barre-actions' }, [bouton]));
      majEtat();
    }

    function importer(parPoste, ordre, bouton) {
      bouton.disabled = true; bouton.textContent = 'Import en cours…';
      Promise.all([DB.all('personnels'), DB.all('contacts'), DB.all('ecoles')]).then(([pers, contacts, toutesEcoles]) => {
        const parEcole = {}; ecolesCS.forEach(e => { parEcole[e.id] = e; });
        const idsEcolesCS = {}; toutesEcoles.filter(e => e.territoire_id === cs.id).forEach(e => { idsEcolesCS[e.id] = true; });
        const parMatricule = {}; pers.forEach(p => { if (p.matricule) parMatricule[String(p.matricule).trim().toLowerCase()] = p; });
        const contactsCS = contacts.filter(c => c.territoire_id === cs.id);
        const cle = a => nrm(a.nom + ' ' + a.prenoms);
        const nouveaux = [], majs = [], autresCS = [], contactsNew = [], directeurs = {};
        let ignores = 0;
        ordre.forEach(k => {
          const dest = choix[k];
          parPoste[k].agents.forEach(a => {
            if (!dest || dest === 'NON') { ignores++; return; }
            if (dest === 'CS') {
              const ex = contactsCS.filter(c => nrm(c.nom + ' ' + (c.prenoms || '')) === cle(a))[0];
              const rec = Object.assign({}, ex || {}, {
                nom: a.nom, prenoms: a.prenoms, fonction: fonctionContact(a), structure: a.poste, telephone: a.telephone || (ex && ex.telephone) || null,
                departement_id: dep ? dep.id : null, commune_id: commune || (ex && ex.commune_id) || null, territoire_id: cs.id,
                notes: 'Fonction : ' + (a.fonction || '—') + (a.statut ? ' — Statut : ' + a.statut : '') + (a.grade ? ' — Grade : ' + a.grade : ''), actif: true
              });
              contactsNew.push(rec);
              return;
            }
            const ecole = parEcole[dest];
            if (!ecole) { ignores++; return; }
            const rec = fichePersonnel(a, ecole);
            const ex = rec.matricule ? parMatricule[String(rec.matricule).trim().toLowerCase()] : null;
            if (ex) {
              if (ex.ecole_id && !idsEcolesCS[ex.ecole_id]) { autresCS.push(a); return; }
              majs.push(Object.assign({}, ex, rec));
            } else nouveaux.push(rec);
            if (rec.fonction === 'DIRECTEUR') directeurs[ecole.id] = { ecole, nom: a.prenoms + ' ' + a.nom.toUpperCase(), tel: a.telephone };
          });
        });
        const ecolesMaj = options.directeurs ? Object.keys(directeurs).map(id => {
          const d = directeurs[id];
          return Object.assign({}, toutesEcoles.filter(e => e.id === id)[0], { directeur_nom: d.nom, directeur_telephone: d.tel || (parEcole[id] && parEcole[id].directeur_telephone) || null });
        }) : [];
        return DB.putBatch('personnels', nouveaux.concat(majs))
          .then(() => DB.putBatch('contacts', contactsNew))
          .then(() => ecolesMaj.length ? DB.putBatch('ecoles', ecolesMaj) : null)
          .then(() => DB.audit('IMPORT_PERSONNEL', 'personnels', null, { cs: cs.nom, agents: nouveaux.length, mis_a_jour: majs.length, repertoire: contactsNew.length }))
          .then(() => {
            EG.majSynchro();
            const t = U.modal('Import du personnel terminé', el('div', {}, [
              el('p', { class: 'ok-texte', text: pl(nouveaux.length, 'agent') + ' ajouté(s) aux écoles, ' + pl(majs.length, 'fiche') + ' mise(s) à jour, ' + pl(contactsNew.length, 'personne') + ' au répertoire de ' + cs.nom + '.' }),
              ecolesMaj.length ? el('p', { class: 'petit', text: pl(ecolesMaj.length, 'directeur') + ' renseigné(s) dans les fiches d’école.' }) : null,
              autresCS.length ? el('p', { class: 'muet petit', text: autresCS.length + ' agent(s) déjà rattaché(s) à une école d’une autre circonscription n’ont pas été modifiés.' }) : null,
              ignores ? el('p', { class: 'muet petit', text: pl(ignores, 'agent') + ' laissé(s) de côté.' }) : null
            ]), fermer => [
              el('button', { class: 'btn btn-fantome', text: 'Répertoire', onclick: () => { fermer(); Routeur.aller('repertoire/' + cs.id); } }),
              el('button', { class: 'btn btn-primaire', text: 'Personnel', onclick: () => { fermer(); Routeur.aller('personnel'); } })
            ]);
            void t;
            agents.length = 0; fichiers.length = 0; Object.keys(choix).forEach(k => { delete choix[k]; });
            fichier.value = ''; message.textContent = ''; zoneApercu.textContent = '';
          });
      }).catch(e => { console.error(e); U.toast('Import interrompu : ' + e.message, 'danger'); bouton.disabled = false; bouton.textContent = 'Importer'; });
    }
  };

  EG.PersonnelMinistere = { lireFichier, trouverEcole, forme };
})(window);
