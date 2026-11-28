# ÉduGestion Pro V5.9

Application de gestion des écoles maternelles et primaires du Bénin, conforme à la
spécification V5.2. Elle s'installe sur téléphone, tablette et ordinateur, et
fonctionne **entièrement sans connexion** : les données sont stockées sur l'appareil
et transmises quand le réseau revient.

---

## 1. Mettre l'application en service

L'application est un site statique : aucun serveur applicatif, aucune base à
installer. Trois façons de la publier, de la plus simple à la plus robuste.

### a) Essai immédiat sur un ordinateur

Depuis le dossier `edugestion-pro` :

```bash
python3 -m http.server 8080
```

Puis ouvrez `http://localhost:8080` dans Chrome, Edge ou Firefox.

> N'ouvrez pas `index.html` par double-clic. Les navigateurs bloquent le stockage
> local sur les adresses `file://` : l'application ne pourrait rien enregistrer.

### b) Mise en ligne (recommandée pour un pilote)

Une seule commande depuis le dossier :

```bash
npx vercel --prod
```

Les configurations Vercel, Netlify et GitHub Pages sont déjà dans le dossier.
Voir **DEPLOIEMENT.md** pour les autres hébergeurs et pour la liste des
vérifications à faire une fois en ligne. HTTPS est indispensable : c'est lui qui
autorise l'installation sur l'appareil et le fonctionnement hors ligne.

Exemple avec Nginx :

