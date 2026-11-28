/* ÉduGestion Pro Master — plan national : circonscriptions scolaires et zones pédagogiques.

   Source : « Liste des 118 circonscriptions scolaires du Bénin — découpage des
   circonscriptions scolaires en zones pédagogiques » (document du MEMP).
   Le document donne, pour chaque circonscription, le numéro d'ordre, les
   arrondissements couverts (quand ils sont précisés) et le NOMBRE de zones
   pédagogiques — pas leur nom. Les zones sont donc créées sous la forme
   « NOM DE LA CS — Zone n » ; chaque nom se modifie ensuite dans l'onglet
   « Écoles ». Rien n'est figé dans le code : tout ce qui est créé ici est
   ensuite ordinaire et modifiable. */
(function (global) {
  'use strict';
  const EG = global.EG;
  const DB = EG.DB;

  /* [n°, département, circonscription, arrondissements couverts, nombre de zones] */
  const CIRCONSCRIPTIONS = [
    [1, "ALIBORI", "BANIKOARA 1", "Banikoara Centre, Goumori, Kokiborou, Ounet, Soroko et Toura", 3],
    [2, "ALIBORI", "BANIKOARA 2", "Founougo, Gomparou, Kokey et Sompérékou", 3],
    [3, "ALIBORI", "GOGOUNOU", "", 3],
    [4, "ALIBORI", "KANDI 1", "Bensékou, Kandi 2, Kandi 3, Kassakou et Sam", 3],
    [5, "ALIBORI", "KANDI 2", "Angaradébou, Donwari, Kandi 1, Saah et Sonsoro", 2],
    [6, "ALIBORI", "KARIMAMA", "", 2],
    [7, "ALIBORI", "MALANVILLE", "", 3],
    [8, "ALIBORI", "SEGBANA", "", 2],
    [9, "ATACORA", "BOUKOUMBE", "", 4],
    [10, "ATACORA", "COBLY", "", 3],
    [11, "ATACORA", "KEROU", "", 3],
    [12, "ATACORA", "KOUANDE", "", 4],
    [13, "ATACORA", "MATERI", "", 4],
    [14, "ATACORA", "NATITINGOU 1", "Kouandata, Natitingou 3, Perma, Tchoumi-Tchoum, Kotopounga", 3],
    [15, "ATACORA", "NATITINGOU 2", "Kouaba, Natitingou 1, Natitingou 2 et Pépariyakou", 2],
    [16, "ATACORA", "PEHUNCO", "", 2],
    [17, "ATACORA", "TANGUIETA", "", 3],
    [18, "ATACORA", "TOUCOUNTOUNA", "", 2],
    [19, "ATLANTIQUE", "ABOMEY-CALAVI 1", "Abomey-Calavi Centre et Akassato", 3],
    [20, "ATLANTIQUE", "ABOMEY-CALAVI 2", "Godomey Est (à la voie inter-États)", 3],
    [21, "ATLANTIQUE", "ABOMEY-CALAVI 3", "Glo-Djigbé, Kparroun et Zinvié", 3],
    [22, "ATLANTIQUE", "ABOMEY-CALAVI 4", "Hêvié", 3],
    [23, "ATLANTIQUE", "ABOMEY-CALAVI 5", "Godomey Ouest (à la voie inter-États)", 3],
    [24, "ATLANTIQUE", "ABOMEY-CALAVI 6", "Ouèdo et Togba", 3],
    [25, "ATLANTIQUE", "ALLADA 1", "Allada, Ahouannanzoun, Atogon, Hinvi, Sékou, Togoudo", 3],
    [26, "ATLANTIQUE", "ALLADA 2", "Agbanou, Avakpa, Ayou, Lissègazoun, Lon-Agonmè, Tokpa-Ava", 2],
    [27, "ATLANTIQUE", "KPOMASSE", "", 3],
    [28, "ATLANTIQUE", "OUIDAH 1", "Gakpé, Djègbadji, Houakpè-Daho, Ouidah 1, Ouidah 2, Ouidah 3, Ouidah 4 et Savi", 2],
    [29, "ATLANTIQUE", "OUIDAH 2", "Avlékété et Pahou", 2],
    [30, "ATLANTIQUE", "SO-AVA", "", 2],
    [31, "ATLANTIQUE", "TOFFO", "", 4],
    [32, "ATLANTIQUE", "TORI-BOSSITO", "", 3],
    [33, "ATLANTIQUE", "ZÈ", "", 4],
    [34, "BORGOU", "BEMBEREKE 1", "Bembéréké et Ina", 2],
    [35, "BORGOU", "BEMBEREKE 2", "Béroubouay, Bouanri et Gamia", 3],
    [36, "BORGOU", "KALALE", "", 3],
    [37, "BORGOU", "N’DALI", "", 4],
    [38, "BORGOU", "NIKKI", "", 4],
    [39, "BORGOU", "PARAKOU 1", "1er Arrondissement", 3],
    [40, "BORGOU", "PARAKOU 2", "2e Arrondissement", 3],
    [41, "BORGOU", "PARAKOU 3", "3e Arrondissement", 2],
    [42, "BORGOU", "PERERE", "", 3],
    [43, "BORGOU", "SINENDE", "", 3],
    [44, "BORGOU", "TCHAOUROU 1", "Tchaourou, Tchatchou, Goro", 3],
    [45, "BORGOU", "TCHAOUROU 2", "Alafiarou, Bétérou, Sasson", 3],
    [46, "BORGOU", "TCHAOUROU 3", "Kika", 2],
    [47, "COLLINES", "BANTE", "", 4],
    [48, "COLLINES", "DASSA-ZOUMÈ 1", "Dassa 1, Dassa 2, Kéré, Kpingni et Léma", 3],
    [49, "COLLINES", "DASSA-ZOUMÈ 2", "Akofodjoulè, Gbaffo, Paouignan, Soclogbo et Tré", 2],
    [50, "COLLINES", "GLAZOUE 1", "Glazoué, Gomè, Kpakpaza, Sokponta et Zaffé", 3],
    [51, "COLLINES", "GLAZOUE 2", "Aklampa, Assanté, Magoumi, Ouédèmè et Thio", 3],
    [52, "COLLINES", "OUESSE", "", 4],
    [53, "COLLINES", "SAVALOU 1", "Gobada, Kpataba, Lahotan, Logozohè, Monkpa, Savalou-Agbado, Savalou-Attakè", 3],
    [54, "COLLINES", "SAVALOU 2", "Djaloukovo, Doumè, Savalou-Agah, Léma, Ottoh, Savalou-Ouèssè et Tchetti", 3],
    [55, "COLLINES", "SAVE", "", 4],
    [56, "COUFFO", "APLAHOUE 1", "Aplahoué, Atomèy, Lonkly, Dekpo et Godohou", 2],
    [57, "COUFFO", "APLAHOUE 2", "Azovè et Kissamèy", 3],
    [58, "COUFFO", "DJAKOTOMEY 1", "Adjintimè, Djakotomey 1, Gohomey, Kpoba et Sokouhoué", 2],
    [59, "COUFFO", "DJAKOTOMEY 2", "Djakotomey 2, Bétoumey, Houéganmey, Kinkinhoué et Kokohoué", 2],
    [60, "COUFFO", "DOGBO", "", 4],
    [61, "COUFFO", "KLOUEKANME 1", "Ahogbèya, Ayahohoué, Klouékanmè et Tchikpé", 3],
    [62, "COUFFO", "KLOUEKANME 2", "Adjahonmè, Détto, Hondjin et Lanta", 3],
    [63, "COUFFO", "LALO", "", 4],
    [64, "COUFFO", "TOVIKLIN", "", 3],
    [65, "DONGA", "BASSILA 1", "", 3],
    [66, "DONGA", "BASSILA 2", "", 2],
    [67, "DONGA", "COPARGO", "", 2],
    [68, "DONGA", "DJOUGOU 1", "Bariénou, Bougou, Djougou 1 et Pélébina", 3],
    [69, "DONGA", "DJOUGOU 2", "Bariénou, Bélefoungou, Djougou 2 et Kolokondé", 3],
    [70, "DONGA", "DJOUGOU 3", "Djougou 3, Onklou, Partago et Sérou", 3],
    [71, "DONGA", "OUAKE", "", 3],
    [72, "LITTORAL", "COTONOU 1", "12e Arrondissement", 3],
    [73, "LITTORAL", "COTONOU 2", "3e Arrondissement et 4e Arrondissement", 3],
    [74, "LITTORAL", "COTONOU 3", "7e Arrondissement, 8e Arrondissement et 9e Arrondissement", 2],
    [75, "LITTORAL", "COTONOU 4", "5e Arrondissement, 6e Arrondissement et 11e Arrondissement", 3],
    [76, "LITTORAL", "COTONOU 5", "1er Arrondissement et 2e Arrondissement", 3],
    [77, "LITTORAL", "COTONOU 6", "10e Arrondissement et 13e Arrondissement", 3],
    [78, "MONO", "ATHIEME", "", 3],
    [79, "MONO", "BOPA", "", 4],
    [80, "MONO", "COME", "", 3],
    [81, "MONO", "GRAND-POPO", "", 2],
    [82, "MONO", "HOUEYOGBE 1", "Doutou, Houéyogbé, Honhoué et Zoungbonou", 2],
    [83, "MONO", "HOUEYOGBE 2", "Dahè et Sè", 3],
    [84, "MONO", "LOKOSSA 1", "Lokossa et Houin", 2],
    [85, "MONO", "LOKOSSA 2", "Agamé, Koudo et Ouédèmè-Adja", 2],
    [86, "OUÉMÉ", "ADJARRA", "", 4],
    [87, "OUÉMÉ", "ADJOHOUN", "", 3],
    [88, "OUÉMÉ", "AGUEGUES", "", 2],
    [89, "OUÉMÉ", "AKPRO-MISSERETE 1", "Akpro-Missérété, Vakon", 3],
    [90, "OUÉMÉ", "AKPRO-MISSERETE 2", "Gomé-Sota, Katagon et Zoungbomè", 3],
    [91, "OUÉMÉ", "AVRANKOU 1", "Avrankou, Djomon, Ghozounmè, Kouti et Sado", 2],
    [92, "OUÉMÉ", "AVRANKOU 2", "Atchoukpa et Ouanho", 2],
    [93, "OUÉMÉ", "BONOU", "", 2],
    [94, "OUÉMÉ", "DANGBO", "", 3],
    [95, "OUÉMÉ", "PORTO-NOVO 1", "3e Arrondissement et 4e Arrondissement", 4],
    [96, "OUÉMÉ", "PORTO-NOVO 2", "1er Arrondissement et 2e Arrondissement", 4],
    [97, "OUÉMÉ", "PORTO-NOVO 3", "5e Arrondissement", 3],
    [98, "OUÉMÉ", "SEME-PODJI 1", "", 3],
    [99, "OUÉMÉ", "SEME-PODJI 2", "", 3],
    [100, "PLATEAU", "ADJA-OUERE", "", 4],
    [101, "PLATEAU", "IFANGNI", "", 4],
    [102, "PLATEAU", "KETOU 1", "Adakplamè, Kétou et Kpankou", 3],
    [103, "PLATEAU", "KETOU 2", "Idigny, Odomèta et Okpomèta", 2],
    [104, "PLATEAU", "POBE", "", 3],
    [105, "PLATEAU", "SAKETE", "", 4],
    [106, "ZOU", "ABOMEY", "", 4],
    [107, "ZOU", "AGBANGNIZOUN", "", 3],
    [108, "ZOU", "BOHICON 1", "Bohicon 1, Ouassaho et Saclo", 3],
    [109, "ZOU", "BOHICON 2", "Bohicon 2, Gnidjazoun et Lissézoun", 3],
    [110, "ZOU", "BOHICON 3", "Agongointo, Avogbanna, Passagon et Sodohomè", 3],
    [111, "ZOU", "COVE", "", 2],
    [112, "ZOU", "DJIDJA 1", "Agouna, Djidja, Houéto et Monsourou", 3],
    [113, "ZOU", "DJIDJA 2", "Agondji, Dan, Gobaix, Mougnon, Oumbègamè, Setto et Zounkon", 3],
    [114, "ZOU", "OUINHI", "", 2],
    [115, "ZOU", "ZAGNANADO", "", 3],
    [116, "ZOU", "ZA-KPOTA 1", "Allahé, Houngomè, Za-Kpota et Za-Tanta", 3],
    [117, "ZOU", "ZA-KPOTA 2", "Assanlin, Kpakpamè, Kpozoun et Zèko", 2],
    [118, "ZOU", "ZOGBODOMEY", "", 4]
  ];

  /* Totaux départementaux indiqués par le document source. Le total national
     indiqué est de 344 zones. Pour le Plateau, le document annonce 21 zones alors que
     le détail des six circonscriptions n'en compte que 20 : l'écart est conservé
     tel quel et signalé dans l'écran « Écoles ». */
  const ZONES_DECLAREES = {
    "ALIBORI": 21,
    "ATACORA": 30,
    "ATLANTIQUE": 43,
    "BORGOU": 38,
    "COLLINES": 29,
    "COUFFO": 26,
    "DONGA": 19,
    "LITTORAL": 17,
    "MONO": 21,
    "OUÉMÉ": 41,
    "PLATEAU": 21,
    "ZOU": 38
  };

  const sa = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'").toLowerCase().trim();
  const codeCS = n => 'CS-' + String(n).padStart(3, '0');
  const codeZone = (n, i) => 'ZP-' + String(n).padStart(3, '0') + '-' + i;

  /** Nom de la zone tel qu'il apparaît dans les listes : toujours rattaché à sa CS. */
  function nomZone(nomCS, i) { return nomCS + ' \u2014 Zone ' + i; }

  /**
   * Installe (ou complète) les 118 circonscriptions et leurs zones sous les
   * départements du plan national. Sans risque de doublon : une circonscription
   * déjà présente (même département, même nom — avec ou sans le préfixe « CS »)
   * est retrouvée et complétée, jamais recréée ; une zone déjà présente sous
   * elle est conservée telle quelle. N'écrase ni nom ni responsable saisis à la main.
   * Retourne { cs, zones } : ce qui vient d'être créé.
   */
  function installerCirconscriptions() {
    return DB.all('territoires').then(territoires => {
      const departements = {};
      territoires.filter(t => t.type === 'DEPARTEMENT').forEach(t => { departements[sa(t.nom)] = t; });

      const parParent = {};
      territoires.forEach(t => { if (t.parent_id) (parParent[t.parent_id] = parParent[t.parent_id] || []).push(t); });

      const ecrire = obj => DB.put('territoires', obj, { silencieux: true, synced: true });
      const taches = [];
      let crees = { cs: 0, zones: 0 };

      CIRCONSCRIPTIONS.forEach(([n, depNom, nom, arrondissements, nbZones]) => {
        const dep = departements[sa(depNom)];
        if (!dep) return; /* département absent : rien à rattacher */
        const cle = sa(nom);
        const existante = (parParent[dep.id] || []).filter(t => t.type === 'CIRCONSCRIPTION'
          && (sa(t.nom) === cle || sa(t.nom).replace(/^cs\s+/, '') === cle || t.code === codeCS(n)))[0];

        const socle = { type: 'CIRCONSCRIPTION', code: codeCS(n), nom, parent_id: dep.id,
          arrondissements_couverts: arrondissements || null, nb_zones_prevues: nbZones, actif: true };

        let pCS;
        if (!existante) {
          crees.cs++;
          pCS = ecrire(socle);
        } else {
          /* Complète sans écraser. L'ancien exemple « CS Natitingou 1 » reprend le nom officiel. */
          const legacyExemple = existante.code === 'CS-NAT1';
          const maj = Object.assign({}, existante);
          let change = false;
          const poser = (k, v) => { if (maj[k] === undefined || maj[k] === null || maj[k] === '') { maj[k] = v; change = true; } };
          poser('code', socle.code);
          poser('arrondissements_couverts', socle.arrondissements_couverts);
          poser('nb_zones_prevues', socle.nb_zones_prevues);
          if (legacyExemple) {
            maj.code = socle.code; maj.nom = nom; maj.responsable = null; maj.responsable_telephone = null; change = true;
          }
          pCS = change ? ecrire(maj) : Promise.resolve(existante);
        }

        taches.push(pCS.then(cs => {
          const zonesExistantes = (parParent[cs.id] || []).filter(t => t.type === 'ZONE_PEDAGOGIQUE');
          const ecrites = [];
          for (let i = 1; i <= nbZones; i++) {
            const code = codeZone(n, i);
            if (zonesExistantes.some(z => z.code === code)) continue;
            /* Une CS déjà munie de zones saisies à la main n'est pas surchargée. */
            if (zonesExistantes.length >= nbZones) break;
            crees.zones++;
            ecrites.push(ecrire({ type: 'ZONE_PEDAGOGIQUE', code, nom: nomZone(nom, i), parent_id: cs.id, actif: true }));
          }
          return Promise.all(ecrites);
        }));
      });

      return Promise.all(taches).then(() => crees);
    });
  }

  /** Une seule fois par appareil : ensuite, supprimer une zone la supprime pour de bon. */
  function majCirconscriptions() {
    return DB.meta('plan_national_cs_v1').then(fait => {
      if (fait) return { cs: 0, zones: 0 };
      return installerCirconscriptions().then(res => DB.setMeta('plan_national_cs_v1', true).then(() => res));
    });
  }

  EG.CIRCONSCRIPTIONS = CIRCONSCRIPTIONS;
  EG.ZONES_DECLAREES = ZONES_DECLAREES;
  EG.codeZone = codeZone;
  EG.installerCirconscriptions = installerCirconscriptions;
  EG.majCirconscriptions = majCirconscriptions;
})(window);
