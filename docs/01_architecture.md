# 整體路由架構、功能與框架說明

## 技術堆疊概覽

| 層次 | 技術 |
|------|------|
| 框架 | React Native 0.81.5 + Expo ~54 |
| 路由 | Expo Router ~6（基於檔案系統的路由） |
| 語言 | TypeScript ~5.9 |
| 狀態管理 | React Context API + AsyncStorage |
| 聊天 UI | react-native-gifted-chat ^3.3 |
| 地圖 | @rnmapbox/maps ^10.3（原生 Mapbox GL） |
| 後端通訊 | HTTP REST（Flask，預設 `rns-chat.local:5000`） |

---

## 路由架構

Expo Router 採用**檔案即路由**的設計，整個應用的路由結構如下：

```
app/
├── _layout.tsx          ← 根層 Layout（初始化離線地圖）
├── modal.tsx            ← 通用模態頁面（保留位）
└── (tabs)/              ← 標籤頁群組
    ├── _layout.tsx      ← 標籤欄定義 + MessagingProvider 注入
    ├── index.tsx        ← Tab 1：聊天（CHAT）
    ├── contacts.tsx     ← Tab 2：聯絡人（CONTACTS）
    ├── groups.tsx       ← Tab 3：群組（GROUPS）
    ├── identity.tsx     ← Tab 4：對話紀錄（IDENTITY）
    └── j_settings.tsx   ← Tab 5：設定與診斷（JSON）
```

### 根層 `_layout.tsx`

- 設定根堆疊導航（`headerShown: false`）
- 應用啟動時呼叫 `ensureInitialOfflineMapTiles()`，預先下載虎尾周圍 2 km 離線地圖
- 下載狀態以 `Alert` 通知使用者

### 標籤 `(tabs)/_layout.tsx`

- 以 `MessagingProvider` 包裹所有標籤頁，使共享狀態全域可用
- 定義五個標籤：CHAT、CONTACTS、GROUPS、IDENTITY、JSON
- 各標籤有對應圖示（Ionicons）

---

## 應用架構圖

```
┌─────────────────────────────────────────────────┐
│                  React Native App                │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │        MessagingProvider (Context)        │    │
│  │  - baseUrl / host / port                  │    │
│  │  - lobbyPeers（5s 輪詢）                  │    │
│  │  - groupRooms（10s 輪詢）                 │    │
│  │  - localDestHash                          │    │
│  │  - registerGroup / unregisterGroup        │    │
│  └──────────────────────────────────────────┘    │
│         │              │              │           │
│   ┌─────┴─────┐  ┌─────┴────┐  ┌────┴──────┐   │
│   │  index.tsx │  │contacts  │  │ groups.tsx │   │
│   │  (Chat)    │  │ .tsx     │  │            │   │
│   └─────┬─────┘  └──────────┘  └───────────┘   │
│         │                                        │
│   ┌─────┴──────────────────────────────────┐    │
│   │         HTTP REST API（Flask）           │    │
│   │         http://rns-chat.local:5000       │    │
│   └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 核心模組說明

### MessagingContext（`app/context/MessagingContext.tsx`）

應用的**唯一中央狀態倉庫**，所有頁面透過 `useMessaging()` hook 存取。

**提供的狀態：**

| 狀態 | 型別 | 說明 |
|------|------|------|
| `host` / `port` | string / number | 後端連線設定，持久化至 AsyncStorage |
| `baseUrl` | string | 完整 URL，`http://${host}:${port}` |
| `localDestHash` | string \| null | 本機 RNS 節點 hash，從 `/identity` 取得 |
| `lobbyPeers` | LobbyPeer[] | Lobby 中的活躍節點，每 5 秒更新 |
| `groupRooms` | GroupRoom[] | 已知群組房間清單，每 10 秒更新 |
| `groupsLoading` | boolean | 群組載入中旗標 |

**提供的方法：**

| 方法 | 說明 |
|------|------|
| `setHost(h)` | 更新後端主機並持久化 |
| `setPort(p)` | 更新後端埠號並持久化 |
| `refreshGroups()` | 呼叫 `GET /getGroups` 取得所有群組並同步 AsyncStorage |
| `registerGroup(name)` | 將群組名稱加入 AsyncStorage，立即載入狀態 |
| `unregisterGroup(name)` | 從本地清單移除群組（不通知後端） |

**AsyncStorage 鍵值：**

| 鍵 | 內容 |
|----|------|
| `saved_host` | 後端主機名稱 |
| `saved_port` | 後端埠號 |
| `known_group_names` | JSON 陣列，已知群組名稱清單（由 `refreshGroups` 與後端同步） |

---

## 輪詢策略

