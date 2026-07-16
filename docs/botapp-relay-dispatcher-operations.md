# BotApp — Opérations relay et dispatcher

> **Production baseline - 2026-07-16.** Official application:
> `/Applications/BotApp.app`. Runtime provenance, polling and incident workflow
> are frozen in
> [JULY_16_PRODUCTION_BASELINE](./checkpoints/2026-07-16-production-baseline-botapp.md).

Runbook développeur : configuration, bootstrap, réparation, validation et dépannage.
Complète [l’architecture relay/dispatcher](./botapp-relay-dispatcher-architecture.md).

**Opérateur sans terminal :** [Guide Liam](./guide-operateur-liam.md)

---

## Configuration et stockage sécurisé

### Chemin runtime

| Élément | Chemin / valeur |
|---------|-----------------|
| userData canonique | `~/Library/Application Support/BotApp` |
| Config runtime | `~/Library/Application Support/BotApp/botapp-runtime-config.json` |
| Blob Keychain | `~/Library/Application Support/BotApp/botapp-relay-key.enc` |
| Status bootstrap | `~/Library/Application Support/BotApp/botapp-relay-bootstrap.status.json` |
| Trace démarrage | `~/Library/Application Support/BotApp/botapp-startup.trace.log` |
| Backups legacy | `botapp-runtime-config.json.disabled.<timestamp>` (même dossier ou legacy) |
| Runtime controller | `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl` |
| Worker active root | `/Users/admin/phonefarm-worker-current` |
| Worker releases | `/Users/admin/phonefarm-worker-releases/<commit>` |

Legacy (import automatique, ne plus utiliser comme source permanente) :

- `~/Library/Application Support/botapp-mac-foundation`
- `~/Library/Application Support/com.boostmybusinesses.botapp`

### Format config (champs non sensibles)

Fichier JSON local, permissions **600** :

```json
{
  "compassAiRelayUrl": "<URL HTTPS du relay — ne pas versionner>"
}
```

Après migration Keychain réussie, **`botappRelayKey` ne doit plus apparaître** dans le JSON. La clé vit dans `botapp-relay-key.enc` (chiffré `safeStorage`).

### Credential

- Module : `electron/relay-credential-store.cjs`
- API : Electron `safeStorage.isEncryptionAvailable()`, `encryptString` / `decryptString`
- **Interdiction absolue** : commit, log, UI renderer, Copy diagnostics avec valeur de clé, URL complète privée ou token

### Migration backup `.disabled.*`

Au bootstrap (`electron/relay-runtime-bootstrap.cjs`) :

1. Scanner dossiers canonique + legacy
2. Choisir la meilleure URL (production > localhost)
3. Récupérer clé : Keychain blob → JSON → backup disabled
4. Écrire URL dans config canonique
5. Sauver clé Keychain ; retirer du JSON si succès
6. Copier blob Keychain legacy si absent côté canonique

---

## Bootstrap et réparation

### `bootstrapRelayConfig()` (main)

Appelle `bootstrapRelayRuntime()` avec :

- `userDataDir` = `app.getPath("userData")` (BotApp)
- `forceRestore` optionnel (réparation)
- Variables env dev optionnelles (`BOTAPP_COMPASS_AI_RELAY_URL`, `BOTAPP_RELAY_API_KEY`) — **jamais** pour Liam

Écrit `botapp-relay-bootstrap.status.json` (client-safe).

### Préconditions

- `app.setPath("userData", …)` **avant** `app.ready` (macOS)
- `bootstrapRelayConfig()` **dans** `app.whenReady()` — `safeStorage` fiable après ready
- Fenêtre créée **après** bootstrap + relay health (+ dispatcher autostart si applicable)

### `ensureDispatcherAutostart()`

1. Relay health OK + authentifié
2. `dispatcherStatus()` via `phonefarm-runtimectl dispatcher status --json`
3. Si `runtime_root_invalid` ou `runtime_root_mismatch` → **report explicite**
   (pas de fallback legacy)
4. Si `queueActiveCount > 0` → **report** (pas de démarrage)
5. Si LaunchAgent absent → `install`
6. Sinon → `resume`
7. Re-vérifier `processRunning` + status `running`

### Bouton « Réparer la connexion » (UI)

IPC : `botapp:relay:repair` → `repairRelayConnection()` :

1. `bootstrapRelayConfig({ forceRestore: true })`
2. `botappRelayHealth()`
3. Si OK : `botappOverviewData()` (Profiles) + `ensureDispatcherAutostart()`
4. Message client-safe via `repairRelayClientMessage()`

