# BotApp — Opérations relay et dispatcher

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
2. `dispatcherStatus()` — si `queueActiveCount > 0` → **report** (pas de démarrage)
3. Si LaunchAgent absent → `install`
4. Sinon → `resume`
5. Re-vérifier `processRunning` + status `running`

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
| Relay rouge | Bootstrap/URL/clé — Réparer connexion |
| Autostart deferred | Queue active > 0 ou relay non authentifié |

---

## Validation et diagnostic

### Critères de succès (app packagée)

1. Fermer toutes instances BotApp (`Cmd + Q`)
2. Ouvrir uniquement `release/mac-arm64/BotApp.app`
3. Bandeau vert : **Connexion BotApp : opérationnelle** + **Dispatcher : actif**
4. Profiles : liste non vide
5. Devices : états visibles
6. Runtime Health : dispatcher **Running**, pas de bannière rouge bloquante
7. Fermer / rouvrir BotApp — état stable **sans** action manuelle

### Checks développeur (sans action Instagram)

| Check | Méthode |
|-------|---------|
| Relay health | UI bandeau ou IPC ; status JSON `relayOk: true` |
| Profiles | Onglet Profiles count > 0 |
| Devices | Onglet Devices |
| Runtime Health | `launchdLoaded`, `processRunning`, status `running` |
| Bootstrap | `botapp-relay-bootstrap.status.json` : `relayUrlConfigured`, `relayKeyConfigured` |
| Trace | `botapp-startup.trace.log` : phases `main_loaded`, `when_ready`, `bootstrap_done` |
| Tests unitaires | `node --test src/views/relay-runtime-bootstrap.test.mjs src/views/botapp-relay-bootstrap.test.mjs` |
| Correctif embarqué | `asar list` contient `relay-runtime-bootstrap.cjs` ; `setPath` avant `whenReady` |

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

**Ne doit jamais apparaître :**

- Valeur de `botappRelayKey` ou token Bearer complet
- URL relay complète avec secrets query
- Mots de passe, service-role Supabase, contenu Keychain
- Chemins locaux de dumps device / XML / screenshots

---

## Dépannage développeur

### Build / package officiels

```bash
cd /Users/admin/Projects/BotApp
npm install
npm run lint
npm run build
npm run package:mac
```

Sortie : `release/mac-arm64/BotApp.app`

**Ne pas** utiliser `npm run electron:start` pour valider le runtime opérateur.

### Vérifier le correctif dans l’app packagée

```bash
npx asar extract "release/mac-arm64/BotApp.app/Contents/Resources/app.asar" /tmp/botapp-asar-check
rg "setPath|bootstrapRelayConfig|relay-runtime-bootstrap" /tmp/botapp-asar-check/electron/main.cjs
```

Confirmer `app.setPath("userData", canonicalUserDataDir())` **avant** `app.whenReady()`.

### Dispatcher (terminal — dev uniquement)

```bash
/Users/admin/instagram-worker-python/scripts/run_control_dispatcher_service.sh status
```

Ne pas demander ces commandes à Liam.

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