應用採用**輪詢（Polling）**而非 WebSocket，原因是後端為 Flask 同步架構。

| 資料類型 | 間隔 | 觸發位置 |
|----------|------|----------|
| Lobby 節點 | 5,000 ms | MessagingContext |
| 群組清單 | 10,000 ms | MessagingContext |
| P2P 聊天訊息 | 4,000 ms | index.tsx |
| 群組聊天訊息 | 5,000 ms | index.tsx |

---

## 資料持久化策略

| 資料 | 儲存位置 | 說明 |
|------|----------|------|
| 後端連線設定 | AsyncStorage | 跨重啟保留 |
| 已知群組名稱 | AsyncStorage + 後端同步 | `refreshGroups` 每次輪詢時由後端 `/getGroups` 覆寫，重裝後自動恢復 |
| 聊天訊息 | 後端 Flask | 完全由後端管理，前端不快取至磁碟 |
| 聯絡人 / 封鎖名單 | 後端 Flask | 同上 |
| 離線地圖磁磚 | Mapbox 本地快取 | 應用啟動時預先下載 |

---

## 平台支援

| 平台 | 支援狀態 | 備註 |
|------|----------|------|
| Android | 完整支援 | 主要開發目標，有 EAS Build CI |
| iOS | 完整支援 | bundleIdentifier: com.hizaku.expolora |
| Web | 部分支援 | Mapbox 以 stub 替代，定位改用瀏覽器 API |

Web 平台透過 platform-specific 副檔名實現差異化：
- `LocationMessageBubble.web.tsx` — Web 版地圖氣泡
- `utils/location.web.ts` — Web 版定位（`navigator.geolocation`）

---

## 已知問題與技術債

### 1. 群組在重裝 App 後消失（已修復）

**現象**：AsyncStorage 在 App 重裝後會被清空，`known_group_names` 遺失，導致 App 無法知道要查詢哪些群組，即使後端 `rns_app_groups.json` 仍有完整記錄。

**根因**：App 只儲存群組「名稱清單」，詳細狀態靠 `/getGroupChat/{name}` 即時取得。重裝後名稱清單消失，無從查詢。

**修復方式**：`refreshGroups()` 改為呼叫 `GET /getGroups`（一次取得後端所有群組），並將結果同步回 AsyncStorage。App 重裝後，下次輪詢觸發時即可自動從後端恢復群組清單。

---

### 2. `refreshGroups` 曾有過激的群組刪除 bug（已修復，`00bbda8`）

**現象**：群組突然從 UI 消失，但後端檔案仍有記錄。

**根因**：`refreshGroups()` 原本在 `fetchOneGroup()` 回傳 `null` 時（網路中斷、後端重啟）直接從 AsyncStorage 刪除該群組名稱，導致暫時性網路錯誤被誤判為「群組不存在」。

**修復方式**（`MessagingContext.tsx`）：`refreshGroups` 只更新 UI 狀態（`setGroupRooms(valid)`），不再刪除 AsyncStorage 中找不到的群組。移除只透過 `unregisterGroup()` 手動觸發。

---

### 3. 群組 JSON 封包出現在 P2P 聊天介面（已修復，`dae175e`）

**現象**：收到形如 `{"category":"group","action":"invite",...}` 的原始 JSON 顯示在直接聊天氣泡中。

**根因**：RNS 以 P2P 連線傳送群組控制封包，後端將其存入直接訊息記錄。

**修復方式**：`index.tsx` 中的 `isGroupPacket()` 在訊息轉換前過濾掉這類封包。

---

### 4. 自身節點（"Unknown"）出現在 Lobby 列表（已修復，`eb91ce5` / `4b8f356`）

**現象**：Lobby、聯絡人選取、群組成員選取中出現名為 "Unknown" 的節點，即自己的本地 RNS 節點。

**根因**：節點廣播自身 Announce 時，自己也會聽到自己的廣播，因此出現在 Lobby。

**修復方式**：`MessagingContext.fetchLobby` 與 `contacts.tsx` 的 `loadLobby` 均過濾掉 `announced_name === 'Unknown'` 的條目。

---

### 5. 位置訊息顯示為原始文字（已修復，`56b6b00` / `1119c1b`）

**現象**：收到的位置訊息（`📍 Location: 23.7, 120.4`）不顯示地圖氣泡，而是直接顯示文字。

**根因**：`commit 3c9e0de` 在重構時誤刪了 `LOCATION_MESSAGE_RE`、`parseLocationMessage`、`withLocationPayload` 等位置解析邏輯。

**修復方式**：在 `56b6b00` 完整恢復解析函式，並與 `main` 分支對齊（包含 `renderMessageText` 隱藏文字、顯示地圖氣泡）。
