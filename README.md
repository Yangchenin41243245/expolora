# expolora

Expo / React Native frontend for the RNS mesh chat system. Connects to a
[rns_app-core](../rns_app-core) Flask backend over local Wi-Fi and provides
peer discovery, direct messaging, and group chat via Reticulum Network Stack.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (or npm)
- Expo CLI (`npm install -g expo-cli`)
- Android device or emulator (native features require Android/iOS)
- A running `rns_app-core` backend on the same network

### Install and Run

```bash
# in c:\dev\expolora
pnpm install          # or npm install
pnpm start            # starts Metro bundler
pnpm android          # build & launch on Android
pnpm web              # start web dev server (limited — no offline maps)
```

### Configure Backend Host

On first launch the app connects to `rns-chat.local:5000` (mDNS name for the
Linux/macOS backend machine). To point at a different host:

1. Open the **JSON / Settings** tab in the app.
2. Enter the backend's IP address (e.g. `192.168.1.102`) and port.
3. Tap **套用** (Apply). The setting persists across restarts.

> **Windows backend**: use the machine's LAN IP, not `rns-chat.local`. mDNS
> `.local` resolution is unreliable on Windows clients.

---

## Architecture

```
┌─────────────────────────────────┐
│   expolora (Expo React Native)  │
│                                 │
│  MessagingContext               │   HTTP polling
│   ├─ /getLobby   (5 s)  ───────────────────────► rns_app-core
│   ├─ /getGroups  (10 s) ───────────────────────► Flask :5000
│   └─ /identity   (once) ───────────────────────►
│                                 │
│  Tabs                           │
│   ├─ index      — peer chat     │
│   ├─ contacts   — contact list  │
│   ├─ groups     — group rooms   │
│   ├─ identity   — chat history  │
│   └─ j_settings — debug / config│
└─────────────────────────────────┘
```

State is managed through a single React Context (`MessagingContext`). All
screens share lobby peers, group rooms, and connection settings through it.
There is no local state management library — everything is `useState` /
`useEffect` inside the provider.

---

## File Structure

```
app/
  _layout.tsx            Root layout; triggers offline map pre-download on native
  (tabs)/
    _layout.tsx          Tab bar definition
    index.tsx            1-on-1 peer chat (lobby → message flow)
    contacts.tsx         Saved contact list
    groups.tsx           Group room list and group chat
    identity.tsx         Chat history viewer / clearer
    j_settings.tsx       Debug panel, host/port config, test message sender
  context/
    MessagingContext.tsx  Global state: lobby, groups, host/port, identity hash

constants/
  mapbox.ts              Mapbox token, style URL, offline pack configuration
  theme.ts               Shared colour tokens

utils/
  location.ts            GPS + Mapbox offline tile management (native)
  location.web.ts        Web stub — no-op for offline tiles, uses expo-location
```

### Platform-Specific Files

Metro automatically selects `*.web.ts` over `*.ts` for web builds. This is used
to exclude `@rnmapbox/maps` (native-only) from the web bundle:

| File | Platform |
|------|----------|
| `utils/location.ts` | Android / iOS |
| `utils/location.web.ts` | Web (no-op offline tiles) |

---

## Key Concepts

### Lobby

`GET /getLobby` returns active RNS peers that have announced themselves and
established a link. The app polls every 5 seconds. The backend filters out the
node's own `dest_hash` before returning results; the frontend also filters
`selfDestHash` received from `/identity` as a second safeguard.

**`LobbyPeer` type** (matches what the backend sends):

```ts
type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  nickname?: string;          // set by the peer's backend config
  is_saved_contact?: boolean;
  online?: boolean;
};
```

### Groups

Group state lives in both AsyncStorage (known group names) and the backend
(`/getGroups`, `/getGroupChat/<name>`). The frontend merges the two lists on
every poll. Groups are removed locally if the backend returns 404; network
errors are treated as transient and the group is kept.

### Offline Maps (native only)

On first app launch (`app/_layout.tsx`) the app silently pre-downloads a
Mapbox tile pack covering a 2 km radius around 虎尾 (Huwei, Taiwan):

- Center: `23.706375, 120.430419`
- Radius: 2 km
- Zoom: 12–16

The pack is named `huwei_map_2km`. Subsequent launches check for the pack by
name and skip the download if it already exists.

---

## Backend API Reference

The backend is documented in detail in
[rns_app-core/API_FLOWS_AND_EXAMPLES.md](../rns_app-core/API_FLOWS_AND_EXAMPLES.md).
The endpoints this app calls:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/identity` | GET | Own `dest_hash` and identity info |
| `/getLobby` | GET | Active RNS peers |
| `/getGroups` | GET | All known group rooms |
| `/getGroupChat/<name>` | GET | Room state + message history |
| `/getContactList` | GET | Saved contacts |
| `/getChat/<hash>` | GET | Persisted chat with a contact |
| `/getDirectChat/<hash>` | GET | Session-only chat with unsaved peer |
| `/msgContact` | POST | Send to saved contact |
| `/msgDirect` | POST | Send to unsaved peer |
| `/msgGroup` | POST | Send to group room |
| `/newGroup` | POST | Create group |
| `/joinGroup` | POST | Join group with display name |
| `/saveContact` | POST | Save lobby peer as contact |
| `/blockContact` | POST | Block a saved contact |
| `/clearChatHistory` | POST | Delete chat history for a peer |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Yes (native) | Mapbox public token for tile rendering and offline packs |

Set in a `.env` file at the project root or in your CI environment. Not
required for web builds (Mapbox is excluded from the web bundle).

---

## Troubleshooting

### Lobby shows no peers

1. Check the **JSON** tab — `/getLobby` response shows raw data. If it returns
   an empty list, the backend has not received announces from other nodes.
2. On Windows: open UDP port 4242 inbound so other nodes can connect back:
   ```powershell
   netsh advfirewall firewall add rule name="RNS UDP 4242" protocol=UDP dir=in localport=4242 action=allow
   ```
3. Verify the app is pointed at the correct backend IP (not `rns-chat.local`
   if running on Windows).

### Web build error: `mapbox-gl/dist/mapbox-gl.css` not found

`@rnmapbox/maps` is native-only. The web build uses `utils/location.web.ts`
to avoid importing it. If this error reappears, verify that `location.web.ts`
exists and that Metro's platform extension resolution is not overridden in
`metro.config.js`.

### `mDNS rns-chat.local` not resolving

This is a Multicast DNS name advertised by the Linux/macOS backend via
Zeroconf. Windows clients may not resolve it reliably. Use the numeric IP
address instead and configure it in the **JSON** settings tab.