```nginx
server {
    listen 443 ssl;
    server_name ecole.exemple.bj;
    root /var/www/edugestion-pro;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

### c) Réseau local d'une circonscription

Un petit ordinateur ou un Raspberry Pi dans le bureau du CS suffit à servir
l'application aux écoles qui passent s'y connecter, avec un certificat interne.

## 2. Installer sur les appareils

| Appareil | Marche à suivre |
|---|---|
| **Android** (Chrome) | Ouvrir l'adresse → bandeau « Installer ÉduGestion Pro », ou menu ⋮ → *Ajouter à l'écran d'accueil* |
| **iPhone / iPad** (Safari) | Bouton Partager → *Sur l'écran d'accueil* |
| **Windows / macOS / Linux** (Chrome, Edge) | Icône d'installation dans la barre d'adresse |

Une fois installée, l'application se lance depuis l'écran d'accueil, en plein écran,
sans barre de navigateur, et démarre même en mode avion.

## 3. Comptes de démonstration

Le premier lancement installe les référentiels — départements, 77 communes,
**118 circonscriptions scolaires et leurs 343 zones pédagogiques**, matières, règles,
modèles — mais **aucune école, aucun élève, aucun agent** : tout se saisit dans
l'application. Les comptes ci-dessous servent à la découvrir.

| Identifiant | Mot de passe | Rôle |
|---|---|---|
| `admin` | `admin123` | Administrateur (mot de passe à changer à la première connexion) |

Aucune personne fictive ni circonscription d'exemple n'est installée : les comptes des DDEMP, CS, CP, directeurs et
enseignants se créent avec les vraies personnes. Les comptes d'exemple des anciennes versions (`ddemp.atacora`,
`cs.natitingou`, `cp.zone1a`) sont retirés automatiquement des appareils déjà en service.

**Avant tout déploiement réel :** créez vos propres comptes dans
*Plus → Utilisateurs & sécurité*, puis désactivez ceux-ci. Les comptes de directeur
et d'enseignant se créent une fois l'école ajoutée (voir ci-dessous).

### Ajouter les écoles : l'onglet « Écoles »

L'onglet **Écoles** (icône 🏫, aussi dans *Modules → Socle & référentiels*) présente le
plan national : département → circonscription scolaire → zone pédagogique → écoles.

- **Ajouter** : bouton « ＋ École » au niveau du pays, d'une circonscription ou d'une
  zone (la circonscription et la zone sont alors pré-remplies). Le code de l'école doit
  être unique. « Enregistrer et compléter la fiche » ouvre ensuite la fiche complète.
- **Modifier** : changer une école de circonscription ou de zone se fait ici aussi.
- **Supprimer** : une école qui porte déjà des élèves, des classes, des agents ou des
  comptes n'est pas effacée — l'application propose de la *désactiver*, pour ne rien
  perdre. Une école ajoutée par erreur, sans donnée, se supprime pour de bon.
- **Zones** : « ＋ Zone », « Modifier la zone » et « Supprimer la zone » (refusé tant
  qu'il reste des écoles dans la zone).
- **Recherche** d'une école par nom, code ou directeur, dans le périmètre choisi.

Chaque compte ne voit et ne gère que son périmètre : l'administration tout le pays, la
direction départementale son département, la circonscription la sienne. Le conseiller
pédagogique consulte sa zone sans pouvoir la modifier.

### Circonscriptions et zones pédagogiques

Elles proviennent du document « Liste des 118 circonscriptions scolaires et zones
pédagogiques ». Ce document donne le **nombre** de zones de chaque circonscription, pas
leur nom : les zones sont donc créées sous la forme « NOM DE LA CS — Zone 1 »,
« NOM DE LA CS — Zone 2 »… et se renomment dans l'onglet Écoles. Les arrondissements
couverts, quand le document les précise, figurent sur la fiche de la circonscription.

Le document annonce 344 zones au total (21 pour le Plateau), mais le détail des six
circonscriptions du Plateau n'en compte que 20 : 343 zones sont donc créées, et l'onglet
Écoles signale la zone du Plateau à répartir jusqu'à ce qu'elle soit ajoutée.

Ces référentiels sont installés une seule fois par appareil : supprimer ou renommer une
zone n'est jamais défait au démarrage suivant.

### Mise à jour d'un appareil déjà en service

Au premier démarrage de cette version, l'application retire d'elle-même les trois écoles
d'exemple des versions précédentes (codes EP001, EP002 et EM010) et tout ce qui en
dépendait — élèves, classes, notes, agents, budget, comptes `dir.ep001`, `ens.cm2` et
`parent.demo`. Seules les écoles dont le code **et** le nom sont ceux de l'exemple sont
concernées : les écoles saisies par les utilisateurs ne sont jamais touchées.

### Nouveautés de la version 5.9 — signatures de tous les acteurs, divisions avec statistiques et courbes

**Signatures digitales de tous les acteurs** (`js/signatures.js`, écran *Signatures des acteurs*). Chacun signe une fois,
au doigt ou à la souris : élèves et parents (classe par classe), enseignants, directeur, chef de circonscription,
directeur départemental, chefs de division. La signature figure ensuite d'elle-même sur les pièces qui concernent la
personne : élève (carte d'identité scolaire, fiche d'inscription, fiche du CEP, bulletins), parent (fiche d'inscription,
fiche du CEP, bulletins), enseignant (pièces de sa classe, procès-verbaux de visite, fiche de carrière), directeur
(toutes les pièces de l'école, même éditées par la circonscription ou la DDEMP), autorités (visas, états, rapports et
plans d'action). Bouton « Signature du parent ou du tuteur » dans le dossier de chaque élève.

**Divisions et services** (`js/divisions.js`, écran *Divisions et services*), comme dans SCOLARIS et GESCOL. CS : CCS,
Conseillers pédagogiques, Secrétariat, Ressources humaines, Animation pédagogique, Administration et finances,
Organisation scolaire et prévision ; DDEMP : Direction, Examens et concours, Écoles maternelles et primaires, Ressources
humaines, Planification-administration-finances, Cantines scolaires, Statistiques, Infrastructures et équipements.
Chaque division a sa rubrique (attributions de l'AOF, chef, signature), ses **statistiques et courbes** (au choix :
courbe, histogramme, barres empilées, aires, points), ses tableaux par école (CS) ou par circonscription (DDEMP), et son
**plan d'action** (lignes tirées des attributions, état, taux de réalisation). Impression PDF avec en-tête, signature
du chef et cachet ; export Excel.

### Nouveautés de la version 5.8 — espace CP, CCS et DDEMP, appareil photo, cachets, installation

**Espace CP · CCS · DDEMP (MEMP-CP intégré)** (`js/espace-memp-cp.js`, dossier `memp-cp/`). Les conseillers
pédagogiques, les chefs de circonscription, les directions départementales et l'administration ont un bloc de menu
« Espace CP · CCS · DDEMP » qui ouvre, **à l'identique**, l'application MEMP-CP : fiches de recensement, de rentrée
et de fin d'année ; effectifs par âge (moins de 5 ans à 16 ans et plus), par sexe et par cours, avec pourcentages et
écart type, maternelles par section (SP, SG) ; infrastructures et mobilier ; écoles (salles autorisées, ouvertes,
simples, jumelées, multigrades, eau, électricité…) ; CEP (candidats par sexe, réussite) ; rapports et bilans ; personnel
et carrière ; emplois du temps, calendrier, règlement intérieur et documents officiels ; mêmes calculs, mêmes en-têtes,
cachets rond et rectangulaire, QR de vérification. L'espace s'ouvre **avec le compte déjà connecté** (même périmètre :
zone du CP, circonscription du CCS, département du DDEMP, tout le pays pour l'administration) et reprend à chaque
ouverture les écoles, les zones et le personnel du périmètre depuis ÉduGestion. Le rôle DDEMP y consulte tout son
département (sans saisir ni valider à la place du CCS). Le dossier `memp-cp/` se régénère depuis l'application MEMP-CP :
`node tools/creer-jumelle.mjs edugestion <ce dossier>/memp-cp` (dans le dépôt memp-cp-app).

**Appareil photo** (`js/camera.js`). Chaque champ photo de l'application (élève, agent, école, courrier scanné, pièce
jointe…) reçoit un bouton « 📷 Appareil photo » : caméra arrière par défaut, bascule avant ⇄ arrière fiable (même
méthode que SCOLARIS et GESCOL), la photo remplit le champ comme un fichier choisi.

**Fiche d'inscription avec la carte d'identité** (`EG.Docs.ficheInscription`). L'inscription d'un élève prend sa photo,
le père, la mère et le téléphone des parents ; la fiche d'inscription (identité, scolarité, parents, signature du
parent) porte la **carte d'identité scolaire recto-verso** à découper, avec la photo. Bouton « 🪪 Fiche d'inscription +
carte d'identité » dans le dossier de chaque élève. La carte d'identité affiche désormais la photo de l'élève.

**Cachets rond et rectangulaire** (`js/docs-socle.js`, écran *Cachets et signatures*). En plus du cachet rond, chaque
école, circonscription et direction départementale a son **cachet rectangulaire du nom** (griffe : titre, nom, 3e ligne
facultative), comme SCOLARIS, GESCOL et MEMP-CP. Forme apposée au choix : rond et rectangulaire (par défaut), rond seul,
rectangulaire seul.

**En-têtes** : toutes les pièces administratives portent le bandeau officiel du MEMP, le même que dans MEMP-CP
(armoiries, ministère, coordonnées), puis la direction départementale, la circonscription et l'école.

**Installation comme SCOLARIS et GESCOL** : application Android (.apk) et installateur Windows (.exe), fabriqués
chaque nuit, sur la page de téléchargement commune (un seul QR code pour toutes les applications) :
https://aimefachola200-bit.github.io/cs-pobe/telecharger.html — ou directement
https://github.com/aimefachola200-bit/scolaris/releases/tag/edugestion. La variante **ÉduGestion Pro Master** se
fabrique depuis cette même source : `node tools/creer-master.mjs <dossier>`.

### Nouveautés de la version 5.7 — statuts du personnel, présences par demi-journée, écoles privées, carrières

**Personnel des circonscriptions par statut** (`js/screens28.js`, menu de la circonscription : *Personnel FE*,
*Personnel ACDPE*, *Écoles privées*, *Enseignants ACDPCTD*, plus un récapitulatif par école). Pour chaque statut :
la liste des **directeurs** et des **adjoints** (tout enseignant qui n'est pas directeur), avec export Excel,
Word et impression. La catégorie « AME » s'appelle désormais **ACDPCTD** dans toute l'application (l'ancien
en-tête « Personnel AME » reste reconnu à l'import). **Chaque catégorie a sa signature numérique** (tracée une
fois par la circonscription) **et son code QR** : l'état imprimé est numéroté, scellé par une empreinte, inscrit
au registre des documents et vérifiable par `verification.html`.

**Présences en deux demi-journées** (`js/screens27.js`). Une journée = deux demi-journées (matin, après-midi) ;
les anciennes présences « journée » comptent pour les deux. Le *registre d'appel* et le *relevé mensuel*
calculent, par mois et pour l'année : demi-journées de classe du mois et de l'année, élèves ayant fréquenté la
classe, présences possibles, absences, présences effectives, pourcentage de présence, élèves n'ayant jamais
manqué ou n'ayant pas manqué plus de 4 demi-journées, élèves ayant manqué plus de 4 demi-journées, absences
imputables aux élèves de la rubrique précédente (renseignements spéciaux), et moyenne générale de l'année par
rubrique et pour toute l'année.

**Écoles privées** (`js/screens29.js`, modules *Scolarité*, *Cahier de gestion des fonds*, *Salaires* ; propres à
chaque école privée, consultables par la circonscription, la direction départementale et l'administration, invisibles
pour une école publique) : barème défini par l'école (droits d'inscription, 1re, 2e, 3e tranche, dates limites) ;
paiements par tranche avec **reçu numéroté, en lettres, scellé et avec QR** ; remises (fratrie, orphelin, bourse) ;
impayés et lettres de relance ; **fonds reçus par classe** selon l'effectif de chaque cours, avec le nombre de mois
de salaire du titulaire couverts ; **cahier de gestion des fonds** (recettes, dépenses, solde, sans double saisie
avec les paiements et les salaires) ; bilan financier par mois et par rubrique ; paie des enseignants (salaire de
base, primes, retenues, bulletin de paie).

**Gestion des carrières** (`js/screens30.js`, rubrique *Gestion des carrières*, et bouton « Dossier de carrière » sur
la fiche de chaque agent public) : suivi de tous les agents du périmètre (statut, grade, ancienneté, dernier et
prochain avancement, retraite, complétude du dossier) ; dossier de l'agent avec frise des actes, **avancement
d'échelon en un geste** (qui met à jour la fiche), projection des échelons jusqu'à la retraite, affectations,
diplômes, formations, et **fiche de carrière signée avec QR**. Règles : avancement d'échelon tous les 24 mois
après le dernier acte qui fixe l'échelon (constante `DUREE_ECHELON`), échelon maximal 15 ; sans acte connu, la date
du dernier avancement est « à renseigner » plutôt que devinée. Les agents des écoles privées en sont exclus.

Import et export : les nouvelles rubriques ont leur barre « Exporter / Importer » ; le barème de scolarité et le
cahier de fonds d'une école privée s'importent depuis un tableau Excel ou CSV.

### Nouveautés de la version 5.6 — import et export reliés à chaque rubrique

Sous l'en-tête de **chaque rubrique et de chaque module** (personnel, élèves, écoles, patrimoine, répertoire,
calendrier, courriers, statistiques, présences, bulletins, CEP, tables d'une entité…), une barre
« Import et export » propose deux boutons (`js/screens26.js`, posée automatiquement après chaque rendu) :

- **📤 Exporter** ouvre l'onglet Export du module Import et export avec les jeux de données de la rubrique
  déjà cochés (par exemple, sous « Élèves » : élèves et inscriptions) et la circonscription choisie dans
  l'écran ; le bouton « ← Retour à la rubrique » ramène à l'écran d'origine.
- **📥 Importer** (comptes de gestion : ministère, DDEMP, CS, directeur) ouvre l'import déjà réglé sur le type
  de données de la rubrique. Types repris : élèves (avec leur inscription de l'année), personnel, classes,
  statistiques des écoles, infrastructures, mobilier, équipements, contacts, calendrier, courriers,
  carrières, affectations, années scolaires. Une rubrique qui a son propre import (écoles, unités
  pédagogiques, personnel du ministère) y mène directement ; sans import propre, l'import général s'ouvre.
- Les fichiers d'élèves et de statistiques peuvent porter une colonne **École** : chaque ligne est rattachée
  à l'école correspondante, choisie **parmi les écoles de la circonscription seulement** ; une école ou un
  cours inconnu refuse la ligne, sans rien écrire.
- Pas de barre là où elle n'aurait pas de sens : Cachets et signatures, Comptes, Jeux de données, Import et
  export lui-même, Sauvegarde, Fichiers du personnel, Tous les modules.
- Paramètres d'adresse de l'écran Import et export : `jeu` (tables à cocher), `type` (type d'import), `cs`
  (circonscription), `retour` (rubrique d'origine). Le cloisonnement par circonscription est inchangé.

### Nouveautés de la version 5.5 — le menu des circonscriptions et des directions départementales

Les comptes de **circonscription (CS)** et de **direction départementale (DDEMP)** ont maintenant un menu
en trois blocs, dans l'ordre demandé ; les autres outils (espace de la circonscription, unités
pédagogiques, calendrier, comptes, jeux de données, fichiers du personnel, tous les modules) restent à
portée dans un quatrième bloc replié, « Autres outils ». Les autres rôles gardent leur menu habituel.

- **Menu principal** : Tableau de bord · Ma fiche école · Écoles · Personnel enseignant · Personnel
  administratif · Enseignants ACDPCTD (AME) · Personnel de soutien · Gestion des carrières · Visites et
  inspections · Retraite · Effectifs élèves · Infrastructures · Mobilier & matériel · Attribution des classes ·
  Gestion collégiale · Répertoires et contacts.
- **Gestion pédagogique** : Évaluations · Listes des apprenants · Présence des apprenants · Présence du
  personnel · Notes et bulletins (avec choix du cours) · Inscription CEP · Écoles à CM2 et CEP 2027 · Examen
  blanc · Cartes d'identité.
- **Administration** : Fiches officielles · Certificats · Rapports de rentrée · Archive courriers · Analyses et
  écarts · Cachets et signatures · Années scolaires · Jours fériés · Import Excel · Sauvegarde.

Écrans créés pour l'occasion (`js/screens25.js`), tous limités au périmètre du compte, avec export Excel,
impression et Word :

- **Personnel par catégorie** : enseignant (FE, ACDPE), administratif, AME, soutien. La catégorie se déduit
  de la fiche (statut « A.M.E. », corps, fonction) ; l'import du ministère reconnaît maintenant les corps
  administratifs et d'entretien. Ajout d'un agent, import du fichier du ministère, ouverture de la fiche.
- **Écoles à CM2 et CEP** : effectif de CM2 par école (inscriptions de l'année, à défaut dernières
  statistiques), fiches CEP saisies, accès direct aux fiches de chaque école.
- **Analyses et écarts** : élèves, classes et personnel déclarés confrontés à ce qui est enregistré, avec
  alertes (plus de 50 élèves par classe, moins d'enseignants que de classes, directeur non renseigné…). Le
  manque d'enseignants ne concerne que les écoles publiques.
- **Rapport de rentrée** : synthèse rédigée, observations libres, tableau école par école (classes, élèves,
  personnel, salles, places assises, manques), à imprimer ou exporter.
- **Archive des courriers** : registre des courriers arrivés et envoyés, numéro d'ordre automatique
  (A-2026-001, D-2026-001), catégorie, suivi (à traiter, traité, classé), école concernée, courrier scanné en
  pièce jointe (image ou PDF, 2 Mo au plus). Les courriers d'une circonscription ne sont vus que d'elle et
  de sa direction départementale.
- **Jours fériés** ouvre l'agenda du calendrier scolaire déjà filtré sur les jours fériés.

### Nouveautés de la version 5.4 — les écoles du Plateau et le personnel de Pobè

**Jeux de données par circonscription** (*Import et export → 🗃️ Jeux de données*). Six jeux sont
fournis pour le département du Plateau : Pobè, Adja-Ouèrè, Ifangni, Kétou 1, Kétou 2 et Sakété.
Chacun installe, **dans sa seule circonscription**, la liste des écoles publiques et privées (nom,
cycle, arrondissement, année de création, classes autorisées) et, pour Pobè, leurs statistiques.
Le jeu ne s'installe que depuis un compte dont le périmètre contient cette circonscription
(administration, direction départementale du Plateau, chef de la circonscription) ; un chef de
circonscription ne voit même pas les jeux des autres. Les écoles déjà présentes (même nom) ne sont
pas dupliquées, on n'y complète que ce qui manque. Les fichiers des jeux sont chargés à la demande
(`donnees/paquet-*.js`), jamais au démarrage.

- **Pobè** : 106 écoles publiques (88 primaires, 18 maternelles) avec classes autorisées, personnel FE /
  ACDPE / AME et élèves par cours et par sexe, plus 42 écoles privées (statistiques 2023-2024 quand le
  fichier en donne). Pour les autres circonscriptions, seules les listes d'écoles sont fournies.
- Kétou est scindée en deux circonscriptions : Kétou 1 (Adakplamè, Kétou, Kpankou) et Kétou 2
  (Idigny, Odomèta, Okpomèta).

**Effectifs et personnel par école** (*Espace de la circonscription → 📈*). Tableau par arrondissement
avec sous-totaux et total : classes autorisées, FE, ACDPE, AME, élèves par cours (CI à CM2, ou Petits et
Grands en maternelle) et par sexe. Filtres département, circonscription, année, statut public/privé ;
correction d'une école à la main (✏️) ; export Excel, impression, Word. Sans inscription individuelle,
le **recensement** reprend ces statistiques pour préremplir élèves, classes et personnel.

**Personnel au format du ministère** (*Import et export → 👥 Personnel (FE, ACDPE, AME)*). On charge les
fichiers « FE / ACDPE » et « AME » tels que remis par le ministère (colonnes Matricule, Nom, Prénoms, CS,
Nom de poste, Grade, Fonction, Téléphone…). Chaque agent est rattaché à son école d'après son nom de poste
(tolérance aux fautes d'une lettre, aux anciens noms « ex … », jamais de rabattement d'une école « /B » sur
« /A ») ; les postes non reconnus se choisissent dans une liste avant validation. Le personnel de la
circonscription (chef, DAF, DS…) va au **répertoire**, pas dans une école. Les directeurs renseignent nom et
téléphone de la fiche de l'école. Les agents dont la colonne CS n'est pas celle visée sont écartés ; un
agent déjà rattaché à une école d'une autre circonscription n'est jamais modifié. Les fichiers du
personnel (données nominatives) ne sont **pas** livrés avec l'application : chaque circonscription charge
les siens.

**Carte d'identité de l'élève** (module à part, *Pédagogie → 🪪*). Accessible depuis chaque école (boutons
« Cartes d'élèves » et, dans la carte de l'école, « Cartes d'identité des élèves ») : une carte, les cartes
cochées, une classe entière, toute l'école, ou une planche de 8 cartes vierges. Recto (armoiries, drapeau,
photo, identité, classe, code QR, cachet de l'école, signatures) et verso (école, département,
circonscription, consigne en cas de perte). La carte d'identité de l'**école** reste un module distinct.

**Écarts constatés dans les fichiers d'origine** (repris tels quels, à corriger à la main si besoin) :
le total FE affiché (71) diffère de la somme des lignes (80) ; quatre lignes d'écoles privées ont un total
différent de garçons + filles ; la ligne du PCA d'Onigbolo est illisible ; les noms des écoles privées
ne sont pas les mêmes dans la liste et dans les statistiques (rapprochés à la main, une école sans
correspondance reste sans effectifs).

### Nouveautés de la version 5.3 — l'espace de chaque circonscription

Chaque circonscription dispose désormais de ses propres outils, regroupés dans **Espace de la
circonscription** (*Modules → Socle & administration*). Tout ce qu'un chef de circonscription
saisit reste dans **sa** circonscription : un compte de circonscription ne voit jamais les écoles,
contacts, événements, unités pédagogiques, élèves ni sauvegardes d'une autre.

- **Unités pédagogiques** : la liste de chaque circonscription, avec « ＋ Unité pédagogique »,
  modification, suppression (refusée tant que des écoles y sont rattachées), rattachement d'écoles,
  import en collant une liste ou par Excel, export Excel. Dans la fiche d'une école, la liste
  déroulante « Unité pédagogique » propose celles de sa zone **et** celles de sa circonscription.
- **Répertoire et contacts** : directeurs (repris des fiches d'école) et collaborateurs — conseillers
  pédagogiques, élus, APE, partenaires… — classés **par commune**, avec téléphone, WhatsApp et e-mail
  cliquables, filtres (commune, fonction, recherche), ajout/modification/suppression, import d'une
  liste, export Excel, impression et Word avec cachet.
- **Calendrier scolaire** : vue mensuelle et agenda de l'année, événements typés (rentrée, vacances,
  examens, réunions…), bouton « Ajouter les jours fériés » (fêtes fixes et Pâques/Ascension/Pentecôte
  calculées ; les fêtes musulmanes se saisissent à la main), export Excel, agenda `.ics`, impression, Word.
- **Import et export** : export Excel (multi-feuilles) ou CSV de ce que l'on choisit ; import
  générique (personnel, classes, contacts, événements) avec modèle à télécharger, correspondance des
  colonnes, contrôle et détection des doublons avant validation ; sauvegarde et restauration
  limitées au périmètre du compte (une restauration refuse toute ligne hors périmètre).
- **Carte d'identité de l'école** : module à part, accessible directement depuis chaque école
  (bouton « Carte d'identité »), avec impression, Word et Excel.
- **Fiche d'inscription au CEP** : module à part, accessible depuis chaque école — candidats de CM2,
  « Éditer les N fiches » d'un coup, fiche vierge, liste Excel.
- **Cachets** : un seul modèle (arc supérieur, centre, arc inférieur, encre bleue ou rouge) pour
  l'école, la circonscription et la direction départementale. Le cachet de l'émetteur et la signature
  figurent au pied de tous ses documents. Dans les fichiers Word, le cachet est remplacé par un
  cadre à tamponner.

**Rien n'est copié d'une circonscription à l'autre.** Aucune donnée d'une circonscription n'est jamais
installée dans une autre : chaque circonscription charge ses écoles, ses unités pédagogiques, ses
contacts et son calendrier via les fonctions d'import ci-dessus (ou son jeu de données de la version
5.4), et ces données ne sont visibles que de son périmètre.

### Nouveautés de la version 5.2

**Maternelle et six cours.** Les niveaux de la maternelle (EM1, EM2, Petits, Moyens, Grands) restent
disponibles à côté des six cours du primaire — CI, CP, CE1, CE2, CM1, CM2. Le primaire a les mêmes
matières dans tous ses cours ; la maternelle a les siennes. « Créer les 6 cours » ouvre le primaire en
un clic ; « Ajouter une classe » sert à la maternelle et aux sections supplémentaires. Le conseiller
pédagogique n'est pas un rôle de classe : il suit
les écoles de sa zone, il n'est rattaché à aucune classe (son rôle s'appelle
`CONSEILLER_PEDAGOGIQUE` ; les anciens comptes « CP » sont migrés automatiquement).

**Comptes d'accès** (*Socle & administration → Comptes d'accès*) : quatre onglets — écoles,
enseignants, parents, élèves. « Créer les comptes manquants » génère un identifiant et un
mot de passe provisoire par personne. Le mot de passe provisoire s'affiche **une seule
fois**, dans une fenêtre qui permet de l'imprimer en fiches (à découper) ou de l'enregistrer
en Excel ; il n'est conservé que sous forme d'empreinte, et il est **à changer à la première
connexion**. Un compte ne se supprime pas : on le désactive (et on peut le réactiver ou
réinitialiser son mot de passe). Un parent voit ses enfants ; un élève accède à « Mon dossier ».

**Classes & rôles de gestion** : attribution d'un titulaire à chacune des six classes de
l'école, et rôles de gestion collégiale (comité de direction, conseil des maîtres, APE, AME,
comité de santé, comité de cantine…) avec président, secrétaire, trésorier, etc. L'écran
signale les postes du bureau restés vides. L'ancienne route « attribution de classes »
redirige vers cet écran.

**Téléchargements** : fiches de recensement (pré-remplie depuis l'application, vierge, ou
récapitulatif Excel de tout le périmètre), fiche de collecte, fiches à remplir (liste de
classe, inscription, registre d'appel, fiche de notes, présence du personnel, fiche agent,
procès-verbal) et certificats (scolarité, fréquentation, transfert). Chaque pièce sort en
PDF (fenêtre d'impression → « Enregistrer au format PDF »), en Word ou en Excel selon le cas.
Ces sorties sont des formulaires : elles ne sont pas enregistrées dans le registre des
documents scellés, contrairement aux certificats officiels à souche.

**Importer les écoles d'une circonscription** (*Écoles par circonscription → Importer*) :
on choisit la circonscription, on colle la liste (une école par ligne) ou on charge un fichier
Excel/CSV, on corrige dans un tableau modifiable, puis on valide : les écoles, leurs zones,
arrondissements et villages sont créés d'un coup, avec des codes automatiques et leur fiche
de recensement.

**Mises à jour sans écran vide.** Une entrée « Tous les modules » figure en tête du menu. Si une autre
fenêtre d'ÉduGestion Pro reste ouverte sur une ancienne version, la mise à jour de la base locale attend
qu'elle se ferme : l'application l'explique désormais à l'écran (au lieu de rester vide) et propose
« Recharger ». Quand une nouvelle version est installée, un message invite à actualiser la page.

**Interface à deux panneaux** : le tableau des menus (à gauche) et le grand tableau (à droite)
défilent indépendamment — faire défiler l'un ne déplace pas l'autre. Sur téléphone, le menu
devient un tiroir ouvert par le bouton ☰.

## 4. Ce que contient l'application

Les 26 modules de la spécification, plus quatre modules d'administration (réseau des écoles,
comptes, classes & rôles, téléchargements), sont accessibles et opérationnels. Trente et un
disposent d'un espace de travail dédié ; les 97 tables du modèle de données ont
toutes un écran de consultation, de création, de modification et d'export CSV.

### Les neuf matières du primaire

| N° | Épreuve | Code |
|---|---|---|
| 1 | Dictée | `DICT` |
| 2 | Communication écrite | `COMM_ECR` |
| 3 | Compréhension de l'écrit | `COMP_ECR` |
| 4 | Mathématiques | `MATH` |
| 5 | Éducation sociale | `ESC` |
| 6 | Éducation scientifique et technologique | `EST` |
| 7 | EA Plastique | `EA_PLAST` |
| 8 | EA Vivant | `EA_VIV` |
| 9 | Éducation physique et sportive | `EPS` |

La dictée est une épreuve à part entière, distincte de la communication écrite.
C'est ce total de neuf qui fonde la règle des six maîtrises aux examens blancs —
six sur huit lorsque l'EPS est dispensée. Le référentiel se réaligne au démarrage
sur les appareils déjà installés, sans perdre les notes déjà saisies.

**Espaces de travail dédiés**

- **Élèves** — inscription avec contrôle des doublons avant création, dossier permanent (identité, résultats par matière, assiduité, famille, handicap, risque), transfert et abandon tracés
- **Personnel** — dossier de l'agent : carrière, affectations, diplômes, formations, unités pédagogiques, visites reçues, évaluation annuelle, échéance de retraite
- **Patrimoine** — locaux et leur état, accessibilité, mobilier et places assises, équipements, ressources pédagogiques, services (eau, électricité, latrines)
- **Visites** — conduite d'une visite, observations, recommandations avec échéance et suivi, plans d'amélioration, procès-verbal
- **Gouvernance** — instances (APE, AME, comités), réunions consignées, moyens d'information des familles
- **Présences** — appel de classe en trois touches, repérage des absences répétées
- **Évaluations** — grille de notes par matière, moyennes et maîtrises calculées en direct, validation puis verrouillage
- **Bulletins et décisions** — moyenne pondérée, mention, rang, décision de passage motivée
- **CEP** — examens blancs (règle des 6 maîtrises sur 9, ou 6 sur 8 si l'EPS est dispensée) et résultats officiels
- **Retraite** — prévisions à 1, 3, 5 et 10 ans, campagnes de notification
- **Recensement** — formulaire pré-rempli depuis les données déjà saisies, contrôles de cohérence, transmission
- **Budget** — quatre composantes de ressources, exécution, circuit de validation
- **Cantine** — pointage quotidien, et un écran de contributions qui donne, par élève, ce qui est dû et ce qui est réglé au jour, à la semaine, au mois et à l'année, avec liste de paiement à émarger
- **Registre d'appel** — le calendrier des jours de classe croisé avec la liste alphabétique : sans marque l'élève est compté présent et la case affiche **P** en vert, une touche la passe à **A** en rouge. Les jours chômés sont en rouge et sortent du calcul. Le calendrier de septembre à juin s'engendre en un geste — lundi au vendredi, moins les fêtes civiles et chrétiennes calculées, Pâques et ses dérivées comprises ; les fêtes musulmanes, fixées chaque année par décret, se déclarent depuis l'écran
- **Relevé mensuel de fréquentation** — le registre officiel de septembre à juin : demi-journées de classe, élèves ayant fréquenté, présences possibles, absences, présences effectives, pourcentage, élèves à quatre absences ou moins, élèves au-delà et absences qui leur sont imputables. Les lignes Total et Moyenne se calculent seules, la moyenne ne portant que sur les mois effectivement tenus
- **Bilan de présence** — taux par cours et par mois, puis récapitulatif annuel avec absences justifiées et retards
- **Tableau d'affichage de classe** — courbe des âges filles/garçons contre l'âge théorique du cours, courbe d'assiduité mensuelle, courbe de la moyenne de classe évaluation après évaluation ; à imprimer et à afficher
- **Risques** — score explicable de 0 à 100, ouverture d'accompagnements
- **Alertes** — détection automatique sur six familles de situations
- **EDUCMaster** — matricules, analyse du fichier à la recherche de doublons, fusion de dossiers, arbitrage des conflits
- **Clôture d'année** — contrôles, calcul des décisions, création de l'année suivante, préinscriptions, bascule
- **Calendrier scolaire** — jours ouvrables, fermetures motivées
- **Synthèse officielle de l'évaluation** — le document qui remonte à la circonscription et à la DDEMP : en-tête d'identification complet (zone pédagogique, unité pédagogique, école, CS, DDEMP, année, directeur, CCS, titulaires, type d'évaluation, nombre de classes), tableau par matière avec inscrits et composants par sexe, maîtrise partielle, maîtrise minimale, taux de réussite et élèves à renforcer, ligne « Ensemble », participation et réussite au seuil par sexe, puis les quatre sections — analyse quantitative par cours, analyse qualitative avec appréciations, analyse des écarts de genre, conclusion — chacune accompagnée de son commentaire rédigé à partir des chiffres. Se calcule à la classe, à l'école ou à l'unité pédagogique
- **Panneau de pilotage des évaluations** — vue d'exploration qui agrège de la classe au national, en passant par le cours, l'école, la zone pédagogique, la circonscription et le département : analyse quantitative (inscrits, composants, absents, maîtrise minimale et partielle, réussite, moyenne, écart-type), analyse qualitative avec appréciation et suite à donner, écarts entre filles et garçons, épreuves fortes et faibles
- **Examen blanc en centre** — plusieurs écoles composent ensemble : les neuf épreuves, le total, la moyenne, le nombre de maîtrises et un rang calculé à l'échelle du centre, avec relevé de centre et export Excel
- **Présence du personnel** — pointage quotidien sur sept positions (présent, absent, retard, mission, congé, formation, maladie), relevé mensuel et bilan annuel
- **Attribution des classes** — chaque classe reçoit un titulaire ; l'écran signale les classes sans titulaire et les enseignants sur deux classes
- **Statistiques**, **Rapports**, **Portail parents**, **Synchronisation**

**Pièces officielles**

Chaque édition porte un numéro, une empreinte, un **code QR de vérification**, le
cachet de l'établissement dessiné à partir de ses données, et la signature du
responsable si celui-ci l'a enregistrée (*Mon compte → Ma signature*, tracée au
doigt ou à la souris).

- **Fiche d'inscription au CEP** — une feuille A4 par candidat, aux insignes du
  ministère, reprise du modèle transmis par la Direction Départementale : en-tête du ministère, session et centre, école de provenance,
  identité du candidat, trois établissements choisis, dispenses d'âge et de sport,
  engagement du parent, cadre réservé à l'agent de la DDEMP et les trois mentions
  « TRÈS IMPORTANT ». La signature du candidat et celle du directeur y sont
  apposées automatiquement, chacune une seule fois, à l'emplacement prévu par le
  modèle. Les renseignements propres au candidat se saisissent dans l'application
  et sont conservés d'une édition à l'autre.
- **Carte d'identité scolaire** — **recto et verso**. Le verso porte la photo de l'école, son nom, sa localisation dans le territoire — DDEMP, circonscription, commune, arrondissement, village ou quartier — et la mention de propriété avec la conduite à tenir en cas de perte, contacts de l'école compris. Tout s'y remplit depuis la fiche de l'établissement. Sur une planche de classe, les rectos s'impriment d'abord, puis les versos dans le même ordre. Le recto garde son pourtour aux couleurs du drapeau national,
  armoiries de la République en tête à gauche et drapeau à droite, sceau en
  filigrane, code QR de l'élève, cachet de l'école et deux emplacements de
  signature : l'élève et le directeur. À l'unité depuis le dossier d'un élève, par
  classe, ou pour toute l'école d'un coup — du CI au CM2 comme en maternelle.
- **Certificat de scolarité** — un exemplaire par feuille A4, aux insignes du
  ministère. Filiation, matricule de l'école, appréciations d'assiduité, de conduite
  et de travail, le **NIP** et le matricule EDUCMaster dans le cadre
  d'identification, puis la signature du directeur et le cachet de l'école en pied.
- **Fiche d'évaluation de l'agent** — modèle de la Direction de l'Administration et
  des Finances : identification avec NIP, situation administrative, actes de
  carrière, puis les onze critères notés aux deux niveaux — supérieur hiérarchique
  et comité de direction — avec la classe de performance calculée.
- **Bulletin**, **liste de classe**, **liste de paiement de la cantine**, **bilan de
  présence**, **relevé de centre**, **synthèse d'évaluation**, **répartition des
  classes**, **relevé de présence du personnel**, **tableau d'affichage**,
  **PV de visite**, **fiche de carrière**, **état budgétaire**, **état du patrimoine**.

**Certificats administratifs du personnel**

Sept modèles officiels, dans le compte du directeur (*Personnel → Certificats
administratifs*) : présence au poste, prise de service, reprise de service et
prise de service des AME avec leur cadre de visas, attestation de direction,
certificat de travail, certificat de prise en charge. Matricule, NIP, grade et
dates sont repris du dossier de l'agent ; seules les références d'actes se
saisissent. Chaque pièce porte la ligne « SO N° … / école / CS-… / DDEMP-… / SP »,
la signature du directeur avec son nom en dessous, et le cachet à côté.

**Cachet paramétrable**

*Personnel → Cachet de l'établissement* compose le cachet en trois mentions :
l'arc supérieur, le texte central et l'arc inférieur, les deux arcs séparés par
une étoile. Chaque directeur saisit les siennes et choisit l'encre, bleue ou
rouge, avec un aperçu à l'échelle d'impression.

**Annuaire des écoles — la collecte à l'échelle d'une circonscription**

*Socle & référentiels → Annuaire des écoles*, ou le raccourci du tableau de bord
d'un chef de circonscription. L'écran liste les écoles du périmètre — celles
rattachées au territoire du compte, y compris les territoires qui en dépendent —
et classe les plus incomplètes en tête. Chaque ligne indique le nombre de
rubriques renseignées ; en l'ouvrant, on voit ce qui manque, groupe par groupe.

Quatre façons de remplir l'annuaire :

- **À la main**, école par école, depuis l'écran.
- **Par classeur** : le *modèle de collecte* se télécharge pré-rempli avec les
  écoles déjà connues et une feuille de légende qui donne, pour chaque rubrique,
  le type et les valeurs attendues. Une fois complété — par la circonscription ou
  par chaque directeur — il se réimporte : le rapprochement se fait sur le code de
  l'école, une école inconnue est créée, une école connue est complétée, et rien
  n'est effacé. L'écran annonce avant validation combien de lignes seront créées,
  mises à jour, ou laissées telles quelles.
- **Sur papier** : la *fiche de collecte* s'imprime vierge, groupée en six
  rubriques, à remettre aux directeurs qui n'ont pas encore l'application.
- **Par les écoles elles-mêmes**, chaque directeur complétant sa propre fiche dans
  son installation ; la synchronisation remonte l'information.

L'annuaire complet s'exporte enfin en un classeur, une ligne par école et une
colonne par rubrique.

**Identification des écoles**

La fiche d'un établissement suit le feuillet officiel du MEMP : identification
administrative (type, région pédagogique, année et référence de création,
arrondissement, village ou quartier), environnement et accessibilité (six
distances de référence, accès permanent, inondabilité, électrification, source
d'eau, pollution), domaine et équipements collectifs (titre de propriété,
superficie, clôture, point d'eau, latrines et leur détail, bibliothèque, terrain
de sport, aménagements pour le handicap), structure pédagogique (classes
autorisées et existantes, salles, classes simples, jumelées, multigrades),
langues d'enseignement et instances de gestion (APE, AME, comité de direction,
conseil des maîtres). Une photo de l'école peut y être jointe : elle est
redimensionnée sur l'appareil et ne part jamais sur le réseau.

**Installer l'application**

Un bandeau « Installer ÉduGestion Pro » s'affiche quelques secondes après
l'ouverture. Quand le navigateur sait installer directement, il le propose d'un
geste ; sinon le bandeau explique la marche à suivre, différente selon la
situation : ouverte depuis un fichier du disque, il faut d'abord mettre
l'application en ligne — les navigateurs réservent l'installation aux adresses
sécurisées ; sur iPhone et iPad, l'installation passe par le bouton Partager de
Safari ; ailleurs, par le menu du navigateur. Le bandeau se ferme d'un geste et
ne revient pas pendant la session ; la marche à suivre reste accessible depuis
*Mon compte → Installer l'application*.

**Signatures**

Trois personnes peuvent signer. Le **responsable qui édite** enregistre sa signature
dans *Mon compte*. L'**enseignant** le fait depuis son dossier : son nom et sa
signature figurent alors au pied de chaque document de sa classe, à côté de ceux du
directeur, et le pied de page rappelle la classe et son titulaire. L'**élève** signe
depuis son dossier ; sa signature est reportée sur sa fiche d'inscription au CEP.
Toutes sont tracées au doigt ou à la souris et restent sur l'appareil.

Deux codes QR cohabitent. Celui de l'**élève** porte son identité minimale —
matricule, nom, sexe, date de naissance, cours, école, année — et se lit avec
n'importe quel téléphone : il figure sur la carte scolaire et sur la fiche CEP.
Celui du **document** mène à son adresse de vérification et porte son empreinte ;
il est en pied de chaque pièce éditée. Le générateur est conforme à la norme
ISO/IEC 18004 et n'appelle aucune bibliothèque.

Toute pièce administrative éditée part sous les armoiries de la République et le
logo du ministère, avec la direction départementale, la circonscription et le nom
de l'école. Les pièces qui ont leur propre en-tête officiel — fiche CEP,
certificat, fiche d'évaluation de l'agent, carte scolaire — gardent le leur.

Le code QR d'un document ouvre `verification.html`, une page qui interroge la base
de l'appareil et rend l'un de quatre verdicts : *document authentique* quand le
numéro figure au registre et que l'empreinte concorde ; *l'empreinte ne correspond
pas* quand la pièce a été modifiée ou rééditée ; *document introuvable sur cet
appareil* sur le téléphone d'un parent, qui ne détient pas la base — avec les
références à présenter à l'école ; et un message clair si le stockage est
inaccessible. La page ne consulte aucun serveur et ne transmet rien.

Le cachet identifie l'émetteur ; il ne remplace pas un sceau humide. L'authenticité
se vérifie par le numéro, l'empreinte et le code QR, tous enregistrés avec la
signature dans la table des signatures de documents.

**Notes sous Excel**

Depuis l'écran des évaluations : *Télécharger en Excel* produit un vrai fichier
`.xlsx` — une feuille de notes avec une colonne par matière et l'identifiant de
chaque élève, plus une feuille rappelant les codes et coefficients. L'enseignant le
remplit hors ligne, puis *Importer depuis Excel* replace les notes dans la grille,
où il les vérifie avant d'enregistrer. Les valeurs hors de 0–20 et les lignes sans
correspondance sont signalées et écartées. Le `.csv` est accepté aussi. Lecture et
écriture se font sur l'appareil, sans aucune bibliothèque externe.

**Règles métier appliquées**

| Règle | Mise en œuvre |
|---|---|
| Passage automatique | EM1, EM2, Petits, Moyens, Grands |
| Moyenne ≥ 10/20 | CI, CE1, CM1 |
| 2/3 de maîtrises | CP, CE2, CM2 |
| CEP officiel admis | **Prioritaire** : sortie du primaire, quelle que soit la décision pédagogique |
| Perfectionnement | 10–14 : +1 pt · 15–17 : +1,5 pt · 18–20 : +2 pts |
| Retraite | C1 : 55 ans · B1 : 58 ans · A1, A2, A3 : 60 ans, échelons 1 à 15 |

Les règles sont regroupées dans `js/rules.js` : une seule source de vérité,
versionnée (`MEMP-2026.1`), modifiable sans toucher au reste de l'application.

## 5. Fonctionnement hors ligne

Chaque écriture est enregistrée dans la base locale de l'appareil (IndexedDB) et
déposée dans une file d'attente avec une clé d'idempotence. L'indicateur en haut à
droite affiche en permanence l'état : *À jour*, *N en attente*, ou *Hors ligne*.

L'écran **Synchronisation** permet de transmettre la file, de sauvegarder toutes les
données dans un fichier JSON, et de restaurer une sauvegarde — utile pour transférer
un poste ou remonter les données d'une école sans réseau par clé USB.

## 6. Brancher le serveur national

L'application est prête à parler à l'API décrite dans la spécification. Deux points
d'entrée à modifier :

- `js/db.js` — la fonction `outboxClear` est le point où la file d'attente doit être
  envoyée à `POST /sync/push` avant d'être vidée ;
- `js/app.js` — l'authentification locale se remplace par `POST /auth/login` avec les
  jetons d'accès (15 min) et de rafraîchissement (30 j).

Le modèle local reprend exactement les noms de tables et de champs PostgreSQL de la
spécification : la correspondance avec le serveur est directe, sans traduction. Le
statut EDUCMaster est déjà porté par chaque élève, et les élèves sans matricule sont
listés dans l'écran Synchronisation.

## 7. Organisation des fichiers

```
edugestion-pro/
├── index.html              page d'entrée
├── verification.html       vérification publique d'un document
├── manifest.webmanifest    installation sur l'appareil
├── sw.js                   fonctionnement hors ligne
├── css/app.css             design system
├── assets/                 en-tête officiel du ministère
├── icons/                  icônes d'application
├── donnees/                jeux de données du Plateau, un fichier par circonscription (chargés à la demande)
└── js/
    ├── schema.js           107 entités, 50 modules
    ├── db.js               base locale, file d'attente, audit
    ├── rules.js            règles métier officielles
    ├── seed.js             référentiels et données de démonstration
    ├── ui.js               composants, routeur, formulaires
    ├── screens.js          tableau de bord, scolarité, pilotage
    ├── screens2.js         élèves, personnel, patrimoine, visites, gouvernance
    ├── screens3.js         EDUCMaster, clôture d'année, calendrier
    ├── screens4.js         fiches CEP, cantine payante, bilans, affichage
    ├── screens5.js         synthèses, centre d'examen, présence du personnel
    ├── screens6.js         certificats du personnel, cachet de l'établissement
    ├── screens7.js         relevé mensuel de fréquentation
    ├── screens8.js         registre d'appel et calendrier engendré
    ├── screens9.js         synthèse officielle de l'évaluation
    ├── screens10.js        annuaire et collecte des écoles
    ├── screens11.js        plan national : circonscriptions, zones, écoles
    ├── screens12.js        comptes d'accès (écoles, enseignants, parents, élèves)
    ├── screens13.js        classes, rôles de gestion collégiale, téléchargements
    ├── screens14.js        import des écoles d'une circonscription
    ├── screens15.js        espace de la circonscription, unités pédagogiques, cloisonnement par CS
    ├── screens16.js        répertoire et contacts par commune
    ├── screens17.js        calendrier scolaire
    ├── screens18.js        carte d'identité de l'école, fiche d'inscription au CEP
    ├── screens19.js        cachets (école, circonscription, direction départementale)
    ├── screens20.js        import et export, sauvegarde et restauration
    ├── screens21.js        jeux de données par circonscription (catalogue, installation cloisonnée)
    ├── screens22.js        effectifs et personnel par école (tableau, export, impression)
    ├── screens23.js        import du personnel au format du ministère (FE, ACDPE, AME)
    ├── screens24.js        carte d'identité de l'élève (module à part)
    ├── screens25.js        rubriques CS et DDEMP : personnel par catégorie, CM2 et CEP, écarts, rapport de rentrée, courriers
    ├── screens26.js        import et export reliés à chaque rubrique (barre « Exporter / Importer »)
    ├── screens27.js        présences par demi-journée, registre d'appel, relevé mensuel
    ├── screens28.js        personnel par statut (FE, ACDPE, privé, ACDPCTD), signature et QR de chaque catégorie
    ├── screens29.js        écoles privées : scolarité, reçus, cahier de fonds, bilan, salaires
    ├── screens30.js        gestion des carrières : suivi, dossier, avancement d'échelon, fiche signée
    ├── sortie.js           impression, Word, Excel, mots de passe provisoires
    ├── tableur.js          lecture et écriture des classeurs .xlsx et .csv
    ├── qr.js               générateur de codes QR (ISO/IEC 18004)
    ├── docs-socle.js       cachet, codes QR, signatures, en-têtes
    ├── docs-modeles.js     carte scolaire, certificat, fiche CEP, fiche agent
    ├── docs-styles.js      feuille de style des pièces imprimées
    └── app.js              session, droits, navigation
