# Guide d’utilisation — ÉduGestion Pro Master — gestion scolaire


## Version 8.3.0 — corrections de terrain
- **Documents pédagogiques (PDF)** : nouvel écran (menu Gestion pédagogique) — cahiers de l'apprenant, fichiers de résumés, d'exercices et d'évaluations, cahier d'écriture, fiches de révision CEP, fichiers de révision 4e-3e (Anglais, SVT, EPS, Français, Histoire-Géographie, PCT) et cahiers de révision de Terminale, classés par niveau et par matière, à ouvrir ou à télécharger (dossier `docs-pedagogiques/`).
- **Diplômes du personnel** : liste de propositions (BAPES, CAPES, CAPET, CAPEPS, CAPEN, CEAP, CAP, BAC, Licence, Master…) avec saisie libre conservée.

_Version 8.2.0_

### 8.2.0
- **Lycée agricole** : nouveau module « Ferme-école » (campagnes agricoles, parcelles et champs-école, cahier des travaux, cheptel avec mortalité et indice de consommation, santé animale, intrants et stocks, récoltes et ventes, matériel agricole) ; huit disciplines agricoles dans la pédagogie du secondaire (périmètre enseignant par discipline).
- Bibliothèque du secondaire : 130 épreuves APC (dont interrogations écrites et devoirs surveillés agricoles, corrigés et barèmes) et 43 fiches de préparation (8 fiches agricoles). Les valeurs chiffrées des exercices agricoles sont des ordres de grandeur à adapter au programme.

### 8.1.0
- Épreuves du secondaire : 106 épreuves APC (11 nouvelles épreuves originales de SVT en terminale (séries D, A et B), structure restitution + deux situations-problèmes + perfectionnement).

### 8.0.0
- Notes et bulletins du secondaire (6e à Tle) : élèves par classe, programme et coefficients, saisie des notes avec périmètre enseignant, moyennes, rangs, mentions, bulletins imprimables.
- Pédagogie du secondaire (6e à Tle) avec périmètre par niveau et matière.
- Préparation de classe du primaire : périmètre par cours de la classe.
- Déclarations de paiement des parents (écoles privées) avec confirmation et reçu.
- Guide, tests (`tools/test-secondaire.mjs`) et notice `DEPLOIEMENT-GITHUB.md`.


Rôles : Administration (MEMP, technique) · DDEMP · Circonscription scolaire · Conseiller pédagogique · Directeur / directrice · Enseignant(e) · Parent

## 1. Premiers pas

Premier démarrage : identifiant admin, mot de passe admin123, à changer aussitôt. Créez ensuite les comptes des vraies personnes (« **Utilisateurs & sécurité** »).

1. Choisissez l’année scolaire active et vérifiez les territoires (département, commune, circonscription, zones, UP).
2. Créez ou importez les écoles, puis ouvrez la carte de chaque école : « **Logo et devise** ».
3. Créez les classes et rattachez leur titulaire (personnel).
4. Inscrivez les élèves (saisie ou import).
5. Les raccourcis de l’accueil mènent aux tâches de chaque rôle.

## 2. École, classes et personnel

_Pour : Administration (MEMP, technique), DDEMP, Circonscription scolaire, Directeur / directrice_

1. Menu « **Écoles** » : ajoutez une école (localisation en cascade département → commune → arrondissement → village).
2. Carte de l’école : identification, localisation, « **Logo et devise** », « **Modifier** ».
3. « **Personnel** » : statut, carrière, signatures ; « **Classes** » : niveau, effectif, titulaire.

## 3. Élèves, présences, évaluations

_Pour : Directeur / directrice, Enseignant(e), Conseiller pédagogique_

1. « **Listes des apprenants** » : inscriptions, transferts, cartes d’identité.
2. « **Présence des apprenants** » : appel quotidien ; alertes de décrochage.
3. « **Évaluations** » et « **Notes et bulletins** » : saisie, calculs, bulletins signés avec code QR.
4. « **Inscription CEP** » et « **Examen blanc** ».

## 4. Documents officiels et vérification

1. « **Documents** » : chaque pièce est numérotée, horodatée et scellée ; elle porte l’en-tête du MEMP, le logo et la devise de l’école, la signature et le code QR.
2. La page de vérification (scan du QR) confirme le numéro et l’empreinte du document.

## 5. Bureaux UASCEP et sport scolaire