**Ne déclenche pas** : login, Connect, Start, run, écriture DB.

### Bouton « Démarrer le dispatcher » (UI)

Visible si relay vert et dispatcher inactif.
IPC : `botapp:dispatcher:ensure` → `ensureDispatcherAutostart()`.
L’appel au runtime doit passer par `phonefarm-runtimectl` en asynchrone avec
timeout. Un contrôleur lent ou bloqué doit retourner un état structuré
(`*_command_timeout`, `runtime_root_mismatch`, etc.) sans rendre l’application
macOS non répondante.

Depuis la release worker `52d76e7`, `dispatcher start` / `heartbeat start` sont
des commandes **courtes et idempotentes** : service déjà actif → `running` ;
sinon `launchctl kickstart` du label canonique. Le service long-lived
lui-même est porté par `dispatcher serve` / `heartbeat serve`, **réservé aux
plists launchd** (chaîne d'`exec`, aucun parent Python avec timeout). Ne
jamais appeler `serve` depuis BotApp ni depuis un shell interactif : le
timeout borné autour d'un service long-lived est ce qui provoquait le cycle
`running` ~60 s → SIGTERM → `stopped` ~30 s (bandeau rouge/vert alternant).

---

## États client-safe (`repairState`)

| État | Signification | Action opérateur |
|------|---------------|------------------|
| `connection_ready` | URL + clé présentes | Normal |
| `connection_restored` | Import depuis legacy/backup | Normal après migration |
| `initial_association_required` | URL sans clé récupérable | Support — association Mac |
| `keychain_unavailable` | Keychain inaccessible, pas de clé fallback | Relancer app ; support si persistant |
| `backend_unavailable` | Clé sans URL ou backend down | Copy diagnostics ; pas d’action compte |

Messages UI associés dans `repairRelayClientMessage()` (`electron/main.cjs`).

Causes dispatcher (Runtime Health) :

| Symptôme | Cause probable |
|----------|----------------|
| `stopped` / `unknown` | LaunchAgent non chargé ou process arrêté |
| `paused` | Pause volontaire — Resume |
| `runtime_root_invalid` | `/Users/admin/phonefarm-worker-current` absent, hors releases ou incomplet |
| `runtime_root_mismatch` | Un process service tourne depuis une release différente du root actif |
| Relay rouge | Bootstrap/URL/clé — Réparer connexion |
| Autostart deferred | Queue active > 0 ou relay non authentifié |

---

## Validation et diagnostic

### Critères de succès (app packagée)

1. Fermer toutes instances BotApp (`Cmd + Q`)
2. Ouvrir uniquement `/Applications/BotApp.app`
3. Bandeau vert : **Connexion BotApp : opérationnelle** + **Dispatcher : actif**
4. Profiles : liste non vide
5. Devices : états visibles
6. Runtime Health : dispatcher **Running**, pas de bannière rouge bloquante
7. Fermer / rouvrir BotApp — état stable **sans** action manuelle

### Gate obligatoire avant installation officielle

Ne jamais remplacer `/Applications/BotApp.app` uniquement parce qu’un package
démarre ou que le process Electron reste ouvert. Le gate minimal est :

1. source commitée ;
2. tests ciblés verts ;
3. `npm run build` vert ;
4. `npm run package:mac` vert — inclut désormais deux gates automatiques :
   - `scripts/verify-electron-main-local-requires.mjs` (modules locaux dans
     le source et dans `app.asar`) ;
   - `scripts/sign-and-verify-macos-bundle.mjs` (signature macOS ad hoc
     de l'intérieur vers l'extérieur + vérification, voir ci-dessous) ;
5. vérification `app.asar` des `require("./...")` locaux ;
6. test packagé depuis un chemin temporaire hors `/Applications` ;
7. validation visuelle utilisateur : Profiles, Devices, Client Accounts,
   Runtime, drawer et navigation ;
8. seulement ensuite installation vers `/Applications/BotApp.app`.

Checkpoint installé 2026-07-13 :

- commit source :
  `dcbb85e9a1c9cad9f1a8a49eae9cf1f7e502206d`
  (`fix(botapp): clarify operator review and summarize restart status`);
- bundle officiel : `/Applications/BotApp.app`;
- ancien bundle : sauvegardé sous
  `/Users/admin/phonefarm-botapp-backups/BotApp.app.20260713T000339SAST`;
- smoke officiel read-only : relay opérationnel, dispatcher actif,
  Profiles/Devices chargés, Tracker `operator review required`, Mythyl
  `growth ready`, Scheduler avec `Account Auto Restart status` et
  `Recent Auto Restart decisions` séparés.

Limitation d'outillage observée pendant ce checkpoint :

- plusieurs copies de BotApp partagent le bundle identifier
  `com.boostmybusinesses.botapp`; utiliser le chemin complet du bundle pour les
  smokes et installations ;
- Computer Use peut retourner une frame stale ou échouer avec
  `ScreenCaptureKit.SCStreamErrorDomain Code=-3811`. Dans ce cas, ne valider
  l'installation qu'avec une preuve visuelle opérateur ou une lecture AX fraîche
  cohérente, jamais avec une capture stale ;
- cleanup des bundles temporaires/candidats : futur chantier contrôlé, pas une
  étape implicite du packaging.

### Gate signature macOS (`scripts/sign-and-verify-macos-bundle.mjs`)

`electron-builder` est configuré avec `identity: null` (aucune identité
Developer ID n'existe sur ce Mac) : le bundle sort avec des signatures
linker ad hoc partielles qui échouent `codesign --verify --deep --strict`
(« code has no resources… ») et produisent des logs AMFI `no CMS blob`.
Le gate resigne donc le bundle **de l'intérieur vers l'extérieur**
(dylibs → frameworks → helpers → bundle racine, jamais un `--deep` aveugle
sur la racine seule), puis fait échouer le packaging si :

- le binaire principal ou un framework/helper requis manque ou n'est pas signé ;
- le bundle n'est pas arm64 ;
- `codesign --verify --strict` échoue sur un composant ;
- `codesign --verify --deep --strict` échoue sur le bundle complet.

Règles absolues :

- **jamais** de désactivation SIP/Gatekeeper/AMFI, jamais de `xattr -cr`
  comme solution produit, jamais de bypass manuel ;
- aucun secret : la signature est ad hoc (`-`), aucun certificat ni clé
  privée n'est utilisé ni exporté (`BOTAPP_MAC_SIGN_IDENTITY` permet de
  passer une identité réelle le jour où elle existera dans le Keychain) ;
- portée : ce modèle ad hoc est valable **pour ce Mac local uniquement**.
  Une distribution sur d'autres Macs exigera une identité Developer ID +
  notarisation (non implémentée volontairement, à valider séparément).

Une copie de rollback dans `/Users/admin/phonefarm-botapp-rollbacks/...` est un
artefact forensics non quotidien. Elle ne remplace pas l’application officielle.

### Piège `ELECTRON_RUN_AS_NODE` pendant le test visuel

Si `ELECTRON_RUN_AS_NODE=1` est présent dans l'environnement du shell (cas des
shells lancés depuis un IDE Electron comme Cursor/VS Code), **tout lancement de
BotApp échoue silencieusement** : l'app démarre en mode Node headless et sort
avec le code 0 avant même de charger `main.cjs` (aucune fenêtre, aucune entrée
`main_loaded` dans `botapp-startup.trace.log`). Ceci vaut aussi pour `open -n`,
car `open` propage l'environnement de l'appelant à l'app lancée. Les logs AMFI
(`no CMS blob`, `CT signature issue`) qui apparaissent au même moment sont des
messages bénins et **ne sont pas la cause**. Avant tout test visuel :

