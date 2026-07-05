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

La provenance discrète à exposer dans About, Diagnostics ou Runtime Health doit
inclure : commit BotApp, chemin du bundle, date de packaging, root runtime actif
et commit runtime worker. Ne pas afficher ces informations comme bannière
permanente.

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
-> phonefarm-runtimectl heartbeat status|restart
-> launchd com.boost.phonefarm.device-heartbeat
-> device_heartbeat_publisher.py --serve
```

Le scheduler Auto Restart n’est pas un service BotApp séparé. Il est embarqué
dans le dispatcher worker et appelle le backend canonique
`/api/instagram-dashboard/auto-restart/tick`. BotApp affiche l’état rapporté par
le contrôleur et le backend, sans créer de scheduler parallèle.

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