1. Ouvrez « **Bureaux UASCEP** » puis l’onglet « **Ajouter un membre** » : choisissez le niveau (école, UP, zone, CS, DDEMP) et l’entité ; le bureau se crée avec son premier membre.
2. Pour chaque responsable, ajoutez sa signature (dessinée au doigt ou importée) et son cachet (généré ou importé).
3. Onglet « **Documents** » : composition du bureau, PV d’élection et d’installation, attestations, liste des bureaux, tous signés avec code QR.
4. Onglet « **Vie du bureau** » : activités, réunions (rapporteur), caisse et budget (trésorier), matériel, puis « **Rapport de fin de saison** » pré-rempli.
5. Onglet « **Logo** » : le logo UASCEP du bureau (texte du bas modifiable).
6. Le module « **Sport scolaire** » gère les licences, compétitions, feuilles de match, classements et palmarès ; les résultats alimentent le rapport de saison.

## 6. Territoire et suivi administratif

Le suivi administratif entre l’école, la circonscription et le département : fiche statistique de rentrée validée à chaque niveau, fiche signalétique de l’école, courrier administratif avec accusé de lecture, référentiel des structures.

1. Ouvrez « **Territoire et suivi administratif** » (menu Vie scolaire, sport et pilotage).
2. Fiche signalétique : position GPS (bouton « **Position actuelle** » sur le téléphone, « **Voir sur la carte** »), statut juridique, autorisation et agrément, salles, latrines, point d’eau, électricité.
3. Fiche statistique de rentrée : « **Ajouter** » propose les effectifs, les classes, les enseignants et les infrastructures déjà connus ; complétez puis « **Transmettre** ».
4. La circonscription « **Valide** » ou « **Renvoie** » (motif obligatoire) ; le département valide puis « **Clôture** ». L’onglet « **Suivi des fiches de rentrée** » montre les écoles dont la fiche n’est pas reçue.
5. Courrier administratif (module « **Communication et alertes** ») : rédigez, puis « **Envoyer** » (numéro de départ D-AAAA-0001). Le destinataire l’ouvre (accusé de lecture daté, numéro d’arrivée A-AAAA-0001), le « **Marque traité** », puis l’archive.
6. Référentiel des structures (circonscription, département) : « **Amorcer le référentiel** », puis complétez les services ; « **Arbre des structures** » montre les rattachements.
7. Les décisions (validation, renvoi, lecture du courrier) redescendent par la synchronisation dans l’onglet « **Décisions transmises** ».

**Bon à savoir**

- Une fiche transmise ou un courrier envoyé ne se modifient plus (sauf fiche renvoyée).
- Visites de classe : « **Statut de la visite** » (planifiée, réalisée, rapport rédigé, validée) et « **Date de la prochaine visite** » ; une alerte signale les visites planifiées dépassées et les prochaines visites des 14 jours.
- Incidents de discipline (module « **Santé, cantine et inclusion** ») : registre interne de l’école, jamais transmis ; les châtiments corporels sont interdits.

## 7. CEP 2027 : centres et salles de composition

Le point des candidats par centre d’examen et des salles de composition en bon état, au format du tableau de synthèse de la DDEMP.

1. Ouvrez « **Examens et concours** », onglet « **CEP 2027 — Centres et salles** ».
2. Vérifiez la session (JUIN 2027) et le nombre de candidats par salle (30 à 40, 30 par défaut).
3. Onglet « **Saisie des centres** » : pour chaque centre, candidats officiels et libres (garçons, filles, dont handicapés) et salles disponibles ; « **Reprendre des listes CEP** » compte les candidats inscrits par centre. « **Ajouter un centre** », la corbeille et « **Réinitialiser** » gèrent la liste.
4. Les totaux, les salles nécessaires (effectif ÷ candidats par salle, arrondi au-dessus) et l’observation (« **Capacité suffisante** » ou « **Capacité dépassée : N salle(s) manquante(s)** ») se calculent seuls ; les centres en dépassement sont surlignés.
5. Onglets « **Tableau officiel (DDEMP)** » et « **Tableau détaillé** » : « **Télécharger PDF** » (A4 paysage, signé, code QR) ou « **Télécharger Excel** » (formules des totaux et des salles nécessaires).

**Bon à savoir**

- Une observation saisie à la main remplace l’observation automatique.
- La colonne « **Salles nécessaires** » n’entre dans les fichiers que si la case est cochée.

## 8. Classes ouvertes : simples, jumelées, multigrades

Une classe, c’est une salle et un maître : une classe jumelée (2 cours, ex. CI-CP) ou multigrade (3 cours et plus, ex. CI-CE2-CM1) compte pour UNE classe. Classes ouvertes = simples + jumelées + multigrades.

