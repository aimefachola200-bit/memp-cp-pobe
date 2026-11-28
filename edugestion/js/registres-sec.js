/* Vie de l'établissement et examens du secondaire — registres de GESCOL / Scolaris portés dans ÉduGestion :
     « Vie de l'établissement » : professeurs, conseils de classe (calcul depuis les notes + procès-verbal), discipline et sanctions (fiche), emplois du temps
       (détection des conflits de professeur, de salle et de classe + grille), stages (attestation) ;
     « Examens BEPC / BAC » : centres d'examen, candidats (convocation), attribution des numéros de table, statistiques par examen et série (G/F, taux de réussite).
   Règles : admis si moyenne ≥ 10 ; au BAC, second tour si 8 ≤ moyenne < 10 ; la décision du jury, si saisie, l'emporte.
   Accès : direction, conseillers pédagogiques, circonscription, DDEMP, administration (lecture ou écriture selon le rôle).
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const el = U.el;
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const NIV = ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle'];
  const SERIES = ['Tronc commun', 'A1', 'A2', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'F4', 'G1', 'G2', 'G3', 'H', 'Agriculture', 'Autre'];
  const PERIODES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3', 'Semestre 1', 'Semestre 2'];
  const EXAMENS = ['BEPC', 'BAC général', 'BAC technique', 'CAP', 'BT', 'DT', 'Autre'];
  const DECISIONS = ['Admis', 'Second tour', 'Ajourné', 'Absent', 'Éliminé (fraude)'];
  const STATUTS = ['Agent permanent de l’État (APE)', 'Agent contractuel de l’État (ACE)', 'Vacataire', 'Enseignant de l’établissement (privé)', 'Autre'];
  const NATURES = ['Retard', 'Absence non justifiée', 'Tenue non conforme', 'Insolence / indiscipline', 'Bavardage / perturbation', 'Téléphone en classe', 'Fraude / tricherie', 'Bagarre / violence', 'Dégradation de matériel', 'Vol', 'Autre'];
  const SANCTIONS = ['Avertissement', 'Blâme', 'Retenue / travail d’intérêt général', 'Exclusion temporaire', 'Exclusion définitive', 'Conseil de discipline'];
  const MATIERES = ['Français', 'Mathématiques', 'Anglais', 'Allemand', 'Espagnol', 'Physique-Chimie-Technologie', 'SVT', 'Histoire-Géographie', 'Philosophie', 'EPS', 'Éducation civique et morale', 'Informatique', 'Arts plastiques'];
  const DOMAINES = ['Industriel (mécanique, électricité, froid…)', 'Bâtiment et travaux publics', 'Tertiaire (gestion, commerce, secrétariat)', 'Informatique et numérique', 'Agriculture et élevage', 'Hôtellerie, restauration et tourisme', 'Santé et action sociale', 'Couture, mode et artisanat', 'Autre'];
  const DIPLOMES = ['CAP', 'BEP', 'BT', 'DT', 'Baccalauréat technique', 'Certificat de qualification', 'Autre'], CYCLES_ENT = ['1er cycle', '2nd cycle', '1er et 2nd cycles'];
  const TYPES_ETAB = ['Public (collège d’enseignement général)', 'Public (lycée)', 'Public (lycée technique)', 'Privé laïc', 'Privé confessionnel', 'Privé (enseignement technique et professionnel)'];
  const SPECULATIONS = ['Maïs', 'Manioc', 'Igname', 'Niébé', 'Arachide', 'Soja', 'Riz', 'Tomate', 'Piment', 'Gombo', 'Légumes feuilles', 'Oignon', 'Chou', 'Ananas', 'Anacardier', 'Palmier à huile', 'Coton', 'Verger (agrumes, mangue)', 'Reboisement', 'Autre'];
  const ESPECES = ['Poulets de chair', 'Poules pondeuses', 'Pintades', 'Lapins', 'Porcins', 'Caprins', 'Ovins', 'Bovins', 'Aulacodes', 'Poissons (tilapia, clarias)', 'Abeilles', 'Autre'];
  const UNITES_AGRI = ['kg', 'tonne', 'sac', 'litre', 'tête', 'plateau (30 œufs)', 'm²', 'are', 'hectare', 'unité'];
  const MOUVEMENTS = ['Entrée (achat, don, récolte)', 'Sortie (consommation, travaux)', 'Perte'];
  const ETAT = ['Bon', 'Moyen', 'À réparer', 'Hors service'];
  const DIR = ['DIRECTEUR', 'ADMIN_MEMP', 'ADMIN_TECHNIQUE'];
  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const nb = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : null; };
  const fmt = (n) => n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ',');
  const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 + ' %' : '—';
  const dfr = (s) => s ? s.split('-').reverse().join('/') : '';
  const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
  const mention = (m) => m == null ? '' : m >= 16 ? 'Très bien' : m >= 14 ? 'Bien' : m >= 12 ? 'Assez bien' : m >= 10 ? 'Passable' : '';
  /* champs : [clé, libellé, type, options]  types : t texte, l long, d date, i entier, n décimal, c choix, o oui/non */
  const C = (cle, lib, t, o) => ({ cle, lib, t: t || 't', o });
  const minutes = (h) => { const m = /^(\d{1,2})\s*[:hH]\s*(\d{2})?/.exec(String(h || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; };

  function decisionProposee(x) {
    if (x.absent === 'Oui') return 'Absent';
    const m = nb(x.moyenne); if (m == null) return '';
    if (m >= 10) return 'Admis'; if ((x.examen || '').indexOf('BAC') === 0 && m >= 8) return 'Second tour'; return 'Ajourné';
  }
  const decision = (x) => (x.decisionJury || '').trim() || decisionProposee(x);
  function conflits(lignes) {
    const res = {};
    const ajoute = (a, b, m) => { [a, b].forEach(x => { (res[x.id] = res[x.id] || []).indexOf(m) < 0 && res[x.id].push(m); }); };
    for (let i = 0; i < lignes.length; i++) for (let j = i + 1; j < lignes.length; j++) {
      const a = lignes[i], b = lignes[j]; if (a.jour !== b.jour) continue;
      const a0 = minutes(a.debut), a1 = minutes(a.fin), b0 = minutes(b.debut), b1 = minutes(b.fin); if (a0 == null || a1 == null || b0 == null || b1 == null || !(a0 < b1 && b0 < a1)) continue;
      if (a.professeur && a.professeur === b.professeur) ajoute(a, b, 'Professeur ' + a.professeur);
      if (a.salle && a.salle === b.salle) ajoute(a, b, 'Salle ' + a.salle);
      if (a.classe && a.classe === b.classe) ajoute(a, b, 'Classe ' + a.classe);
    }
    return res;
  }

  function REGS(ctx) {
    const lien = { professeurs: 1 };
    return {
      professeurs: { titre: 'Professeurs', unite: 'professeur', champs: [C('nom', 'Nom', 't'), C('prenoms', 'Prénoms'), C('sexe', 'Sexe', 'c', ['M', 'F']), C('matricule', 'Matricule / NIP'), C('statut', 'Statut', 'c', STATUTS), C('discipline', 'Discipline enseignée', 'c', MATIERES), C('diplome', 'Diplôme professionnel'), C('classes', 'Classes tenues', 'l'), C('heures', 'Heures par semaine', 'n'), C('telephone', 'Téléphone'), C('observations', 'Observations', 'l')],
        colonnes: ['nom', 'prenoms', 'sexe', 'matricule', 'statut', 'discipline', 'heures', 'telephone'], oblig: 'nom', tri: x => (x.nom || '') + (x.prenoms || ''), filtres: ['statut', 'discipline'], totaux: ['heures'], defauts: { statut: STATUTS[0] },
        aide: 'Public : APE / ACE. Privé : « Enseignant de l’établissement ». Les carrières détaillées restent dans Personnel et carrière.' },
      conseils: { titre: 'Conseils de classe', unite: 'conseil', champs: [C('classe', 'Classe'), C('periode', 'Période', 'c', PERIODES), C('dateConseil', 'Date du conseil', 'd'), C('president', 'Président(e)'), C('professeurPrincipal', 'Professeur principal'), C('effectif', 'Effectif', 'i'), C('composes', 'Élèves ayant composé', 'i'), C('moyenneClasse', 'Moyenne de la classe', 'n'), C('moyenneMax', 'Moyenne la plus forte', 'n'), C('moyenneMin', 'Moyenne la plus faible', 'n'), C('sup10', 'Moyennes ≥ 10', 'i'), C('honneur', 'Tableau d’honneur', 'i'), C('felicitations', 'Félicitations', 'i'), C('encouragements', 'Encouragements', 'i'), C('avertTravail', 'Avertissements (travail)', 'i'), C('blameTravail', 'Blâmes (travail)', 'i'), C('avertConduite', 'Avertissements (conduite)', 'i'), C('blameConduite', 'Blâmes (conduite)', 'i'), C('passage', 'Passages / admis', 'i'), C('redoublement', 'Redoublements', 'i'), C('exclusions', 'Exclusions', 'i'), C('observations', 'Observations et décisions', 'l')],
        colonnes: ['classe', 'periode', 'dateConseil', 'effectif', 'composes', 'moyenneClasse', 'sup10', 'passage', 'redoublement'], oblig: 'classe', tri: x => '~' + (x.dateConseil || ''), inverse: true, filtres: ['classe', 'periode'], defauts: () => ({ dateConseil: today() }),
        calc: x => ({ 'Taux ≥ 10': x.composes ? pct(x.sup10 || 0, x.composes) : '—' }), fiche: ['Procès-verbal', pv], extra: 'calculer',
        aide: '« Calculer depuis les notes » crée la ligne d’une classe et d’une période avec les moyennes saisies dans « Notes et bulletins du secondaire » ; complétez ensuite les décisions du conseil.' },
      sanctions: { titre: 'Discipline et sanctions', unite: 'sanction', champs: [C('eleve', 'Élève'), C('classe', 'Classe'), C('dateFait', 'Date des faits', 'd'), C('nature', 'Nature', 'c', NATURES), C('sanction', 'Sanction', 'c', SANCTIONS), C('duree', 'Durée (jours)', 'i'), C('demandeur', 'Signalé par'), C('parentInforme', 'Parent informé', 'o'), C('faits', 'Description des faits', 'l'), C('suite', 'Suite donnée', 'l')],
        colonnes: ['eleve', 'classe', 'dateFait', 'nature', 'sanction', 'duree', 'parentInforme'], oblig: 'eleve', tri: x => '~' + (x.dateFait || ''), inverse: true, filtres: ['nature', 'sanction', 'classe'], defauts: () => ({ dateFait: today(), parentInforme: 'Non' }), fiche: ['Fiche de sanction', fSanction] },
      emploi: { titre: 'Emplois du temps', unite: 'créneau', champs: [C('classe', 'Classe'), C('jour', 'Jour', 'c', JOURS), C('debut', 'Début (ex. 8h00)'), C('fin', 'Fin (ex. 10h00)'), C('matiere', 'Matière', 'c', MATIERES), C('professeur', 'Professeur'), C('salle', 'Salle')],
        colonnes: ['classe', 'jour', 'debut', 'fin', 'matiere', 'professeur', 'salle'], oblig: 'classe', tri: x => (x.classe || '') + JOURS.indexOf(x.jour) + String(minutes(x.debut) || 0).padStart(5, '0'), filtres: ['classe', 'jour', 'professeur'], defauts: { jour: 'Lundi' },
        calc: (x, tous) => ({ 'Conflit': ((conflits(tous)[x.id]) || []).join(' ; ') || '—' }), extra: 'grille', aide: 'Les créneaux qui se chevauchent pour le même professeur, la même salle ou la même classe sont signalés dans la colonne « Conflit ».' },
      stages: { titre: 'Stages', unite: 'stage', champs: [C('eleve', 'Élève'), C('filiere', 'Filière'), C('entreprise', 'Entreprise / structure d’accueil'), C('tuteur', 'Tuteur'), C('dateDebut', 'Début', 'd'), C('dateFin', 'Fin', 'd'), C('duree', 'Durée (jours)', 'i'), C('note', 'Note /20', 'n'), C('appreciation', 'Appréciation du tuteur', 'l')],
        colonnes: ['eleve', 'filiere', 'entreprise', 'tuteur', 'dateDebut', 'dateFin', 'duree', 'note'], oblig: 'eleve', tri: x => '~' + (x.dateDebut || ''), inverse: true, filtres: ['filiere'], fiche: ['Attestation de stage', fStage] },
      /* lycée agricole : ferme-école et exploitation */
      campagnes: { titre: 'Campagnes agricoles', unite: 'campagne', champs: [C('intitule', 'Campagne (ex. 2026-2027, grande saison)'), C('debut', 'Début', 'd'), C('fin', 'Fin', 'd'), C('objectifs', 'Objectifs de production', 'l'), C('bilan', 'Bilan de la campagne', 'l')],
        colonnes: ['intitule', 'debut', 'fin'], oblig: 'intitule', tri: x => '~' + (x.debut || ''), inverse: true },
      parcelles: { titre: 'Parcelles et champs-école', unite: 'parcelle', champs: [C('nom', 'Parcelle / champ'), C('superficie', 'Superficie (ares)', 'n'), C('sol', 'Type de sol'), C('culture', 'Culture en place', 'c', SPECULATIONS), C('campagne', 'Campagne'), C('classe', 'Classe responsable'), C('date_semis', 'Date de semis / plantation', 'd'), C('date_recolte', 'Récolte prévue', 'd'), C('etat', 'État', 'c', ETAT), C('observations', 'Observations', 'l')],
        colonnes: ['nom', 'superficie', 'culture', 'campagne', 'classe', 'date_semis', 'etat'], oblig: 'nom', tri: x => x.nom || '', totaux: ['superficie'], filtres: ['culture', 'campagne'], defauts: { etat: 'Bon' } },
      travaux_agri: { titre: 'Cahier des travaux agricoles', unite: 'travail', champs: [C('date', 'Date', 'd'), C('parcelle', 'Parcelle'), C('travail', 'Travail (labour, semis, sarclage, traitement, récolte…)'), C('classe', 'Classe'), C('intervenants', 'Nombre d’élèves', 'i'), C('heures', 'Durée (heures)', 'n'), C('intrants', 'Intrants utilisés'), C('observations', 'Observations', 'l')],
        colonnes: ['date', 'parcelle', 'travail', 'classe', 'intervenants', 'heures'], oblig: 'travail', tri: x => '~' + (x.date || ''), inverse: true, totaux: ['heures'], filtres: ['parcelle', 'classe'] },
      cheptel: { titre: 'Cheptel et élevages', unite: 'lot', champs: [C('lot', 'Lot / bande / enclos'), C('espece', 'Espèce', 'c', ESPECES), C('effectif', 'Effectif', 'i'), C('date_mise', 'Date de mise en place', 'd'), C('poids_initial', 'Poids moyen initial (kg)', 'n'), C('poids_actuel', 'Poids moyen actuel (kg)', 'n'), C('aliment_kg', 'Aliment consommé (kg)', 'n'), C('morts', 'Mortalité (têtes)', 'i'), C('classe', 'Classe responsable'), C('etat', 'État sanitaire', 'c', ETAT), C('observations', 'Observations', 'l')],
        colonnes: ['lot', 'espece', 'effectif', 'date_mise', 'poids_actuel', 'morts', 'etat'], oblig: 'lot', tri: x => '~' + (x.date_mise || ''), inverse: true, totaux: ['effectif', 'morts'], filtres: ['espece', 'etat'], defauts: { etat: 'Bon' },
        calc: x => { const g = (nb(x.poids_actuel) || 0) - (nb(x.poids_initial) || 0), t = (nb(x.effectif) || 0) * g; return { 'Mortalité': nb(x.effectif) ? pct(nb(x.morts) || 0, (nb(x.effectif) || 0) + (nb(x.morts) || 0)) : '—', 'Indice de consommation': (t > 0 && nb(x.aliment_kg)) ? fmt(nb(x.aliment_kg) / t) : '—' }; } },
      sante_animale: { titre: 'Santé animale (vaccinations et soins)', unite: 'acte', champs: [C('date', 'Date', 'd'), C('lot', 'Lot'), C('espece', 'Espèce', 'c', ESPECES), C('acte', 'Acte (vaccin, déparasitage, traitement)'), C('produit', 'Produit / vaccin'), C('effectif', 'Effectif traité', 'i'), C('rappel', 'Prochain rappel', 'd'), C('intervenant', 'Intervenant (vétérinaire, enseignant)')],
        colonnes: ['date', 'lot', 'espece', 'acte', 'produit', 'effectif', 'rappel'], oblig: 'acte', tri: x => '~' + (x.date || ''), inverse: true, totaux: ['effectif'], filtres: ['espece'] },
      intrants: { titre: 'Intrants et stocks de la ferme', unite: 'mouvement', champs: [C('date', 'Date', 'd'), C('produit', 'Produit (semences, engrais, aliments, produits phytosanitaires…)'), C('mouvement', 'Mouvement', 'c', MOUVEMENTS), C('quantite', 'Quantité', 'n'), C('unite', 'Unité', 'c', UNITES_AGRI), C('montant', 'Montant (FCFA)', 'i'), C('observations', 'Observations', 'l')],
        colonnes: ['date', 'produit', 'mouvement', 'quantite', 'unite', 'montant'], oblig: 'produit', tri: x => '~' + (x.date || ''), inverse: true, totaux: ['montant'], filtres: ['mouvement'] },
      production: { titre: 'Récoltes et ventes de la production', unite: 'opération', champs: [C('date', 'Date', 'd'), C('produit', 'Produit'), C('campagne', 'Campagne'), C('quantite', 'Quantité', 'n'), C('unite', 'Unité', 'c', UNITES_AGRI), C('vendu', 'Quantité vendue', 'n'), C('prix', 'Prix unitaire (FCFA)', 'i'), C('montant', 'Montant encaissé (FCFA)', 'i'), C('acheteur', 'Acheteur')],
        colonnes: ['date', 'produit', 'campagne', 'quantite', 'vendu', 'montant'], oblig: 'produit', tri: x => '~' + (x.date || ''), inverse: true, totaux: ['montant'], filtres: ['campagne'] },
      materiel_agri: { titre: 'Matériel et outillage agricoles', unite: 'matériel', champs: [C('materiel', 'Matériel (tracteur, motoculteur, pulvérisateur, houes…)'), C('quantite', 'Quantité', 'i'), C('etat', 'État', 'c', ETAT), C('date_acq', 'Date d’acquisition', 'd'), C('valeur', 'Valeur (FCFA)', 'i'), C('observations', 'Observations', 'l')],
        colonnes: ['materiel', 'quantite', 'etat', 'date_acq', 'valeur'], oblig: 'materiel', tri: x => x.materiel || '', totaux: ['quantite', 'valeur'], filtres: ['etat'], defauts: { etat: 'Bon' } },
      filieres: { titre: 'Filières ETP', unite: 'filière', champs: [C('intitule', 'Filière'), C('domaine', 'Domaine', 'c', DOMAINES), C('diplome', 'Diplôme préparé', 'c', DIPLOMES), C('cycle', 'Cycle', 'c', CYCLES_ENT), C('duree', 'Durée (années)', 'i'), C('capacite', 'Capacité d’accueil', 'i'), C('effectif', 'Effectif actuel', 'i'), C('chef', 'Chef de département'), C('observations', 'Observations', 'l')],
        colonnes: ['intitule', 'domaine', 'diplome', 'cycle', 'duree', 'capacite', 'effectif', 'chef'], oblig: 'intitule', tri: x => x.intitule || '', totaux: ['capacite', 'effectif'], filtres: ['domaine', 'diplome'] },
      ateliers: { titre: 'Ateliers et équipements', unite: 'atelier', champs: [C('atelier', 'Atelier / laboratoire'), C('filiere', 'Filière'), C('capacite', 'Places', 'i'), C('equipements', 'Équipements principaux', 'l'), C('etat', 'État général', 'c', ['Bon', 'Moyen', 'À réparer', 'Hors service']), C('besoins', 'Besoins', 'l'), C('responsable', 'Responsable')],
        colonnes: ['atelier', 'filiere', 'capacite', 'etat', 'responsable'], oblig: 'atelier', tri: x => (x.filiere || '') + (x.atelier || ''), totaux: ['capacite'], filtres: ['filiere', 'etat'], defauts: { etat: 'Bon' } },
      etablissement: { titre: 'Identité de l’établissement', unite: 'fiche', champs: [C('typeEtab', 'Type', 'c', TYPES_ETAB), C('cycles', 'Cycles ouverts', 'c', CYCLES_ENT), C('code', 'Code de l’établissement'), C('ddestfp', 'Direction départementale (DDESTFP)'), C('commune', 'Commune'), C('anneeCreation', 'Année de création', 'i'), C('autorisation', 'Arrêté d’autorisation / d’ouverture'), C('directeur', 'Proviseur / Directeur'), C('censeur', 'Censeur / Directeur des études'), C('surveillantGeneral', 'Surveillant général'), C('intendant', 'Intendant / Économe'), C('secretaire', 'Secrétaire'), C('cpe', 'Conseiller principal d’éducation'), C('salles', 'Salles de classe', 'i'), C('telephone', 'Téléphone')],
        colonnes: ['typeEtab', 'cycles', 'code', 'directeur', 'censeur', 'salles'], oblig: 'typeEtab', tri: x => x.id || '', inverse: true, aide: 'Une fiche par année : elle alimente l’en-tête du tableau synoptique.' },
      centres: { titre: 'Centres d’examen', unite: 'centre', champs: [C('code', 'Code'), C('nom', 'Centre d’examen'), C('examen', 'Examen', 'c', EXAMENS), C('commune', 'Commune'), C('salles', 'Salles de composition', 'i'), C('capacite', 'Capacité par salle', 'i'), C('chef', 'Chef de centre'), C('observations', 'Observations', 'l')],
        colonnes: ['code', 'nom', 'examen', 'commune', 'salles', 'capacite', 'chef'], oblig: 'nom', tri: x => x.nom || '', totaux: ['salles'], defauts: { capacite: 30 }, calc: x => ({ 'Places': (x.salles || 0) * (x.capacite || 0) }) },
      candidats: { titre: 'Candidats aux examens', unite: 'candidat', champs: [C('examen', 'Examen', 'c', EXAMENS), C('serie', 'Série', 'c', SERIES), C('nom', 'Nom'), C('prenoms', 'Prénoms'), C('sexe', 'Sexe', 'c', ['M', 'F']), C('dateNaissance', 'Date de naissance', 'd'), C('lieuNaissance', 'Lieu de naissance'), C('classe', 'Classe'), C('centre', 'Centre d’examen'), C('numTable', 'N° de table'), C('moyenne', 'Moyenne /20', 'n'), C('absent', 'Absent', 'o'), C('decisionJury', 'Décision du jury', 'c', DECISIONS), C('observations', 'Observations', 'l')],
        colonnes: ['examen', 'serie', 'nom', 'prenoms', 'sexe', 'centre', 'numTable', 'moyenne', 'absent', 'decisionJury'], oblig: 'nom', tri: x => (x.examen || '') + (x.serie || '') + (x.nom || '') + (x.prenoms || ''), filtres: ['examen', 'serie', 'centre'], defauts: { examen: 'BEPC', absent: 'Non' },
        calc: x => ({ 'Décision retenue': decision(x) || '—', 'Mention': decision(x) === 'Admis' ? mention(nb(x.moyenne)) : '' }), fiche: ['Convocation', convocation], extra: 'numeroter' }
    };
  }
  /* -------- documents -------- */
  const feuille = (titre, corps, signatures) => '<div style="font-family:Arial,sans-serif;color:#111;line-height:1.5"><div style="text-align:center"><b>RÉPUBLIQUE DU BÉNIN</b><br><b>' + esc(EG.session.ecole_nom || '') + '</b></div><h2 style="text-align:center;margin:14px 0">' + esc(titre.toUpperCase()) + '</h2>' + corps
    + '<table style="width:100%;margin-top:34px"><tr>' + signatures.map(s => '<td style="text-align:center">' + esc(s) + '</td>').join('') + '</tr></table></div>';
  const tabl = (lignes) => '<table style="width:100%;border-collapse:collapse;margin-top:8px">' + lignes.filter(l => l[1] !== '' && l[1] != null).map(l => '<tr><td style="border:1px solid #444;padding:4px 8px;width:45%"><b>' + esc(l[0]) + '</b></td><td style="border:1px solid #444;padding:4px 8px">' + esc(l[1]) + '</td></tr>').join('') + '</table>';
  function pv(x, R) {
    const lig = R.champs.filter(c => ['classe', 'dateConseil', 'periode', 'president', 'observations'].indexOf(c.cle) < 0).map(c => [c.lib, x[c.cle]]);
    return feuille('Procès-verbal du conseil de classe', '<p>Le conseil de la classe de <b>' + esc(x.classe) + '</b> s’est réuni le ' + dfr(x.dateConseil) + ' (' + esc(x.periode) + '), sous la présidence de ' + esc(x.president || '………') + '.</p>' + tabl(lig) + (x.observations ? '<p><b>Observations et décisions :</b> ' + esc(x.observations) + '</p>' : ''), ['Le / la président(e)', 'Le professeur principal', 'Le Proviseur / Le Directeur']);
  }
  const fSanction = (x, R) => feuille('Fiche de sanction disciplinaire', tabl(R.champs.map(c => [c.lib, x[c.cle]])), ['Le surveillant général / l’éducateur', 'Le parent / tuteur (pris connaissance)', 'Le Proviseur / Le Directeur']);
  const fStage = (x) => feuille('Attestation de stage', '<p>Il est attesté que l’élève <b>' + esc(x.eleve) + '</b>' + (x.filiere ? ' (filière ' + esc(x.filiere) + ')' : '') + ' a effectué un stage ' + (x.entreprise ? 'au sein de <b>' + esc(x.entreprise) + '</b>' : '') + (x.dateDebut ? ' du ' + dfr(x.dateDebut) : '') + (x.dateFin ? ' au ' + dfr(x.dateFin) : '') + (x.duree ? ' (' + x.duree + ' jours)' : '') + '.</p>' + (x.note != null && x.note !== '' ? '<p>Note : <b>' + fmt(nb(x.note)) + ' / 20</b></p>' : '') + (x.appreciation ? '<p>Appréciation du tuteur : ' + esc(x.appreciation) + '</p>' : ''), ['Le tuteur', 'Le Proviseur / Le Directeur']);
  const convocation = (x) => feuille('Convocation à l’examen', '<p>Le candidat <b>' + esc(((x.nom || '') + ' ' + (x.prenoms || '')).trim()) + '</b>' + (x.dateNaissance ? ', né(e) le ' + dfr(x.dateNaissance) : '') + (x.lieuNaissance ? ' à ' + esc(x.lieuNaissance) : '') + ', est convoqué(e) à l’examen du <b>' + esc(x.examen) + '</b>' + (x.serie ? ' (série ' + esc(x.serie) + ')' : '') + '.</p>' + tabl([['Centre d’examen', x.centre], ['N° de table', x.numTable]]) + '<p style="margin-top:10px">Le candidat se présentera muni de sa convocation et d’une pièce d’identité, un quart d’heure avant le début des épreuves.</p>', ['Le Chef de centre', 'Le Proviseur / Le Directeur']);

  /* -------- moteur -------- */
  function moteur(racine, ids, titre, sousTitre, codeEcran) {
    const u = EG.session.user, ecole = EG.session.ecole_id, annee = EG.session.annee_id, ecr = EG.peutEcrire() && DIR.indexOf(u.role) >= 0;
    racine.appendChild(E.entete(titre, sousTitre));
    if (!ecole) { racine.appendChild(U.vide('Ouvrez la session d’un établissement pour tenir ces registres.')); return; }
    const R = REGS(), F = { onglet: codeEcran === 'pilotage-sec' ? 'synoptique' : ids[0], filtre: {}, classeGrille: '' };
    const ONG = (codeEcran === 'pilotage-sec' ? [['synoptique', 'Tableau synoptique']] : []).concat(ids.map(i => [i, R[i].titre])).concat(codeEcran === 'examens-sec' ? [['stats', 'Statistiques']] : []);
    const barre = el('div', { class: 'sec-ong', role: 'tablist' }), zone = el('div'); racine.appendChild(barre); racine.appendChild(zone);
    const lire = () => DB.all('reg_sec').then(l => l.filter(x => x.ecole_id === ecole && x.annee_scolaire_id === annee).map(x => Object.assign({ id: x.id, registre: x.registre }, x.donnees || {})));
    const sauver = (reg, id, d) => DB.put('reg_sec', Object.assign(id ? { id } : {}, { ecole_id: ecole, annee_scolaire_id: annee, registre: reg, donnees: d })).then(() => { EG.majSynchro(); });
    function dessiner() {
      barre.textContent = ''; ONG.forEach(([id, l]) => { const b = el('button', { type: 'button', role: 'tab', 'aria-selected': id === F.onglet ? 'true' : 'false', text: l }); b.addEventListener('click', () => { F.onglet = id; dessiner(); }); barre.appendChild(b); });
      zone.textContent = ''; lire().then(tout => F.onglet === 'stats' ? stats(tout) : F.onglet === 'synoptique' ? synoptique(tout) : registre(F.onglet, tout)).catch(e => { console.error(e); zone.appendChild(U.vide('Écran indisponible.')); });
    }
    function registre(id, tout) {
      const r = R[id], lignes = tout.filter(x => x.registre === id), valeurs = (cle) => Array.from(new Set(lignes.map(x => x[cle]).filter(Boolean))).sort();
      if (r.aide) zone.appendChild(el('p', { class: 'muet petit', text: r.aide }));
      const bar = el('div', { class: 'barre-actions' });
      if (ecr) bar.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Ajouter ' + (['filieres', 'sanctions', 'etablissement'].indexOf(id) >= 0 ? 'une ' : 'un ') + r.unite, onclick: () => formulaire(id, null, tout) }));
      if (ecr && r.extra === 'calculer') bar.appendChild(el('button', { class: 'btn btn-fantome', text: 'Calculer depuis les notes', onclick: () => calculerConseil(tout) }));
      if (ecr && r.extra === 'numeroter') bar.appendChild(el('button', { class: 'btn btn-fantome', text: 'Attribuer les numéros de table', onclick: () => numeroter(tout) }));
      zone.appendChild(bar);
      const filtre = el('div', { class: 'sec-fil' });
      (r.filtres || []).forEach(k => { const c = r.champs.find(x => x.cle === k), s = el('select', {}, [el('option', { value: '', text: 'Tous — ' + c.lib })].concat(valeurs(k).map(v => el('option', { value: v, text: v })))); s.value = F.filtre[id + k] || ''; s.addEventListener('change', () => { F.filtre[id + k] = s.value; dessiner(); }); filtre.appendChild(el('label', {}, [c.lib, s])); });
      if (filtre.children.length) zone.appendChild(filtre);
      let vis = lignes.filter(x => (r.filtres || []).every(k => !F.filtre[id + k] || x[k] === F.filtre[id + k]));
      vis.sort((a, b) => String(r.tri(a)).localeCompare(String(r.tri(b)), 'fr')); if (r.inverse) vis.reverse();
      const cols = r.colonnes.map(k => { const c = r.champs.find(x => x.cle === k); return { titre: c.lib, valeur: x => c.t === 'd' ? dfr(x[k]) : c.t === 'n' ? fmt(nb(x[k])) : (x[k] == null || x[k] === '' ? '' : String(x[k])) }; });
      if (r.calc) { const ex = r.calc(vis[0] || {}, lignes); Object.keys(ex).forEach(k => cols.push({ titre: k, valeur: x => r.calc(x, lignes)[k] })); }
      cols.push({ titre: '', valeur: x => el('span', { class: 'actions-mini' }, [
        r.fiche ? el('button', { class: 'btn btn-petit btn-fantome', text: r.fiche[0], onclick: () => EG.Sortie.imprimer(r.fiche[0], r.fiche[1](x, r), { paysage: false }) }) : '',
        ecr ? el('button', { class: 'btn btn-petit btn-fantome', text: 'Modifier', onclick: () => formulaire(id, x, tout) }) : '',
        ecr ? el('button', { class: 'btn btn-petit btn-fantome btn-alerte', text: '', 'aria-label': 'Supprimer', onclick: () => U.confirmer('Supprimer', 'Supprimer cette ligne ?', () => DB.remove('reg_sec', x.id).then(() => { EG.majSynchro(); dessiner(); })) }) : '']) });
      const pied = (r.totaux || []).map(k => r.champs.find(c => c.cle === k).lib + ' : ' + fmt(vis.reduce((s, x) => s + (nb(x[k]) || 0), 0))).join(' — ');
      zone.appendChild(U.carte(r.titre + ' (' + vis.length + ')' + (pied ? ' — ' + pied : ''), U.tableau(cols, vis, { messageVide: 'Aucune ligne.' })));
      if (vis.length) zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-fantome', text: 'Imprimer la liste', onclick: () => EG.Sortie.imprimer(r.titre, feuille(r.titre, '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr>' + cols.slice(0, -1).map(c => '<th style="border:1px solid #444;padding:3px 5px">' + esc(c.titre) + '</th>').join('') + '</tr>' + vis.map(x => '<tr>' + cols.slice(0, -1).map(c => '<td style="border:1px solid #444;padding:3px 5px">' + esc(c.valeur(x)) + '</td>').join('') + '</tr>').join('') + '</table>', ['Le Proviseur / Le Directeur']), { paysage: true }) })]));
      if (r.extra === 'grille') grille(lignes);
    }
    function formulaire(id, x, tout) {
      const r = R[id], v = x || Object.assign({}, typeof r.defauts === 'function' ? r.defauts() : (r.defauts || {})), ch = {};
      const corps = el('div', { class: 'formulaire' }, r.champs.map(c => {
        let i;
        if (c.t === 'l') i = el('textarea', { rows: 3, value: v[c.cle] || '' });
        else if (c.t === 'c' || c.t === 'o') { const o = c.t === 'o' ? ['Non', 'Oui'] : c.o; i = el('select', {}, [el('option', { value: '', text: '—' })].concat(o.map(a => el('option', { value: a, text: a })))); i.value = v[c.cle] || ''; }
        else if (c.t === 'd') i = el('input', { type: 'date', value: v[c.cle] || '' });
        else if (c.t === 'i' || c.t === 'n') i = el('input', { type: 'text', inputmode: 'decimal', value: v[c.cle] != null ? String(v[c.cle]).replace('.', ',') : '' });
        else i = el('input', { type: 'text', value: v[c.cle] || '' });
        ch[c.cle] = i; return champ(c.lib, i);
      }));
      U.modal((x ? 'Modifier — ' : 'Ajouter — ') + r.titre, corps, fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }), el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
        const d = {}; r.champs.forEach(c => { let t = ch[c.cle].value; if (c.t === 'i' || c.t === 'n') { t = t === '' ? null : nb(t); if (t != null && c.t === 'i') t = Math.round(t); } else t = (t || '').trim(); d[c.cle] = t; });
        if (!d[r.oblig]) { U.toast('« ' + r.champs.find(c => c.cle === r.oblig).lib + ' » est obligatoire', 'attention'); return; }
        const a = Object.assign({}, x || {}); delete a.id; delete a.registre; sauver(id, x && x.id, Object.assign(a, d)).then(() => { fermer(); U.toast('Enregistré'); dessiner(); });
      } })]);
    }
    function calculerConseil(tout) {
      Promise.all([DB.all('eleves_sec'), DB.all('notes_sec'), DB.all('programme_sec')]).then(([el0, nt, pr]) => {
        const sec = el0.filter(e => e.ecole_id === ecole && e.annee_scolaire_id === annee), notes = nt.filter(n => n.ecole_id === ecole && n.annee_scolaire_id === annee), prog = pr.filter(p => p.ecole_id === ecole && p.annee_scolaire_id === annee);
        const classes = Array.from(new Set(sec.map(e => e.classe))).sort(); if (!classes.length || !EG.BulletinsSec) { U.toast('Aucun élève du secondaire : ouvrez « Notes et bulletins du secondaire »', 'attention'); return; }
        const sc = el('select', {}, classes.map(c => el('option', { value: c, text: c }))), sp = el('select', {}, PERIODES.map(c => el('option', { value: c, text: c })));
        U.modal('Calculer depuis les notes', el('div', { class: 'formulaire' }, [champ('Classe', sc), champ('Période', sp)]), fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }), el('button', { class: 'btn btn-primaire', text: 'Calculer', onclick: () => {
          const liste = sec.filter(e => e.classe === sc.value), ex = liste[0], pg = {}; prog.filter(p => p.niveau === ex.niveau && (p.serie || '') === (ex.serie || '')).forEach(p => { pg[p.matiere] = p.coefficient; });
          const Rs = EG.BulletinsSec.calculer(liste, notes, pg, sp.value, ex.niveau), m = Rs.lignes.map(l => l.moyenne).filter(z => z != null);
          if (!m.length) { U.toast('Aucune note saisie pour cette classe et cette période', 'attention'); return; }
          const ancien = tout.find(z => z.registre === 'conseils' && z.classe === sc.value && z.periode === sp.value), d = Object.assign({}, ancien || { dateConseil: today() }, { classe: sc.value, periode: sp.value, effectif: liste.length, composes: m.length, moyenneClasse: Math.round(m.reduce((a, b) => a + b, 0) / m.length * 100) / 100, moyenneMax: Math.max.apply(null, m), moyenneMin: Math.min.apply(null, m), sup10: m.filter(z => z >= 10).length });
          if (ancien) { delete d.id; delete d.registre; }
          sauver('conseils', ancien && ancien.id, d).then(() => { fermer(); U.toast('Conseil calculé : complétez les décisions'); dessiner(); });
        } })]);
      });
    }
    function grille(lignes) {
      const classes = Array.from(new Set(lignes.map(x => x.classe))).sort(); if (!classes.length) return;
      if (classes.indexOf(F.classeGrille) < 0) F.classeGrille = classes[0];
      const s = el('select', {}, classes.map(c => el('option', { value: c, text: c }))); s.value = F.classeGrille; s.addEventListener('change', () => { F.classeGrille = s.value; dessiner(); });
      const l = lignes.filter(x => x.classe === F.classeGrille), debuts = Array.from(new Set(l.map(x => x.debut + '–' + x.fin))).sort((a, b) => (minutes(a) || 0) - (minutes(b) || 0));
      const html = '<table style="width:100%;border-collapse:collapse"><tr><th style="border:1px solid #444;padding:4px">Horaire</th>' + JOURS.map(j => '<th style="border:1px solid #444;padding:4px">' + j + '</th>').join('') + '</tr>'
        + debuts.map(h => '<tr><td style="border:1px solid #444;padding:4px"><b>' + esc(h) + '</b></td>' + JOURS.map(j => { const c = l.filter(x => x.jour === j && x.debut + '–' + x.fin === h); return '<td style="border:1px solid #444;padding:4px;font-size:12px">' + c.map(x => '<b>' + esc(x.matiere) + '</b><br>' + esc(x.professeur) + (x.salle ? '<br><i>' + esc(x.salle) + '</i>' : '')).join('<hr>') + '</td>'; }).join('') + '</tr>').join('') + '</table>';
      const h = el('div', { class: 'carte' }); h.innerHTML = html;
      zone.appendChild(el('h3', { text: 'Grille de la classe' })); zone.appendChild(el('div', { class: 'sec-fil' }, [el('label', {}, ['Classe', s]), el('button', { class: 'btn btn-fantome', text: 'Imprimer la grille', onclick: () => EG.Sortie.imprimer('Emploi du temps ' + F.classeGrille, feuille('Emploi du temps — ' + F.classeGrille, html, ['Le Proviseur / Le Directeur']), { paysage: true }) })])); zone.appendChild(h);
    }
    function numeroter(tout) {
      const c = tout.filter(x => x.registre === 'candidats').sort((a, b) => ((a.examen || '') + (a.centre || '') + (a.nom || '') + (a.prenoms || '')).localeCompare((b.examen || '') + (b.centre || '') + (b.nom || '') + (b.prenoms || ''), 'fr')), n = {}, ecr0 = [];
      c.forEach(x => { if (x.numTable) { const k = (x.examen || '') + '|' + (x.centre || ''), m = /(\d+)$/.exec(x.numTable); if (m) n[k] = Math.max(n[k] || 0, Number(m[1])); } });
      c.forEach(x => { if (x.numTable) return; const k = (x.examen || '') + '|' + (x.centre || ''); n[k] = (n[k] || 0) + 1; const pre = ((x.examen || 'X').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)) || 'X'; const d = Object.assign({}, x, { numTable: pre + '-' + String(n[k]).padStart(4, '0') }); delete d.id; delete d.registre; ecr0.push(sauver('candidats', x.id, d)); });
      Promise.all(ecr0).then(() => { U.toast(ecr0.length + ' numéro(s) de table attribué(s)'); dessiner(); });
    }
    function synoptique(tout) {
      DB.all('eleves_sec').then(l => {
        const el0 = l.filter(e => e.ecole_id === ecole && e.annee_scolaire_id === annee), prof = tout.filter(x => x.registre === 'professeurs'), id = tout.filter(x => x.registre === 'etablissement').pop() || {};
        const niv = NIV.map(n => { const e = el0.filter(x => x.niveau === n); return { n, cl: new Set(e.map(x => x.classe)).size, g: e.filter(x => x.sexe !== 'F').length, f: e.filter(x => x.sexe === 'F').length }; });
        const cyc = (liste) => liste.reduce((a, x) => ({ cl: a.cl + x.cl, g: a.g + x.g, f: a.f + x.f }), { cl: 0, g: 0, f: 0 });
        const c1 = cyc(niv.filter(x => ['6e', '5e', '4e', '3e'].indexOf(x.n) >= 0)), c2 = cyc(niv.filter(x => ['2nde', '1ère', 'Tle'].indexOf(x.n) >= 0)), T = cyc(niv);
        const pf = prof.filter(x => x.sexe === 'F').length, st = {}; prof.forEach(x => { const k = x.statut || 'Non précisé'; st[k] = (st[k] || 0) + 1; });
        const lig = (k, z) => ({ k, cl: z.cl, g: z.g, f: z.f, t: z.g + z.f, ppc: z.cl ? Math.round(10 * (z.g + z.f) / z.cl) / 10 : '—' });
        const rows = niv.map(x => lig(x.n, x)).concat([lig('1er cycle', c1), lig('2nd cycle', c2), lig('TOTAL', T)]);
        zone.appendChild(el('div', { class: 'grille grille-stats' }, [U.stat(String(T.g + T.f), 'Élèves'), U.stat(T.g + T.f ? Math.round(1000 * T.f / (T.g + T.f)) / 10 + ' %' : '—', 'Part des filles'), U.stat(String(T.cl), 'Classes'), U.stat(String(prof.length), 'Professeurs'),
          U.stat(T.cl ? String(Math.round(10 * (T.g + T.f) / T.cl) / 10) : '—', 'Élèves par classe'), U.stat(prof.length ? String(Math.round(10 * (T.g + T.f) / prof.length) / 10) : '—', 'Élèves par professeur')]));
        const cols = [{ titre: 'Niveau', valeur: r => r.k }, { titre: 'Classes', valeur: r => r.cl }, { titre: 'Garçons', valeur: r => r.g }, { titre: 'Filles', valeur: r => r.f }, { titre: 'Total', valeur: r => r.t }, { titre: 'Élèves par classe', valeur: r => r.ppc }];
        zone.appendChild(U.carte('Effectifs par niveau', U.tableau(cols, rows, {})));
        zone.appendChild(el('p', { class: 'muet', text: 'Professeurs : ' + prof.length + ' (' + pf + ' femmes, ' + (prof.length - pf) + ' hommes) — ' + (Object.keys(st).map(k => k + ' : ' + st[k]).join(' ; ') || 'aucun enregistré') + '. Effectifs tirés de « Notes et bulletins du secondaire » ; professeurs et identité de la « Vie de l’établissement » et de l’onglet « Identité ».' }));
        const html = feuille('Tableau synoptique', '<p>' + esc([id.typeEtab, id.code && 'Code ' + id.code, id.ddestfp, id.commune, id.directeur && 'Directeur : ' + id.directeur].filter(Boolean).join(' — ')) + '</p><table style="width:100%;border-collapse:collapse;font-size:12px"><tr>' + cols.map(x => '<th style="border:1px solid #444;padding:3px 5px">' + esc(x.titre) + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + cols.map(x => '<td style="border:1px solid #444;padding:3px 5px">' + esc(x.valeur(r)) + '</td>').join('') + '</tr>').join('') + '</table><p style="font-size:12px">Professeurs : ' + prof.length + ' (' + pf + ' F).</p>', ['Le Proviseur / Le Directeur']);
        zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: 'Imprimer le tableau synoptique', onclick: () => EG.Sortie.imprimer('Tableau synoptique', html, { paysage: false }) })]));
      });
    }
    function stats(tout) {
      const c = tout.filter(x => x.registre === 'candidats'), g = {}, vide = () => ({ i: { M: 0, F: 0 }, p: { M: 0, F: 0 }, a: { M: 0, F: 0 }, s: { M: 0, F: 0 } }), tot = vide();
      const compter = (z, x) => { const s = x.sexe === 'F' ? 'F' : 'M', d = decision(x); z.i[s]++; if (['Absent', 'Éliminé (fraude)', ''].indexOf(d) < 0) z.p[s]++; if (d === 'Admis') z.a[s]++; if (d === 'Second tour') z.s[s]++; };
      c.forEach(x => { const k = (x.examen || '') + '|' + (x.serie || ''); compter(g[k] = g[k] || vide(), x); compter(tot, x); });
      const som = (o) => o.M + o.F, ligne = (k, z) => ({ k, ins: som(z.i), g: z.i.M, f: z.i.F, pre: som(z.p), adm: som(z.a), sec: som(z.s), t: pct(som(z.a), som(z.p)), tg: pct(z.a.M, z.p.M), tf: pct(z.a.F, z.p.F) });
      const rows = Object.keys(g).sort().map(k => ligne(k.replace('|', ' — ') , g[k])); if (rows.length) rows.push(ligne('TOTAL', tot));
      if (!c.length) { zone.appendChild(U.vide('Aucun candidat enregistré (onglet « Candidats aux examens »).')); return; }
      const cols = [{ titre: 'Examen — série', valeur: r => r.k }, { titre: 'Inscrits', valeur: r => r.ins }, { titre: 'G', valeur: r => r.g }, { titre: 'F', valeur: r => r.f }, { titre: 'Présents', valeur: r => r.pre }, { titre: 'Admis', valeur: r => r.adm }, { titre: 'Second tour', valeur: r => r.sec }, { titre: 'Taux de réussite', valeur: r => r.t }, { titre: 'Garçons', valeur: r => r.tg }, { titre: 'Filles', valeur: r => r.tf }];
      zone.appendChild(U.carte('Résultats par examen et série', U.tableau(cols, rows, {})));
      zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-fantome', text: 'Imprimer les statistiques', onclick: () => EG.Sortie.imprimer('Statistiques des examens', feuille('Statistiques des examens', '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr>' + cols.map(x => '<th style="border:1px solid #444;padding:3px 5px">' + esc(x.titre) + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + cols.map(x => '<td style="border:1px solid #444;padding:3px 5px">' + esc(x.valeur(r)) + '</td>').join('') + '</tr>').join('') + '</table><p style="font-size:11px">Taux de réussite = admis / présents. Second tour : BAC, moyenne de 8 à moins de 10.</p>', ['Le Proviseur / Le Directeur']), { paysage: true }) })]));
    }
    dessiner();
  }
  const route = (code, ids, titre, sous) => U.Routeur.definir(code, function (racine) {
    if (!EG.peutVoirModule(code)) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    moteur(racine, ids, titre, sous, code);
  });
  route('vie-etablissement', ['professeurs', 'conseils', 'sanctions', 'emploi', 'stages'], 'Vie de l’établissement (secondaire)', 'Professeurs, conseils de classe, discipline et sanctions, emplois du temps, stages.');
  route('pilotage-sec', ['etablissement', 'filieres', 'ateliers'], 'Pilotage et enseignement technique (secondaire)', 'Tableau synoptique, identité de l’établissement, filières et ateliers de l’enseignement technique et professionnel.');
  route('ferme-ecole', ['campagnes', 'parcelles', 'travaux_agri', 'cheptel', 'sante_animale', 'intrants', 'production', 'materiel_agri'], 'Ferme-école (lycée agricole)', 'Campagnes, parcelles, travaux, cheptel, santé animale, intrants et stocks, récoltes et ventes, matériel agricole.');
  route('examens-sec', ['centres', 'candidats'], 'Examens BEPC / BAC', 'Centres d’examen, candidats, numéros de table, convocations et statistiques de réussite.');
  EG.RegistresSec = { decision, conflits, minutes };
})(window);
