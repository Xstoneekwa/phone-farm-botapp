# BotApp — Architecture relay et dispatcher

Documentation technique pour développeurs. Décrit le runtime packagé macOS, le relay sécurisé et le dispatcher local.

**Documents associés :**

- [Guide opérateur Liam](./guide-operateur-liam.md) — procédure sans terminal
- [Opérations relay / dispatcher](./botapp-relay-dispatcher-operations.md) — runbook, validation, dépannage
- [Sécurité](./security.md) — règles no-leak

---

## Vue d’ensemble

```text
┌─────────────────────────────────────────────────────────────────┐
│  BotApp.app (packagée) — seule app opérateur normale           │
│  ┌──────────────┐   IPC    ┌──────────────┐   HTTPS   ┌────────┐ │
│  │ Renderer     │ ◄──────► │ Main process │ ────────► │ Backend│ │
│  │ (React/Vite) │ preload  │ (Electron)   │  relay    │ partagé│ │
│  └──────────────┘          └──────┬───────┘           └────────┘ │
│                                   │ async controller/status       │
│                                   ▼                               │
│                          Run Control Dispatcher                   │
│                          (LaunchAgent macOS local)                │
└─────────────────────────────────────────────────────────────────┘
```

| Composant | Rôle |
|-----------|------|
| **App packagée** | UI opérateur, décisions sécurité, credentials, appels relay |
| **Electron dev** | Développement UI uniquement — **interdit pour Liam** |
| **Relay local** | Pont HTTPS entre le Mac et le backend partagé (dashboard API) |
| **Backend partagé** | Source de vérité Profiles, Devices, comptes, gouvernance |
| **Runtime controller** | Point d’entrée local stable `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl` ; résout la release worker active ; appelé depuis Electron main en asynchrone avec timeout |
| **Dispatcher** | Processus local worker dans `/Users/admin/phonefarm-worker-current` — exécute runs **uniquement** quand l’opérateur lance une action ; pas de démarrage automatique de compte au bootstrap |

---

## App packagée vs Electron dev

| | App packagée (`BotApp.app`) | Dev (`npm run dev` / `electron:start`) |
|--|------------------------------|----------------------------------------|
| **Usage** | Exploitation opérateur | Développement uniquement |
| **UI** | `dist/index.html` dans l’asar | Vite dev server (fenêtre dev possible) |
| **userData** | `~/Library/Application Support/BotApp` (canonique) | Peut diverger selon lancement |
| **Relay** | Bootstrap au démarrage, Keychain | Variable selon config locale |
| **Pour Liam** | **Oui — seule app normale** | **Non — jamais** |

Chemin officiel de l’application installée pour l’usage quotidien :

```text
/Applications/BotApp.app
```

Build source : `npm run package:mac` depuis le worktree propre
`/Users/admin/Projects/BotApp-clean` → sortie dans `release/mac-arm64/`, puis
installation contrôlée vers `/Applications/BotApp.app`.

Un worktree propre n’est pas automatiquement une baseline produit. Une baseline
produit existe seulement quand la source réconciliée est commitée et poussée, le
package est construit depuis ce commit, le package a passé les tests et la
validation visuelle complète, puis l’installation officielle est réalisée vers
`/Applications/BotApp.app`.

Les bundles `release/mac-arm64/BotApp.app` sont des artefacts de build. Ils
peuvent servir à la validation temporaire hors `/Applications`, mais ne sont pas
une application quotidienne. Le vault de rollback
`/Users/admin/phonefarm-botapp-rollbacks/...` est réservé aux copies forensics et
ne doit pas être ouvert comme seconde app officielle.

Trois rôles distincts, à ne jamais confondre :

1. **Bundle de build** — `release/mac-arm64/BotApp.app` : artefact temporaire,
   signé ad hoc par le gate de packaging, utilisé uniquement pour la validation
   hors `/Applications` ;
