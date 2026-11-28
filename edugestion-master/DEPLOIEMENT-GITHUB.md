# Déployer ÉduGestion Pro Master sur GitHub (version 8.2.0)

Même principe que GESCOL et Scolaris : vous déposez les fichiers, GitHub fait le reste.
Dépôt : https://github.com/aimefachola200-bit/EdugestionProV5

## 1. Déposer les fichiers
1. Décompressez `edugestion-pro-master-8.2.0.zip` (version complète) sur votre ordinateur.
2. Dans votre copie locale du dépôt, remplacez les fichiers par ceux du zip (ou, sur GitHub : « Add file » → « Upload files », glissez le contenu du dossier, « Commit changes » sur la branche `main`).
3. Supprimez du dépôt les vieux zip qui traînent à la racine (`edugestion-pro (6).zip`, `files (3).zip`, `files (11).zip`) : ils alourdissent inutilement le dépôt.
   Une version « seulement les fichiers modifiés » est aussi fournie : `edugestion-pro-master-8.2.0-modifs.zip` (à décompresser par-dessus la version 7.6.1).

## 2. Publication automatique (GitHub Pages)
Le fichier `.github/workflows/pages.yml` est déjà dans le dépôt. À chaque envoi sur `main`, GitHub :
- exécute les contrôles (filigrane interdit, ancienneté, suivi administratif, classes ouvertes, **secondaire et déclarations de paiement**) ;
- publie le site sur la branche `gh-pages` : https://aimefachola200-bit.github.io/EdugestionProV5/

Première fois seulement : Settings → Pages → Source « Deploy from a branch », branche `gh-pages`, dossier `/ (root)`.

## 3. Marquer la version (étiquette)
```bash
git tag -a v8.2.0 -m "8.2.0 : pédagogie, bulletins, vie de l'établissement et examens du secondaire, maître de semaine, périmètre de la préparation de classe, déclarations de paiement"
git push origin main --tags
```
Le workflow des applications Android (APK) et Windows (EXE) avec codes QR, qui alimente la page de publication « edugestion », se déclenche comme pour GESCOL et Scolaris à partir de ce dépôt.

## 4. Vérifier après publication
- Ouvrir l'adresse Pages, se connecter (`admin` / `admin123`, à changer aussitôt).
- Menu « Gestion pédagogique » : « Pédagogie du secondaire (6e à Tle) » doit s'ouvrir.
- Rouvrir l'application une fois en ligne : l'ancienne version se remplace seule (cache 8.2.0).

## 5. Ce que la version 8.2.0 apporte
- **Pédagogie du secondaire (6e à Terminale)** : 106 épreuves APC avec corrigé, fiches de préparation, banque d'épreuves, bréviaires de langues, repères, textes officiels. Contenus de GESCOL / Scolaris, disponibles hors ligne.
- **Périmètre d'accès** : l'enseignant du secondaire ne voit que ses niveaux et matières (champs « Niveaux du secondaire », « Matières du secondaire » du compte) ; direction, CP, circonscription, DDEMP et administration voient tout.
- **Préparation de classe du primaire avec périmètre** : l'enseignant n'ouvre que le cours de sa classe (cours regroupés des classes jumelées ou multigrades inclus, ou ceux du champ « Cours ouverts en préparation de classe »).
- **Notes et bulletins du secondaire** : élèves par classe, coefficients par niveau et série (aucun coefficient en 6e et 5e), saisie des notes limitée au périmètre de l'enseignant, moyennes, rangs, mentions, bulletins à imprimer.
- **Maître de semaine** (primaire) : planning par rotation, journal quotidien, visa du directeur, rapport hebdomadaire.
- **Vie de l'établissement** et **Examens BEPC / BAC** (secondaire) : professeurs, conseils de classe, discipline, emplois du temps avec conflits, stages ; centres, candidats, numéros de table, convocations, statistiques.
- **Annonces au personnel** et **Relevé mensuel des présences** (primaire), **Pilotage et ETP** du secondaire (tableau synoptique, identité, filières, ateliers).
- **Déclarations de paiement** (écoles privées, idée tirée de ScolaPro Africa) : le parent déclare un paiement Mobile Money / virement ; la direction confirme (reçu numéroté) ou rejette avec motif.

## 6. Mettre à jour les contenus du secondaire plus tard
Les contenus viennent de GESCOL : `python3 outils/exporter_secondaire.py <dossier>/data/secondaire` (depuis le dossier GESCOL), puis déposer le dossier `data/secondaire/` et augmenter le numéro de version dans `sw.js`.
