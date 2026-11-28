# Mettre ÉduGestion Pro Master en ligne

L'application est un site statique : pas de serveur applicatif, pas de base à
installer, aucune dépendance à télécharger. Il suffit de publier le dossier tel
quel, **en HTTPS** — c'est la condition pour que l'installation sur les appareils
et le fonctionnement hors ligne marchent.

Les fichiers de configuration nécessaires sont déjà présents : `vercel.json`,
`netlify.toml`, `.nojekyll`.

---

## Vercel — une commande

```bash
cd edugestion-pro
npx vercel --prod
```

À la première exécution, Vercel demande de se connecter puis propose un nom de
projet. Répondez « non » à la question sur le répertoire de build : il n'y en a
pas. L'adresse finale s'affiche à la fin.

## Netlify — glisser-déposer

```bash
cd edugestion-pro
npx netlify-cli deploy --prod --dir .
```

Ou, sans rien installer : ouvrez <https://app.netlify.com/drop> et déposez-y le
dossier `edugestion-pro`.

## Cloudflare Pages

```bash
cd edugestion-pro
npx wrangler pages deploy . --project-name edugestion-pro
```

## GitHub Pages

```bash
cd edugestion-pro
git init && git add -A && git commit -m "ÉduGestion Pro Master"
git branch -M main
git remote add origin git@github.com:VOTRE-COMPTE/edugestion-pro.git
git push -u origin main
```

Puis, dans les réglages du dépôt : **Settings → Pages → Source : main / (root)**.
Le fichier `.nojekyll` est déjà là pour éviter que GitHub ne filtre les fichiers.

## Votre propre serveur

```nginx
server {
    listen 443 ssl http2;
    server_name edugestion.exemple.bj;
    root /var/www/edugestion-pro;
    index index.html;

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location / { try_files $uri $uri/ /index.html; }
}
```

Un certificat gratuit s'obtient avec `certbot --nginx -d edugestion.exemple.bj`.

## Serveur local d'une circonscription

Un petit ordinateur ou un Raspberry Pi dans le bureau du CS suffit pour desservir
les écoles qui viennent s'y connecter. Servez le dossier avec Nginx et un
certificat interne : une fois l'application installée sur les tablettes, elles
n'ont plus besoin du réseau au quotidien.

---

## Après la mise en ligne — à faire avant d'ouvrir aux écoles

1. Ouvrir l'adresse sur un téléphone, vérifier que le bandeau **« Installer
   ÉduGestion Pro Master »** apparaît, et installer l'application.
2. Activer le mode avion et relancer : l'application doit démarrer normalement.
3. Se connecter en `admin` / `admin123`, créer les comptes réels dans
   *Plus → Utilisateurs & sécurité*, puis **désactiver les six comptes de
   démonstration**.
4. Créer l'année scolaire, les écoles, les classes et le calendrier.
5. Demander à chaque directeur d'enregistrer sa signature
   (*Mon compte → Ma signature*) : elle sera apposée sur les documents édités.
6. Éditer une liste de classe, scanner le code QR de son pied de page et vérifier
   que la page de vérification répond « Document authentique ».