2. **Rollback readonly** — `/Users/admin/phonefarm-botapp-rollbacks/...` :
   copie forensics figée (permissions lecture seule), jamais modifiée, jamais
   resignée, jamais lancée comme app quotidienne ;
3. **Application officielle** — `/Applications/BotApp.app` : seule app
   opérateur, remplacée uniquement après le gate complet (tests, package,
   signature vérifiée, validation visuelle utilisateur).

Signature macOS : sans identité Developer ID locale, le packaging signe le
bundle **ad hoc de l'intérieur vers l'extérieur** (gate
`scripts/sign-and-verify-macos-bundle.mjs`) pour que `codesign --verify
--deep --strict` passe et que le lancement local ne déclenche pas d'erreurs
AMFI. Interdictions absolues : désactiver SIP/Gatekeeper/AMFI, `xattr -cr`
comme contournement, export de certificats. Ce modèle est local à ce Mac ;
toute distribution multi-Mac exigera Developer ID + notarisation (chantier
séparé, non implémenté).

La provenance discrète à exposer dans About, Diagnostics ou Runtime Health doit
séparer deux vérités :

1. **provenance immuable du package BotApp**, écrite au build dans un futur
   `package-provenance.json` ;
2. **provenance dynamique du runtime worker**, lue à l'exécution (symlink,
   root, commit/CWD et heartbeat) car elle peut changer sans reconstruire
   BotApp.

Ne pas afficher ces informations comme bannière permanente.

### Contrat futur `package-provenance.json`

Statut au commit `b812370` (2026-07-14) : **PLANNED, NOT IMPLEMENTED**. Le
bundle construit et installé ne contient pas ce fichier. Une ancienne branche
locale possède un prototype `scripts/write-package-provenance.mjs` ; il est une
preuve historique, pas le contrat actif, et n'a pas été repris dans cette tâche.

Contenu attendu, sans secret ni donnée client :

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO-8601 UTC",
  "repository": "phone-farm-botapp",
  "commitSha": "full Git SHA",
  "gitRef": "branch or detached ref, informational",
  "gitDirty": false,
  "packageVersion": "package.json version",
  "appId": "Electron bundle id",
  "platform": "darwin",
  "arch": "arm64",
  "toolchain": {
    "node": "version",
    "npm": "version",
    "electron": "version",
    "electronBuilder": "version"
  },
  "buildCommand": "canonical package command name",
  "sourceFingerprint": "sha256 over sorted source manifest",
  "sourceFiles": [{ "path": "repo-relative path", "sha256": "hex" }],
  "distFiles": [{ "path": "repo-relative path", "sha256": "hex" }]
}
```

Règles :

- génération déterministe depuis un checkout propre et un commit complet ;
- chemins relatifs, liste triée, aucun chemin utilisateur absolu ;
- aucun token, URL relay privée, variable d'environnement, contenu Keychain,
  mot de passe ou donnée client ;
- échec du package si le worktree est sale ou si un fichier critique manque ;
- le commit/runtime worker ne doit pas être figé dans ce fichier ; il appartient
  aux diagnostics live ;
- le SHA-256 final de `app.asar` ne peut pas être stocké à l'intérieur du même
  `app.asar` sans auto-référence. Il doit être enregistré dans un manifeste de
  release externe ou dans le registre d'installation, puis comparé au bundle
  installé.

L'implémentation du générateur, son branchement au build et la modification du
package sont explicitement hors périmètre de ce checkpoint documentaire.

`npm run electron:start` et toute fenêtre Electron dev noire sont **réservés aux développeurs** et ne doivent jamais être utilisés pour valider ou exploiter BotApp en production opérateur.

---

## Ordre de démarrage (main process)

Séquence dans `electron/main.cjs` :

1. **Avant `app.ready`** (obligatoire macOS)
   `app.setPath("userData", canonicalUserDataDir())`
   → force `~/Library/Application Support/BotApp` (pas le nom npm `botapp-mac-foundation`).

2. **`app.whenReady()`**
   - `bootstrapRelayConfig()` — migration, URL relay, credential Keychain
   - `botappRelayHealth()` — vérifie l’auth relay
   - Si relay OK : `ensureDispatcherAutostart()` — install/resume LaunchAgent si queue vide
   - `createMainWindow()` — le renderer ne charge qu’**après** cette chaîne

3. **Renderer**
   - Bandeau connexion / dispatcher
   - `data.overview` → Profiles, Devices via IPC main

Trace locale (non sensible) :

- `~/Library/Application Support/BotApp/botapp-startup.trace.log`
- `~/Library/Application Support/BotApp/botapp-relay-bootstrap.status.json`

---

## Frontière sécurité : renderer / preload / main

```text
Renderer (non fiable, inspectable)
    │
    │  contextBridge uniquement — pas de nodeIntegration
    ▼