1. Rubrique « **Classes** » : une fiche par cours ; pour une classe jumelée ou multigrade, indiquez les cours regroupés (ex. « **CI-CP** ») dans « **Classe jumelée / multigrade** » de chacun de ses cours, ou le même enseignant titulaire.
2. Les fiches (recensement, rentrée, fin d’année, fiche de l’école), les tableaux de bord, les synthèses et les exports (PDF, Excel) reprennent automatiquement les classes simples, jumelées, multigrades, le total des classes ouvertes et les classes autorisées.
3. Les ratios (élèves par classe, besoin en enseignants, tables-bancs, salles) se calculent sur les classes ouvertes ; les effectifs restent par cours.
4. Toute combinaison de cours est possible pour une classe jumelée (ex. CI-CE1) : sur les fiches de rentrée et de fin d’année, colonne « **Autre combinaison** » et case « **cours concernés** ».
5. Chaque fiche se télécharge remplie : boutons « **Télécharger la fiche remplie (PDF)** » et « **(Excel)** ».
6. Accès rapide « **Listes de classe** » (menu et tableau de bord) : choisir le cours puis la classe ; liste des élèves avec effectifs G / F / T, recherche, tri, « **Télécharger PDF** », « **Imprimer** », « **Excel liste de classe (lisible)** » et, pour EducMaster, « **Excel EducMaster (importation)** », « **(notes)** » et « **(agents)** » sur les modèles officiels inchangés. MEMP-CP et DOSP : effectifs par cours et par école.
7. Les fiches remontées (école vers circonscription, CP vers CCS puis DOSP) portent leur source et leur date ; les corrections faites ensuite sont tracées (ancienne valeur, nouvelle valeur, auteur, date) dans « **Historique** » ou sur la fiche de l’école.

**Bon à savoir**

- Les classes autorisées peuvent être inférieures aux classes ouvertes : l’écart est affiché, la saisie n’est jamais bloquée.
- Exemples : CI-CP, CE1-CE2, CM1-CM2 = 3 classes ouvertes ; CI + CE2 + CM1 en multigrade = 1 classe.

## 9. Pédagogie : fiches, résumés, épreuves

1. Ouvrez « **Pédagogie** », choisissez le cours (Maternelle, CI à CM2) puis l’onglet : Planification, Fiches de préparation, Résumés, Épreuves, Progressions, Programmes, Guides.
2. Maternelle (une école maternelle ou une classe EM s’ouvre directement dessus) : choisissez la section (petits ou grands), puis le domaine (D1 à D5), le thème et le mois ou la semaine. Onglets : fiches d’activités, repères pour l’éducateur, grilles d’observation (à imprimer avec la liste des enfants), progressions, domaines et compétences ; la planification se lit par jour (emploi du temps de la section), semaine ou mois.
3. ES et EPS : les programmes suivent les mesures correctives en vigueur (onglet « **Programmes** », mention « **en vigueur** ») et les fiches y sont rattachées.
4. Filtrez par matière, sous-matière, SA et séance, ou cherchez un mot du titre.
5. Ouvrez une fiche : saisissez le nom du titulaire (filigrane, sinon la classe), puis « **Télécharger PDF** », « **Télécharger Word** » ou « **Imprimer** ». Une fiche tient sur une page, ou sur deux (un recto verso) : en-tête et éléments de planification, puis déroulement et évaluation. Le « **Classeur** » réunit toutes les fiches de la sélection, d’un jour, d’une semaine ou d’un mois.
6. Résumés : version enseignant (avec réponses) ou version élève (sans réponses) ; « **Cahier de résumés** » pour tout un cours.
7. Épreuves : sujets et corrigés par période (mensuelle, trimestrielle, passage, CEP blanc) ; « **Modifier** » pour adapter un énoncé, un barème ou l’en-tête (votre version reste sur l’appareil, « **Rétablir l’original** » revient au texte de départ).

**Bon à savoir**

- Les contenus sont conçus selon l’APC et restent à valider par le conseiller pédagogique.
- Le conseiller, le directeur et l’administration peuvent ajouter des notes visibles des enseignants.

## 10. Logo et devise de l’école

Chaque école peut avoir son logo, créé automatiquement à partir de son nom, et sa devise. Ils figurent en tête de ses documents.

