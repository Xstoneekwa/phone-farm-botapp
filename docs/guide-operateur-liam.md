# Guide opérateur — BotApp (Liam)

Ce guide décrit comment utiliser **BotApp** au quotidien, sans terminal, sans Cursor et sans connaissance technique.

## Application à utiliser

**Seule application normale pour l’exploitation :**

`/Users/admin/Projects/BotApp/release/mac-arm64/BotApp.app`

Dans Finder : ouvrir le dossier `release/mac-arm64`, puis **double-cliquer sur BotApp**.

Ne pas utiliser d’autre copie de BotApp (par exemple une ancienne version sur le Bureau).

---

## Ce que Liam doit voir quand tout va bien

En haut de l’écran, bandeau **vert** :

- **Connexion BotApp : opérationnelle**
- **Dispatcher : actif**

Ensuite :

- l’onglet **Profiles** affiche la liste des comptes (non vide) ;
- l’onglet **Devices** affiche les téléphones et leurs états ;
- l’onglet **Runtime Health** indique que le dispatcher est **Running**.

Seulement dans cet état, Liam peut utiliser les actions compte (Settings, Stats, etc.).

---

## Ce que Liam ne doit jamais faire

- **Ne jamais** lancer `npm run electron:start` ni une fenêtre Electron noire de développement.
- **Ne jamais** coller ou saisir une clé secrète, un token ou une URL privée dans BotApp.
- **Ne jamais** modifier des fichiers dans `Library/Application Support`, des variables d’environnement ou le Keychain.
- **Ne jamais** cliquer **Start**, **Auto Login**, **Connect** ou **Check Readiness** tant que le bandeau est **rouge** (connexion ou dispatcher indisponible).
- **Ne jamais** utiliser le terminal pour « réparer » BotApp : les boutons prévus dans l’app suffisent.

---

## Cas normal — démarrage quotidien

1. **Quitter complètement** toute instance BotApp déjà ouverte (`Cmd + Q`).
2. Ouvrir **uniquement** `BotApp.app` depuis Finder (chemin ci-dessus).
3. **Attendre** quelques secondes que les indicateurs se mettent à jour.
4. Vérifier le bandeau vert :
   - **Connexion BotApp : opérationnelle**
   - **Dispatcher : actif**
5. Ouvrir **Profiles** et **Devices** : les listes doivent se charger.
6. Utiliser les actions compte **seulement après** ces vérifications.

**État attendu :** bandeau vert, Profiles et Devices remplis, Runtime Health OK.

**Condition d’arrêt :** si le bandeau reste rouge après 30 secondes, passer au cas « relay rouge » ci-dessous. Ne pas lancer d’action compte.

---

## Cas relay rouge — « Connexion BotApp indisponible »

Le bandeau affiche **Connexion BotApp indisponible** (souvent avec Profiles à 0 et Devices à 0).

1. Cliquer **une seule fois** sur **Réparer la connexion**.
2. Attendre le message de confirmation (toast en bas de l’écran).
3. Vérifier que le bandeau passe au **vert** et que **Profiles** / **Devices** se rechargent.

**Si le bandeau redevient vert :** reprendre le cas normal.

**Si le bandeau reste rouge :**

1. Cliquer **Copy diagnostics**.
2. Coller le texte dans un fichier ou un message pour le support (email, ticket, chat interne).
3. **Ne pas** chercher une clé, **ne pas** ouvrir de fichiers de configuration, **ne pas** relancer Electron dev.
4. Attendre les instructions du support.

**Condition d’arrêt :** ne plus cliquer sur Réparer en boucle. Un seul essai, puis diagnostic au support. **Aucune action compte** tant que le relay est rouge.

---

## Cas dispatcher arrêté — relay vert, dispatcher inactif

Le bandeau peut afficher **Dispatcher arrêté** alors que la connexion BotApp est OK.

1. Vérifier d’abord que **Connexion BotApp : opérationnelle** est affiché (relay vert).
2. Cliquer **Démarrer le dispatcher**.
3. Attendre que le bandeau indique **Dispatcher : actif**.
4. Optionnel : ouvrir **Runtime Health** et confirmer l’état **Running**.

**Si échec :**