Preload (electron/preload.cjs)
    │  API étroite : botappDesktop.relay, .dispatcher, .data, …
    ▼
Main process (electron/main.cjs)
    │  Lit config + Keychain, fetch relay, appelle le runtime controller async
    ▼
Backend HTTPS / scripts locaux autorisés
```

**Pourquoi le renderer ne peut jamais exécuter de commande arbitraire :**

- Pas d’accès Node.js, `child_process`, filesystem credentials, ni `fetch` direct vers le backend avec secrets.
- Le preload n’expose qu’une liste blanche d’invocations IPC (`ipcRenderer.invoke`).
- Toutes les URLs relay, clés et appels au runtime restent dans le **main process**.
- Le main process appelle uniquement `phonefarm-runtimectl` avec `spawn` asynchrone borné ; aucun `spawnSync` ne doit être utilisé pour Start dispatcher, Retry, status runtime ou heartbeat.
- Le renderer reçoit des réponses **déjà filtrées** (health, listes, messages client-safe).

Référence preload : `window.botappDesktop.relay.health`, `.relay.repair`, `.dispatcher.ensure`, `.data.overview`.

---

## Relay local

- **Configuration** : URL publique du backend relay (HTTPS), stockée dans `botapp-runtime-config.json` (champ `compassAiRelayUrl` — ne pas copier cette URL dans la doc versionnée ni les logs opérateur).
- **Credential** : clé relay Mac — **jamais** dans le renderer ; Keychain via Electron `safeStorage` (fichier blob `botapp-relay-key.enc`) ou fallback JSON local mode `600` si Keychain indisponible (build non signé).
- **Auth** : en-têtes `Authorization` et `X-BotApp-Relay-Key` ajoutés par le main process uniquement.
- **Health** : `GET …/api/instagram-dashboard/botapp/relay-health` → `relay_authenticated`, routes, métadonnées clés sans valeur.

---

## Backend partagé

- Hébergé côté projet dashboard (routes `/api/instagram-dashboard/…`).
- Source de vérité Supabase pour Profiles, Devices, assignments, etc.
- BotApp **ne parle pas** à Supabase directement depuis le desktop.

---

## Dispatcher (Run Control)

- Contrôleur stable : `/Users/admin/phonefarm-runtime/bin/phonefarm-runtimectl`.
- Root actif : `/Users/admin/phonefarm-worker-current`.
- Releases immuables : `/Users/admin/phonefarm-worker-releases/<commit>`.
- Script wrapper interne : `scripts/run_control_dispatcher_service.sh` dans la release active.
- LaunchAgent : `com.boost.phonefarm.dispatcher`
  Plist source : `ops/launchd/com.boost.phonefarm.dispatcher.plist` dans la release active.

### Contrat `serve` vs `start` vs `status` (obligatoire)

- `dispatcher serve` / `heartbeat serve` : **réservé aux plists launchd.** Le
  contrôleur résout le root canonique puis fait un `exec` réel du wrapper de la
  release active. Aucun parent Python avec timeout ne survit : launchd est le
  seul superviseur du service long-lived. BotApp ne doit **jamais** appeler
  `serve`.
- `dispatcher start` / `heartbeat start` : commande courte et idempotente pour
  BotApp/opérateur. Si le service tourne → `running` ; sinon → `launchctl
  kickstart` du label canonique et retour d'un état structuré. Elle ne devient
  jamais parent du consumer/publisher et ne bloque jamais le renderer.
- `dispatcher status` / `heartbeat status` : strictement lecture seule ; les
  sous-processus de diagnostic courts (`preflight`, `once`) ne sont jamais
  comptés comme de vrais dispatchers/publishers.

**Interdiction : jamais de timeout borné autour d'un service long-lived.** Le
défaut historique (corrigé le 2026-07-06, release `52d76e7`) était un
`subprocess.run(..., timeout=60)` dans le contrôleur autour de
`dispatcher start` foreground : le contrôleur tuait son propre service toutes
les ~60 s (SIGTERM), launchd relançait après `ThrottleInterval` (30 s), d'où le
bandeau BotApp alternant rouge/vert en permanence. Signature d'une régression :
compteur launchd `runs` qui grimpe, PID consumer changeant chaque minute,
`stop_signal 15` périodique dans `dispatcher.log`,
`dispatcher_command_timeout`/`heartbeat_command_timeout` dans
`launchd.stdout.log`.
- **Autostart** : uniquement après relay healthy **et** `queueActiveCount === 0` — n’installe/resume pas si une queue active existe.
- **Contrôles UI** : Pause / Resume / Restart / Stop via Runtime Health ; « Démarrer le dispatcher » via bandeau si relay OK.

Le bootstrap relay/dispatcher **ne lance jamais** de login Instagram, Connect, Start ou run.

BotApp ne doit jamais deviner une release, hardcoder un hash ou tomber sur
`/Users/admin/instagram-worker-python`. Si le contrôleur retourne
`runtime_root_invalid` ou `runtime_root_mismatch`, l’UI doit afficher ce
diagnostic plutôt que `starting/waiting for launchd`.

Le pont Runtime est une frontière stricte : BotApp ne connaît ni wrapper legacy,
ni release hashée, ni checkout worker mutable. Les actions `Start dispatcher` et
`Retry` doivent rester non bloquantes pour le renderer et pour le main process.

## Heartbeats et scheduler

Les heartbeats devices utilisent le même contrôleur stable :

```text
BotApp Runtime Health / Devices
-> phonefarm-runtimectl heartbeat status|start|restart   (commandes courtes)