1. Ouvrez la fiche de l’école, puis « **Logo et devise** » (ou « **Créer ou modifier le logo** »).
2. Écrivez la devise (ou choisissez-en une dans la liste), puis la forme (rond ou écusson), le symbole (livre, plume, soleil, épi, palmier, colombe, globe…), les initiales et les couleurs.
3. Ou importez votre propre logo (photo ou image).
4. Touchez « **Enregistrer** ». « **Télécharger SVG / PNG** » donne le logo en fichier ; « **Réinitialiser** » revient au logo automatique.

## 11. Télécharger en PDF ou en Word, imprimer

1. Ouvrez le document (fiche, liste, attestation, épreuve…) puis touchez « **Imprimer** » (ou « **Imprimer / PDF** ») : trois choix s’affichent.
2. « **Télécharger en PDF** » : un fichier PDF prêt à imprimer ou à envoyer (WhatsApp, e-mail). Sur téléphone et tablette, il est enregistré dans « **Téléchargements** », dans le dossier de l’application.
3. « **Télécharger en Word** » : un document modifiable (Word, WPS Office, Google Docs) pour adapter la fiche ou le rapport.
4. « **Imprimer** » : l’imprimante, ou « **Enregistrer au format PDF** » du téléphone ou de l’ordinateur.
5. Dans le module Pédagogie, chaque fiche, résumé ou sujet a ses boutons « **PDF** » et « **Word** » directement dans la liste, sans l’ouvrir ; les cahiers et classeurs se téléchargent aussi en un seul fichier.
6. Pour les fiches de préparation longues, choisissez « **recto verso** » dans les réglages de l’imprimante : les marges et les numéros de page sont prévus pour cela.
7. Cochez « **Graphiques d’arrière-plan** » (ou « **Couleurs** ») pour garder les bandeaux de couleur des fiches.

**Bon à savoir**

- Les fiches de préparation portent en filigrane oblique le nom du titulaire de la classe : saisissez-le une fois dans la fenêtre de la fiche (« **Titulaire** »).
- Une épreuve courte s’imprime deux fois par feuille A4 (ligne de coupe) ; réglage « **1 par page** » dans l’onglet Épreuves.

## 12. Code QR et vérification des documents

Les pièces officielles (attestations, PV, relevés, documents UASCEP, certificats…) portent un numéro, une empreinte et un code QR.

1. Pour vérifier une pièce, scannez son code QR avec l’appareil photo du téléphone : la page de vérification s’ouvre.
2. Vous pouvez aussi saisir le numéro du document dans « **Vérifier un document** ».
3. La page indique si le document est authentique, ou s’il a été modifié après sa signature.

**Bon à savoir**

- Une pièce dont le contenu a été changé après signature est signalée « **modifiée** » : rééditez-la et faites-la signer de nouveau.

## 13. Sauvegarder, restaurer, transmettre

Faites une sauvegarde au moins une fois par semaine, et toujours avant de changer d’appareil ou de mettre à jour.

1. Ouvrez « **Sauvegarde et synchronisation** » (menu de l’administration ou du compte).
2. Touchez « **Sauvegarder** » : un fichier (.json) est téléchargé. Gardez-le sur une clé USB, un ordinateur ou envoyez-le-vous par WhatsApp ou par courriel.
3. Pour restaurer, choisissez « **Restaurer** » puis le fichier de sauvegarde ; confirmez. Les données de l’appareil sont remplacées par celles du fichier.
4. Pour transmettre à l’échelon supérieur (école → zone → CS → DDEMP), utilisez l’export prévu (fiches, bilans, Excel) : le destinataire l’importe dans son application.

**Bon à savoir**

- Nommez vos sauvegardes avec la date (l’application le fait pour vous).
- Une sauvegarde contient des données personnelles : ne la partagez qu’avec les personnes autorisées.
- Copies automatiques : l’application garde aussi sur l’appareil les 10 dernières copies de vos données (une par jour d’utilisation). « **Copies automatiques et restauration** » permet de revenir à l’une d’elles ; une copie endommagée est refusée.
- Un bandeau vous rappelle d’exporter une sauvegarde quand la dernière date de plus de 7 jours.

## 14. Sécurité des comptes et de l’appareil

Les données d’élèves et de personnel sont protégées : mots de passe personnels, blocage après des essais faux, déconnexion après 20 minutes sans action.

1. À la première connexion avec un mot de passe de départ (admin123, ccs123…) ou provisoire, l’application demande d’en choisir un nouveau : c’est obligatoire.
2. Un bon mot de passe a au moins 8 caractères, des lettres et des chiffres, et ne reprend ni votre identifiant ni un mot de passe de départ.
3. Après 5 essais faux, le compte est bloqué quelques minutes sur l’appareil (puis de plus en plus longtemps) : attendez, ou demandez une réinitialisation à l’administrateur.
4. Après 20 minutes sans action, l’application vous déconnecte (ou se verrouille) ; un avertissement apparaît une minute avant.

