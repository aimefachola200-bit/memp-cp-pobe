/* Déclarations de paiement de scolarité (école privée).
   Le parent, depuis son compte, déclare un versement fait hors de l'école (Mobile Money, virement, dépôt en banque) avec sa référence.
   La direction de l'école privée vérifie : « Confirmer » enregistre le paiement de scolarité et son reçu numéroté ; « Rejeter » exige un motif.
   Le parent suit l'état de chaque déclaration. Rien n'est compté dans la caisse tant que la direction n'a pas confirmé.
   Idée reprise de ScolaPro Africa, adaptée au fonctionnement hors ligne d'ÉduGestion.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const el = U.el;
  const F = (n) => U.nombre(Math.round(Number(n) || 0)) + ' FCFA';
  const auj = () => new Date().toISOString().slice(0, 10);
  const TRANCHES = ['INSCRIPTION', 'TRANCHE_1', 'TRANCHE_2', 'TRANCHE_3', 'RESTE'];
  const MODES = ['MOBILE_MONEY', 'VIREMENT', 'ESPECES', 'CHEQUE'];
  const OPERATEURS = ['MTN MoMo', 'Moov Money', 'Celtiis Cash', 'Autre'];
  const STATUT = { EN_ATTENTE: ['En cours de vérification', 'attention'], CONFIRMEE: ['Confirmée', 'ok'], REJETEE: ['Rejetée', 'danger'] };
  const badge = (s) => U.badge((STATUT[s] || [s, ''])[0], (STATUT[s] || [s, ''])[1]);
  const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
  const select = (valeurs, lib) => el('select', {}, valeurs.map(v => el('option', { value: v, text: lib ? lib(v) : U.libelle(v) })));

  function numeroRecu(paiements) {
    const an = (EG.session.annee_code || '').slice(0, 4) || String(new Date().getFullYear());
    const max = paiements.reduce((m, p) => { const k = /(\d+)\s*$/.exec(p.numero_recu || ''); return k ? Math.max(m, Number(k[1])) : m; }, 0);
    return 'R-' + an + '-' + String(max + 1).padStart(4, '0');
  }

  /* ---------------- côté parent ---------------- */
  function vueParent(racine) {
    racine.appendChild(E.entete('Déclarer un paiement', 'Vous avez payé la scolarité par Mobile Money, virement ou dépôt ? Déclarez-le ici : l’école vérifie puis vous remet le reçu.'));
    const zone = el('div'); racine.appendChild(zone);
    const u = EG.session.user;
    function charger() {
      zone.textContent = '';
      DB.where('profils_parents', { user_id: u.id }).then(ps => {
        if (!ps[0]) { zone.appendChild(U.vide('Aucun profil parent n’est rattaché à ce compte.')); return; }
        return Promise.all([DB.where('liens_parent_enfant', { parent_id: ps[0].id, statut: 'VALIDE' }), DB.all('eleves'), DB.all('inscriptions_eleves'), DB.all('declarations_paiement'), DB.all('ecoles')])
          .then(([liens, eleves, ins, decls, ecoles]) => {
            const enfants = liens.map(l => {
              const e = eleves.find(x => x.id === l.eleve_id); const i = ins.filter(x => x.eleve_id === l.eleve_id && x.statut !== 'CLOTURE')[0];
              return e && i ? { e, i, ecole: ecoles.find(x => x.id === i.ecole_id) } : null;
            }).filter(Boolean);
            if (!enfants.length) { zone.appendChild(U.vide('Aucun enfant inscrit n’est rattaché à votre compte. Le directeur de l’école valide ce rattachement.')); return; }
            const nom = (e) => ((e.nom || '') + ' ' + (e.prenoms || '')).trim();
            const privees = enfants.filter(x => x.ecole && x.ecole.statut === 'PRIVEE');
            const mienne = (d) => enfants.some(x => x.i.id === d.inscription_id) && d.declare_par === u.id;
            const mes = decls.filter(mienne).sort((a, b) => String(b.date_declaration || '').localeCompare(String(a.date_declaration || '')));
            if (privees.length) zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: '＋ Déclarer un paiement', onclick: () => modal(privees, nom, charger) })]));
            else zone.appendChild(U.vide('La déclaration de paiement concerne les écoles privées. Les écoles publiques ne perçoivent pas de scolarité.'));
            zone.appendChild(U.carte('Mes déclarations (' + mes.length + ')', U.tableau([
              { titre: 'Date', valeur: d => U.dateCourte(d.date_paiement) }, { titre: 'Enfant', valeur: d => { const x = enfants.find(y => y.i.id === d.inscription_id); return x ? nom(x.e) : '—'; } },
              { titre: 'Versement', valeur: d => U.libelle(d.tranche) }, { titre: 'Montant', valeur: d => F(d.montant) },
              { titre: 'Mode', valeur: d => U.libelle(d.mode) + (d.operateur ? ' · ' + d.operateur : '') }, { titre: 'Référence', valeur: d => d.reference || '—' },
              { titre: 'État', valeur: d => el('span', {}, [badge(d.statut), d.numero_recu ? el('div', { class: 'muet petit', text: 'Reçu ' + d.numero_recu }) : '', d.motif ? el('div', { class: 'muet petit', text: d.motif }) : '']) }
            ], mes, { messageVide: 'Aucune déclaration pour l’instant.' })));
          });
      });
    }
    charger();
  }
  function modal(enfants, nom, recharger) {
    const enf = el('select', {}, enfants.map(x => el('option', { value: x.i.id, text: nom(x.e) + ' — ' + x.i.niveau })));
    const tr = select(TRANCHES), montant = el('input', { type: 'number', min: '1', step: '1', placeholder: 'FCFA' });
    const mode = select(MODES), op = select(OPERATEURS, v => v), ref = el('input', { type: 'text', placeholder: 'Identifiant reçu par SMS, n° de bordereau…' });
    const date = el('input', { type: 'date', value: auj(), max: auj() }), msg = el('input', { type: 'text', maxlength: '160' });
    U.modal('Déclarer un paiement', el('div', { class: 'formulaire' }, [
      el('p', { class: 'muet petit', text: 'Ne déclarez que des paiements réellement effectués : l’école les vérifie avant d’émettre le reçu.' }),
      champ('Enfant', enf), champ('Versement', tr), champ('Montant payé (FCFA)', montant), champ('Mode', mode), champ('Opérateur (Mobile Money)', op),
      champ('Référence de la transaction', ref), champ('Date du paiement', date), champ('Message (facultatif)', msg)]),
      fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Envoyer la déclaration', onclick: () => {
          const m = Number(montant.value); const x = enfants.find(y => y.i.id === enf.value);
          if (!(m > 0)) { U.toast('Saisissez le montant payé', 'attention'); return; }
          if (mode.value !== 'ESPECES' && !ref.value.trim()) { U.toast('Saisissez la référence de la transaction (sauf espèces)', 'attention'); return; }
          DB.put('declarations_paiement', { ecole_id: x.i.ecole_id, annee_scolaire_id: x.i.annee_scolaire_id, inscription_id: x.i.id, eleve_id: x.e.id, tranche: tr.value, montant: m, mode: mode.value,
            operateur: mode.value === 'MOBILE_MONEY' ? op.value : '', reference: ref.value.trim() || null, date_paiement: date.value || auj(), message: msg.value || null,
            statut: 'EN_ATTENTE', declare_par: EG.session.user.id, date_declaration: new Date().toISOString() })
            .then(r => DB.audit('DECLARATION_PAIEMENT', 'declarations_paiement', r.id, { montant: m })).then(() => { fermer(); EG.majSynchro(); U.toast('Déclaration envoyée à l’école'); recharger(); });
        } })]);
  }

  /* ---------------- côté école ---------------- */
  function vueEcole(racine) {
    racine.appendChild(E.entete('Déclarations de paiement', 'Paiements déclarés par les parents (Mobile Money, virement, dépôt) : vérifiez la référence puis confirmez pour émettre le reçu.'));
    const zone = el('div'); racine.appendChild(zone);
    const ecriture = EG.peutEcrire();
    function charger() {
      zone.textContent = '';
      Promise.all([DB.all('declarations_paiement'), DB.all('paiements_scolarite'), DB.all('eleves'), DB.all('inscriptions_eleves')]).then(([decls, pays, eleves, ins]) => {
        const ec = EG.session.ecole_id;
        decls = decls.filter(d => !ec || d.ecole_id === ec); pays = pays.filter(p => !ec || p.ecole_id === ec);
        const nom = (d) => { const e = eleves.find(x => x.id === d.eleve_id); return e ? ((e.nom || '') + ' ' + (e.prenoms || '')).trim() : '—'; };
        const cours = (d) => { const i = ins.find(x => x.id === d.inscription_id); return i ? i.niveau : '—'; };
        const att = decls.filter(d => d.statut === 'EN_ATTENTE');
        zone.appendChild(U.carte('À vérifier (' + att.length + ')', U.tableau([
          { titre: 'Date', valeur: d => U.dateCourte(d.date_paiement) }, { titre: 'Élève', valeur: nom }, { titre: 'Cours', valeur: cours },
          { titre: 'Versement', valeur: d => U.libelle(d.tranche) }, { titre: 'Montant', valeur: d => F(d.montant) },
          { titre: 'Mode', valeur: d => U.libelle(d.mode) + (d.operateur ? ' · ' + d.operateur : '') }, { titre: 'Référence', valeur: d => d.reference || '—' },
          { titre: '', valeur: d => ecriture ? el('span', { class: 'actions-mini' }, [
            el('button', { class: 'btn btn-petit btn-primaire', text: 'Confirmer', onclick: () => confirmer(d, pays) }),
            el('button', { class: 'btn btn-petit btn-fantome btn-alerte', text: 'Rejeter', onclick: () => rejeter(d) })]) : '' }
        ], att, { messageVide: 'Aucune déclaration en attente.' })));
        const trait = decls.filter(d => d.statut !== 'EN_ATTENTE').sort((a, b) => String(b.date_decision || '').localeCompare(String(a.date_decision || '')));
        zone.appendChild(U.carte('Déjà traitées (' + trait.length + ')', U.tableau([
          { titre: 'Date', valeur: d => U.dateCourte(d.date_paiement) }, { titre: 'Élève', valeur: nom }, { titre: 'Montant', valeur: d => F(d.montant) },
          { titre: 'Référence', valeur: d => d.reference || '—' }, { titre: 'Décision', valeur: d => el('span', {}, [badge(d.statut), d.numero_recu ? ' ' + d.numero_recu : '', d.motif ? el('div', { class: 'muet petit', text: d.motif }) : '']) }
        ], trait, { messageVide: 'Rien de traité pour l’instant.' })));
      });
    }
    function confirmer(d, pays) {
      U.confirmer('Confirmer le paiement', 'Le paiement de ' + F(d.montant) + ' sera enregistré en caisse et le reçu émis.', () => {
        const numero = numeroRecu(pays);
        DB.put('paiements_scolarite', { ecole_id: d.ecole_id, annee_scolaire_id: d.annee_scolaire_id, inscription_id: d.inscription_id, tranche: d.tranche, montant: d.montant, date_paiement: d.date_paiement,
          mode: d.mode, numero_recu: numero, reference: d.reference || null, observations: 'Déclaré par le parent' })
          .then(p => DB.put('declarations_paiement', Object.assign({}, d, { statut: 'CONFIRMEE', numero_recu: numero, paiement_id: p.id, date_decision: new Date().toISOString(), decide_par: EG.session.user.id }))
            .then(() => DB.audit('PAIEMENT_SCOLARITE', 'paiements_scolarite', p.id, { montant: d.montant, recu: numero, via: 'declaration' })))
          .then(() => { EG.majSynchro(); U.toast('Paiement confirmé — reçu ' + numero); charger(); });
      });
    }
    function rejeter(d) {
      const motif = el('input', { type: 'text', placeholder: 'Ex. référence introuvable, montant non reçu' });
      U.modal('Rejeter la déclaration', el('div', { class: 'formulaire' }, [champ('Motif (obligatoire)', motif)]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Rejeter', onclick: () => {
          if (!motif.value.trim()) { U.toast('Le motif est obligatoire', 'attention'); return; }
          DB.put('declarations_paiement', Object.assign({}, d, { statut: 'REJETEE', motif: motif.value.trim(), date_decision: new Date().toISOString(), decide_par: EG.session.user.id }))
            .then(() => { fermer(); EG.majSynchro(); U.toast('Déclaration rejetée'); charger(); });
        } })]);
    }
    charger();
  }

  U.Routeur.definir('declarations-paiement', function (racine) {
    if (!EG.peutVoirModule('declarations-paiement')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    if (EG.session.user.role === 'PARENT') vueParent(racine); else vueEcole(racine);
  });
})(window);