```bash
unset ELECTRON_RUN_AS_NODE
open -n /chemin/vers/release/mac-arm64/BotApp.app
```

Diagnostic rapide : si `open` rend la main sans erreur mais qu'aucun processus
`MacOS/BotApp` n'apparaît et que la trace de démarrage ne bouge pas, vérifier
`echo $ELECTRON_RUN_AS_NODE` en premier.

### Checks développeur (sans action Instagram)

| Check | Méthode |
|-------|---------|
| Relay health | UI bandeau ou IPC ; status JSON `relayOk: true` |
| Profiles | Onglet Profiles count > 0 |
| Devices | Onglet Devices |
| Devices auto-refresh | Vue Devices ouverte : `Last seen` et « Dernier signal » avancent seuls (≤ 20 s après un heartbeat backend), sans clic Refresh |
| Runtime Health | `launchdLoaded`, `processRunning`, status `running` |
| Bootstrap | `botapp-relay-bootstrap.status.json` : `relayUrlConfigured`, `relayKeyConfigured` |
| Trace | `botapp-startup.trace.log` : phases `main_loaded`, `when_ready`, `bootstrap_done` |
| Tests unitaires | `node --test src/views/relay-runtime-bootstrap.test.mjs src/views/botapp-relay-bootstrap.test.mjs` |
| Correctif embarqué | `asar list` contient `relay-runtime-bootstrap.cjs` ; `setPath` avant `whenReady` |
| Pont runtime async | `node --test electron/runtime-controller.test.mjs` |
| Auto-refresh Devices | `node --test src/views/devices-auto-refresh.test.mjs` |