**Bon à savoir**

- Ne communiquez jamais votre mot de passe, même à un collègue.
- Sur une application sans comptes (CS Pobè, Mon école), définissez un mot de passe d’accès dans « **Sécurité et sauvegardes** ».

## 15. Synchronisation entre niveaux

Les données remontent école → zone → circonscription → département sans ressaisie : bureaux et vie UASCEP, sport scolaire, examens, versions d’épreuves et de fiches. Les notes de service, échéances et l’agenda redescendent. Tout fonctionne hors ligne, par fichier ; par Internet quand un hub SCOLARIS est disponible.

1. Ouvrez « **Synchronisation** » (menu).
2. Par fichier : « **Préparer le fichier pour le niveau supérieur** », puis envoyez le fichier .scsync (WhatsApp, clé USB, courriel). Le destinataire fait « **Importer un fichier reçu** ».
3. Le niveau supérieur prépare de même « **le fichier pour les entités inférieures** » (notes, échéances, agenda) : chaque école ou zone l’importe.
4. Par Internet : « **Rejoindre un hub** » avec le code QR (ou l’adresse et le code d’accès) donné par le hub, puis « **Synchroniser maintenant** ».
5. Seuls les changements depuis le dernier envoi partent ; « **Envoi complet** » renvoie tout.

**Bon à savoir**

- Chaque paquet est signé par l’appareil : un fichier modifié en route est refusé.
- Si une même information a été changée des deux côtés, la valeur du niveau le plus élevé est gardée et le cas est listé dans « **Conflits à revoir** ».
- Après un changement d’appareil, le niveau supérieur doit « **Accepter la nouvelle clé** ».
- Les dossiers de santé, les besoins spécifiques, les signatures et les cachets ne quittent jamais l’appareil.

## 16. Comptes, rôles et sécurité

_Pour : Administration (MEMP, technique), DDEMP, Circonscription scolaire, Directeur / directrice_

1. « **Utilisateurs & sécurité** » : un compte par personne, avec son rôle et son école ou territoire.
2. L’enseignant est relié à sa classe par son nom : écrivez-le exactement comme celui du titulaire.
3. Le parent ne voit que l’espace parents.

## 17. Travailler sans connexion

L’application fonctionne sans internet une fois ouverte une première fois sur l’appareil. Les données sont enregistrées dans l’appareil lui-même.

1. Ouvrez l’application une première fois avec une connexion (navigateur, ou application Android / Windows installée).
2. Installez-la : sur Android, menu du navigateur puis « **Ajouter à l’écran d’accueil** », ou installez le fichier APK (code QR de la fiche d’installation).
3. Dans « **Pédagogie** », touchez « **Rendre tout disponible hors ligne** » pour garder toutes les fiches, résumés et épreuves sur l’appareil.
4. Travaillez normalement : tout ce que vous saisissez reste dans l’appareil, même téléphone éteint.

**Bon à savoir**

- Les données d’un appareil ne passent pas toutes seules sur un autre : utilisez la sauvegarde (ou l’envoi des fiches) pour les transmettre.
- Si vous videz les données du navigateur, vous effacez aussi les données de l’application : faites d’abord une sauvegarde.

## 18. Questions fréquentes et dépannage

**L’application affiche une ancienne version.**  
Fermez-la complètement puis rouvrez-la avec une connexion ; dans le navigateur, rechargez la page. Sur un site en ligne, videz le cache du navigateur pour ce site si besoin (après une sauvegarde).

**La page affiche « 404 ».**  
Vérifiez l’adresse exacte (majuscules comprises) donnée dans la fiche d’installation, ou installez l’application avec le code QR.

**Je ne retrouve pas mes données sur un autre téléphone.**  
C’est normal : chaque appareil garde ses propres données. Faites une sauvegarde sur le premier appareil et restaurez-la sur le second.

**Le PDF n’a pas les couleurs.**  
Dans la fenêtre d’impression, cochez « **Graphiques d’arrière-plan** ».

**Une liste déroulante couvre le clavier sur Android.**  
Touchez le champ : une liste de choix avec recherche s’ouvre en plein écran ; tapez quelques lettres puis choisissez.

**Qui contacter ?**  
Le concepteur : Maître Aimé FACHOLA, +229 01 96 51 03 33 (appel ou WhatsApp).

---
Conception : Maître Aimé FACHOLA — +229 01 96 51 03 33