1. Cliquer **Copy diagnostics**.
2. Transmettre le diagnostic au support.
3. **Ne pas** exécuter de commande terminal.

**Condition d’arrêt :** ne pas lancer **Start**, **Auto Login** ou **Connect** tant que le dispatcher n’est pas actif.

---

## Monitoring → Incidents (reprise contrôlée P3)

Route BotApp : **Monitoring → Incidents**.

### Lien reçu sur Slack ou Discord

1. Cliquer le lien **Dashboard** dans la notification (contient `incident_id`).
2. L’Admin web s’ouvre directement sur le bon incident (même incident test).
3. Lire l’état **Reprise contrôlée** :
   - **Prêt à relancer** = bouton disponible (incident éligible, pas encore armé).
   - **Reprise autorisée — en attente du prochain tick** = autorisation déjà
     armée ; attendre le prochain tick Auto Restart (Scheduler doit être ON).
   - **Reprise demandée** = reprise consommée, run request créée.
   - **Nouvelle intervention requise** = échec de reprise, intervention humaine.

### Dans BotApp

1. Ouvrir **Monitoring → Incidents**.
2. Si l’incident est un test interne : cliquer **Show test incidents (N)** en
   haut de la liste (toggle client-side).
3. Cliquer la ligne pour ouvrir le drawer ; même logique de bouton et d’états.

**Important :**

- Le clic **Prêt à relancer** n’exécute **jamais** un run localement.
- Tant que le **Scheduler est OFF**, aucune reprise automatique ne part —
  l’autorisation armée reste visible en attente.
- Ne pas cliquer **Start**, **Play** ou **Auto Login** pour « débloquer » une
  reprise : corriger le problème sur le téléphone, puis **Prêt à relancer**.

---

## Cas application noire ou vide

1. Quitter complètement BotApp (`Cmd + Q`).
2. Attendre 5 secondes.
3. Relancer **uniquement** `BotApp.app` depuis Finder (pas Electron dev, pas de terminal).
4. Attendre le chargement complet de l’interface.

**Si l’écran reste noir ou vide :**

1. Refaire une fois quitter / relancer.
2. Si le problème persiste : **Copy diagnostics** (si le bandeau ou les boutons sont visibles) ou décrire « écran noir au lancement » au support.
3. **Ne pas** lancer d’action compte.

**Condition d’arrêt :** après deux relances infructueuses, contacter le support sans toucher aux fichiers locaux.

---

## Boutons utiles (bandeau en haut)

| Bouton | Quand l’utiliser |
|--------|------------------|
| **Réparer la connexion** | Bandeau rouge « Connexion BotApp indisponible » |
| **Démarrer le dispatcher** | Relay vert mais dispatcher arrêté |
| **Retry** | Rafraîchir l’état après une réparation |
| **Copy diagnostics** | Problème persistant — envoyer au support |

---

## Diagnostic à transmettre au support

Après **Copy diagnostics**, le presse-papiers contient un texte **non sensible** (JSON) avec notamment :

- `ok`, `relay_authenticated`, `backend_configured`
- `reason` (code ou libellé d’erreur)
- `checkedAt` (horodatage)
- métadonnées clés **sans valeur secrète** (`present`, `length`, préfixe de hachage)

**Ne jamais** ajouter au message :

- une clé API, token ou mot de passe ;
- le contenu de fichiers dans `Application Support` ;
- une URL complète de relay si elle vous a été communiquée séparément.

Indiquer aussi :

- date et heure du problème ;
- ce que Liam a déjà tenté (ex. « Réparer la connexion une fois ») ;
- si Profiles / Devices restent vides ;
- si l’app a été ouverte depuis le bon chemin Finder.

---

## Résumé rapide

| Situation | Action Liam |
|-----------|-------------|
| Démarrage normal | Ouvrir BotApp.app → attendre bandeau vert → Profiles/Devices |
| Relay rouge | Réparer la connexion (1×) → sinon Copy diagnostics |
| Dispatcher arrêté | Démarrer le dispatcher (relay vert d’abord) |
| Écran noir | Cmd+Q → relancer BotApp.app → support si échec |
| Toujours bloqué | Copy diagnostics → support — **pas de terminal, pas de clé** |