```

## 8. Sécurité — état actuel

Ce qui est en place : rôles et périmètres (un directeur ne voit que son école), un
journal d'audit alimenté à chaque action sensible, le verrouillage des évaluations,
budgets, résultats CEP et fiches de recensement, et l'empreinte de chaque document
édité.

Ce qui relève du serveur, à la mise en réseau : le chiffrement des données au repos,
le Row-Level Security PostgreSQL, l'authentification à double facteur pour les rôles
sensibles, et la révocation des sessions. Tant que l'application tourne seule sur un
appareil, protégez l'appareil lui-même par un code de verrouillage.

## 9. Contrôle des doublons d'élèves

À chaque inscription, l'application compare le nom, les prénoms, la date de
naissance et le sexe avec tous les dossiers existants. Au-delà de 60 % de
ressemblance, elle affiche les dossiers proches avant de créer quoi que ce soit :
l'agent choisit alors de **réinscrire** l'élève existant — son historique reste
intact jusqu'au CEP — ou de confirmer qu'il s'agit bien d'un autre enfant. C'est le
point où se jouent la plupart des doublons dans un fichier national.

## 10. Le cycle d'une année scolaire

L'application accompagne l'année du début à la fin, et la boucle est fermée :

1. **Rentrée** — inscriptions, avec contrôle des doublons ; ou confirmation en bloc
   des élèves attendus d'après les décisions de l'année précédente.
2. **En cours d'année** — appel, notes des neuf évaluations, cantine, visites,
   recensement, budget.
3. **Fin d'année** — l'écran *Clôture* vérifie que les évaluations sont verrouillées,
   que chaque élève a une décision et que les résultats du CEP sont officiels.
4. **Décisions** — calculées d'un coup pour toute l'école, selon les règles du
   niveau, le CEP officiel primant sur tout le reste.
5. **Année suivante** — création de l'année, reprise des classes, puis génération
   des préinscriptions : passage au niveau supérieur, redoublement au même niveau,
   et sortie du primaire pour les admis au CEP.
6. **Bascule** — la clôture fige l'année, ouvre la suivante et fait basculer
   l'application dessus. Les préinscriptions attendent alors leur confirmation
   dans l'écran *Élèves*.

## 11. Réinitialiser un appareil

*Synchronisation → Réinitialiser l'appareil* efface toutes les données locales et
réinstalle le jeu de démonstration. Sauvegardez avant si les données comptent.