launchd com.boost.phonefarm.device-heartbeat
-> exec phonefarm-runtimectl heartbeat serve             (service long-lived)
-> (exec) device_heartbeat_service.sh start
-> device_heartbeat_publisher.py --serve
```

Le scheduler Auto Restart n’est pas un service BotApp séparé. Il est embarqué
dans le dispatcher worker et appelle le backend canonique
`/api/instagram-dashboard/auto-restart/tick`. BotApp affiche l’état rapporté par
le contrôleur et le backend, sans créer de scheduler parallèle.

### Vue `Scheduler` (observabilité + switch global ON/OFF)

La vue `Scheduler` (navigation Automation) est une **surface d’observabilité**,
jamais un second scheduler :

- **Moteur vs mode backend** : deux axes distincts affichés côte à côte.
  - Badge moteur `Running / Degraded / Unknown` : projection du heartbeat du
    dispatcher (`worker_heartbeats`) faite par le backend. Le moteur tourne dès
    que le service launchd est démarré, indépendamment du switch.
  - Badge backend `ON / OFF` : reflet du drapeau canonique
    `auto_restart_settings.auto_restart_enabled` (ligne `global`, Supabase
    production), seule autorité de sélection.
- **Lecture** : IPC `botapp:scheduler:status` → relay
  `GET /api/instagram-dashboard/auto-restart/scheduler-status` (read-model
  backend dérivé des faits canoniques : tick locks, décisions, settings,
  heartbeat). Aucun calcul local d’éligibilité, créneau, cap ou readiness.
- **Switch global** : IPC `botapp:scheduler:set-enabled` → PATCH canonique
  `/api/instagram-dashboard/auto-restart/settings` (`auto_restart_enabled`
  uniquement, autorisation relay/admin existante, audit
  `auto_restart_settings_updated`).
  - `OFF` : le prochain tick canonique saute la sélection
    (`scheduler_disabled`) ; **aucun run actif n’est interrompu**.
  - `ON` : le prochain tick canonique peut sélectionner les comptes réellement
    éligibles ; **aucun run n’est créé depuis le clic**. Une confirmation
    compacte est demandée uniquement pour OFF → ON.
  - `manual_only` reste une exclusion dure côté backend
    (`manual_only_requires_manual_trigger`).
  - Le badge reflète la réponse backend confirmée, jamais une supposition
    locale.
- **Actualisation** : fetch uniquement quand la vue est active et la fenêtre
  visible (même contrôleur que Devices, cadence 60 s), refresh immédiat au
  retour au premier plan, timers arrêtés dès que la vue est quittée. La vue
  n’appelle jamais le tick backend ni un dry-run pour « rafraîchir ».
- **Décisions récentes** : liste courte des décisions persistées par le tick
  (`auto_restart_decisions`, fenêtre 24 h) avec raison canonique courte ;
  détail complet en tooltip ; clic sur un compte → vue Profiles.

### Actualisation automatique de la vue Devices

Trois couches distinctes, à ne jamais confondre lors d'un diagnostic :

1. **Backend** : le publisher launchd upserte `device_heartbeats.last_seen_at`
   (~60 s par cycle). C'est la source de vérité.
2. **Relay** : `devices_overview` (edge function `admin-dashboard`) lit la table
   à chaque appel, **sans cache** côté relay ni côté main process
   (`botappDevicesList` → `dashboardGet`, fetch direct).
3. **UI** : la vue Devices se rafraîchit seule, sans clic Refresh, via
   `src/views/devices-auto-refresh.ts` :
   - fetch overview toutes les **15 s**, uniquement quand la vue Devices est
     active **et** la fenêtre visible (`document.visibilityState`) ;
   - recalcul local du libellé relatif « Dernier signal il y a X » toutes les
     15 s entre deux fetches (tick d'horloge, aucun réseau) ;
   - retour au premier plan → actualisation immédiate + reprise du polling ;
   - vue quittée ou fenêtre cachée → timers arrêtés (aucun polling inutile) ;
   - aucune page rechargée : les données sont mises à jour en place, les
     drawers et sélections UI survivent aux cycles de refresh.

Le bouton Refresh reste une action manuelle optionnelle ; l'exploitation ne
doit jamais en dépendre pour voir l'état réel des Samsung. Un device stale
(ex. émulateur) reste projeté « Expiré » et distinct des téléphones actifs.

---

## Migration userData legacy

Electron par défaut utilisait `~/Library/Application Support/botapp-mac-foundation` (nom npm).

Dossiers legacy importés au bootstrap :

- `botapp-mac-foundation`
- `com.boostmybusinesses.botapp`

Le bootstrap préfère une URL relay **production** à `localhost`, importe les backups `botapp-runtime-config.json.disabled.*`, migre la clé vers Keychain et retire `botappRelayKey` du JSON quand la migration réussit.

---

## Bundle et identité

| Propriété | Valeur |
|-----------|--------|
| `productName` | BotApp |
| `appId` | `com.boostmybusinesses.botapp` |
| `package.json` name | `botapp-mac-foundation` |
| userData canonique | `BotApp` (via `setPath` avant ready) |

Vérifier qu’un correctif est dans l’app packagée : extraire `app.asar` et confirmer la présence de `electron/relay-runtime-bootstrap.cjs` et `app.setPath("userData", canonicalUserDataDir())` **avant** `app.whenReady()`.