### Actualisation automatique Devices (diagnostic)

Cadences attendues en production :

- **backend** : publisher launchd → `device_heartbeats.last_seen_at` toutes
  les ~60 s par téléphone ;
- **UI** : fetch `devices_overview` toutes les 15 s quand la vue Devices est
  active et visible, plus recalcul local du libellé relatif toutes les 15 s.
  Un nouveau heartbeat backend doit apparaître dans l'UI en ≤ 20 s.

Si « Dernier signal » semble figé, diagnostiquer couche par couche **sans
cliquer Refresh** :

1. backend : `select last_seen_at from device_heartbeats` (lecture seule) —
   avance ? sinon problème runtime/publisher, ne pas patcher BotApp ;
2. relay : IPC `devices.list` (ou `devices_overview`) — renvoie la valeur
   backend ? le relay n'a pas de cache ; un écart ici est anormal ;
3. UI : si backend et relay avancent mais pas l'affichage, c'est le polling
   renderer (`devices-auto-refresh.ts`) — vérifier vue active + fenêtre
   visible (le polling s'arrête volontairement quand la vue est inactive ou
   la fenêtre cachée, et reprend avec un refresh immédiat au retour).

Le bouton Refresh reste disponible comme action manuelle mais n'est plus
nécessaire pour voir l'état réel.

### Vue Scheduler — procédure opérateur

La vue `Scheduler` observe le scheduler canonique embarqué dans le dispatcher
et porte le **switch global ON/OFF** (permission backend de créer de nouveaux
runs planifiés). Points opérateur :

- **Badge moteur ≠ switch** : `Engine: Running` signifie que le dispatcher et
  son tick tournent (launchd). `Backend: OFF` signifie que le tick saute la
  sélection (`scheduler_disabled`). Les deux états sont indépendants : un
  moteur Running avec backend OFF est un état normal.
- **Passer OFF** : effet au prochain tick canonique ; les runs déjà actifs ne
  sont **jamais** interrompus par le switch.
- **Passer ON** : confirmation compacte obligatoire (le prochain tick peut
  créer des runs pour les comptes réellement éligibles). Aucun run n'est créé
  depuis le clic ; la sélection reste 100 % backend (caps, schedules,
  readiness, assignment, `manual_only` exclu en dur).
- **Diagnostic « aucun run créé »** : lire les métriques (dernier tick,
  examinés/éligibles/enqueued) et les décisions récentes avec leur raison
  canonique courte (`manual only`, `scheduler disabled`, caps…). Détail complet
  en tooltip ; clic compte → Profiles.
- **Cadence** : la vue se rafraîchit toutes les 60 s uniquement quand elle est
  active et la fenêtre visible ; elle ne déclenche jamais le tick backend.
- **Nota bene** : quand le scheduler est OFF, les ticks ne persistent ni lock
  ni décision — un « dernier tick » ancien avec backend OFF est attendu, pas
  une panne.
- **Last error** : n'apparaît que si un tick réel a échoué sur une exception
  inattendue (erreur backend, persistance non récupérable). Le backend
  finalise alors le lock en `failed` avec une raison courte **redigée**
  (aucun secret/URL/token) exposée telle quelle par la vue. Les issues
  métier normales (`scheduler_disabled`, aucun candidat, exclusions
  `manual_only`, rejets runtime par compte) sont des ticks **réussis** et ne
  produisent jamais de `Last error`. Un `Last error` isolé suivi d'un
  `Last success` plus récent est auto-résolu ; un `Last error` répété sans
  nouveau succès justifie une investigation backend (logs Vercel + table
  `auto_restart_tick_locks`).
- **Installation/release** : aucune activation automatique du Scheduler
  pendant une installation ou une release BotApp ; le switch ne change d'état
  que par action opérateur explicite.

### Test sans compte / run / login

Autorisé :

- Ouvrir app packagée, lire Profiles/Devices
- Relay health, Copy diagnostics
- Réparer connexion, Démarrer dispatcher
- Runtime Health status/logs

**Interdit** pendant validation relay/dispatcher :

- Start, Auto Login, Connect, Check Readiness
- Création compte, assignment, run manuel
- Toute écriture DB / migration Supabase

### Critères STOP

Arrêter et investiguer si :

- Bandeau rouge persiste après 1× Réparer + relance app
- `repairState` = `initial_association_required` sans procédure support
- Profiles/Devices vides avec relay authentifié (mapping backend)
- Dispatcher install échoue répétitivement (Runtime Health)
- Trace absent **et** config canonique vide (bootstrap non exécuté)

### Copy diagnostics (format sûr)

Le renderer copie un JSON avec :

- `ok`, `reason`, `relay_authenticated`, `backend_configured`
- `backend_key` / `provided_key` : `{ present, length, sha256_prefix, environment_scope }` — **pas de valeur secrète**
- `routes`, `checkedAt`
- `provenance` : commit/marque BotApp, date package, chemin bundle/app, root
  runtime actif, commit runtime actif, sans secret

Le futur `package-provenance.json` doit fournir uniquement la partie package
immuable. Le root/commit worker demeure une observation runtime séparée. Au
2026-07-14, ce fichier est **PLANNED, NOT IMPLEMENTED** dans `b812370`.

**Ne doit jamais apparaître :**

- Valeur de `botappRelayKey` ou token Bearer complet
- URL relay complète avec secrets query
- Mots de passe, service-role Supabase, contenu Keychain
- Chemins locaux de dumps device / XML / screenshots

---

## Dépannage développeur

### Future génération et vérification de provenance

Cette procédure est un contrat prévu ; les commandes/scripts ne sont pas encore
branchés au package officiel :

1. exiger un worktree propre au commit Git complet et une ref distante prouvée ;
2. lancer tests, lint et build canoniques ;
3. générer `package-provenance.json` depuis une liste triée de sources et assets
   critiques, avec les champs définis dans
   [botapp-relay-dispatcher-architecture.md](botapp-relay-dispatcher-architecture.md) ;
4. refuser toute valeur secrète, chemin utilisateur absolu ou donnée runtime ;
5. inclure le manifeste dans les ressources `app.asar` avant signature ;
6. extraire/lire le manifeste du bundle construit et recalculer chaque hash ;
7. signer et vérifier le bundle ;
8. calculer le SHA-256 externe final de `app.asar`, installer le bundle, puis
   comparer hash et taille entre build et installation officielle ;
9. vérifier séparément le commit/CWD du worker actif et le symlink runtime ;
10. enregistrer build, installation, activation et validation physique comme
    états distincts dans le registre de release.

La provenance doit échouer fermée si Git, un fichier critique ou un hash est
indéterminé. Une branche seule ne prouve jamais le contenu ; le SHA complet est
l'identité normative. L'ajout du générateur et la modification du build/package
nécessitent une tâche et un GO séparés.

### Build / package officiels

```bash
cd /Users/admin/Projects/BotApp
npm install
npm run lint
npm run build
npm run package:mac
```

Sortie : `release/mac-arm64/BotApp.app`

Vérification obligatoire avant installation :

```bash
node --test electron/runtime-controller.test.mjs electron/ipc-structured-clone.test.mjs
node scripts/verify-electron-main-local-requires.mjs
node scripts/sign-and-verify-macos-bundle.mjs
```

La première vérification échoue si un `require("./...")` local de
`electron/main.cjs` manque dans le source ou dans `app.asar` ; la seconde
échoue si la signature macOS du bundle est incomplète ou invalide
(voir « Gate signature macOS »).

Attention sérialisation IPC : `electron/ipc-structured-clone.cjs` doit rester
le module basé sur `toIpcSafe` (JSON round-trip qui **préserve les références
partagées**). Un serializer qui marque les objets déjà vus comme `[circular]`
corrompt le payload overview (les mêmes profils sont référencés dans
`profiles` et `profileGroups[].profiles`) et fait crasher la vue Profiles
(`Cannot read properties of undefined (reading 'follow')`).

Installation opérateur canonique :

```bash
ditto release/mac-arm64/BotApp.app /Applications/BotApp.app
open /Applications/BotApp.app
```

Sauvegarder le chemin de l’ancien bundle avant remplacement si
`/Applications/BotApp.app` existe déjà. Ce backup est un rollback temporaire,
pas une seconde app quotidienne à utiliser.

**Ne pas** utiliser `npm run electron:start` ou un bundle de workspace pour
valider le runtime opérateur.

### Vérifier le correctif dans l’app packagée

```bash
npx asar extract "release/mac-arm64/BotApp.app/Contents/Resources/app.asar" /tmp/botapp-asar-check
rg "setPath|bootstrapRelayConfig|relay-runtime-bootstrap" /tmp/botapp-asar-check/electron/main.cjs
```

Confirmer `app.setPath("userData", canonicalUserDataDir())` **avant** `app.whenReady()`.

### Runtime controller (terminal — dev uniquement)

```bash
/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl status --json
/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl dispatcher status --json
/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl heartbeat status --json
/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl scheduler status --json
```

Ne pas demander ces commandes à Liam.

Les commandes ci-dessus ne doivent jamais afficher
`/Users/admin/instagram-worker-python` comme `resolvedRoot`. Si c’est le cas,
STOP : le runtime canonique est cassé ou un fallback legacy est revenu.

`dispatcher serve` / `heartbeat serve` ne doivent **jamais** être lancés
manuellement : ils sont réservés aux plists launchd (exec long-lived).

### Diagnostic dispatcher intermittent (rouge/vert alternant)

Symptôme historique (corrigé, release `52d76e7`) : bandeau BotApp alternant
`Dispatcher stopped` / `dispatcher confirmed running` toutes les ~60–90 s.
Cause : le contrôleur enveloppait `dispatcher start` (foreground long-lived)
dans un `subprocess.run(timeout=60)` et tuait son propre service ; launchd
relançait après `ThrottleInterval`. Vérifications si le symptôme réapparaît :

```bash
launchctl print gui/$(id -u)/com.boost.phonefarm.dispatcher | grep -E 'runs|pid'
# runs qui grimpe en continu = boucle de restart
grep stop_signal /Users/admin/phonefarm-runtime/logs/run-control-dispatcher/dispatcher.log | tail
# stop_signal 15 périodique (~60 s) = un parent tue le service
grep command_timeout /Users/admin/phonefarm-runtime/logs/run-control-dispatcher/launchd.stdout.log | tail
```

Validation post-déploiement obligatoire : **12 minutes** d'observation sans
action manuelle — PID dispatcher et publisher constants, `runs` launchd
stable, aucun `stop_signal 15` périodique, aucun `*_command_timeout`,
heartbeats A16 publiés toutes les ~60 s. `scheduler_disabled` (raison de tick
embedded) reste distinct de l'état dispatcher et ne doit jamais faire basculer
le bandeau.

### Rollback Keychain

Si migration Keychain échoue (build non signé, `secureStorageAvailable: false`) :

- Bootstrap conserve la clé dans JSON mode 600 (fallback prévu)
- Ne pas supprimer manuellement le JSON tant que le blob est invalide
- Pour reset propre (dev) : supprimer blob `.enc`, restaurer depuis backup `.disabled.*`, relancer app packagée → Réparer connexion

### Compatibilité anciens configs

- Import automatique depuis `botapp-mac-foundation` et backups `.disabled.*`
- Préférence URL non-localhost
- Ne jamais laisser localhost comme URL active en prod opérateur

---

## Runbook sécurité

| Règle | Détail |
|-------|--------|
| Pas de login/run auto | Bootstrap et réparation ne lancent aucun compte |
| Pas de DB write | Relay read + dispatcher install/status seulement |
| Pas de clé à l’utilisateur | Association Mac = procédure support, pas collage manuel |
| Pas de terminal pour Liam | UI : Réparer, Démarrer dispatcher, Copy diagnostics |
| App opérateur unique | `BotApp.app` packagée — pas Electron dev |

---

## Fichiers source principaux

| Fichier | Rôle |
|---------|------|
| `electron/main.cjs` | Lifecycle, IPC, relay health, repair, dispatcher |
| `electron/relay-runtime-bootstrap.cjs` | Bootstrap unifié, migration legacy |
| `electron/relay-credential-store.cjs` | Keychain / backups disabled |
| `electron/preload.cjs` | Surface IPC renderer |
| `src/app/App.tsx` | Bandeau connexion, boutons réparation |
| `src/views/RuntimeHealth.tsx` | Santé dispatcher, réparation relay |

Tests : `src/views/relay-runtime-bootstrap.test.mjs`, `src/views/botapp-relay-bootstrap.test.mjs`
