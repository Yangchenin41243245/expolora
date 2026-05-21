# 各 Screen 具體功能與 API 使用說明

後端基礎 URL：`http://{host}:{port}`（預設 `http://rns-chat.local:5000`）

---

## Tab 1：聯絡介面（`app/(tabs)/contacts.tsx`）

### 功能概述

管理所有聯絡關係，包含已儲存聯絡人、群組、區域搜索（Lobby）、封鎖名單四個子標籤。

### 子標籤

| 標籤 | 說明 |
|------|------|
| 聯絡人 | 已儲存的聯絡人列表，燈號反映即時在線狀態 |
| 群組 | 群組房間列表，整合原 groups.tsx 功能 |
| 區域搜索 | 目前在 Lobby 中的活躍節點 |
| 封鎖 | 封鎖名單，可解除封鎖 |

### 欄位互動

| 操作 | 行為 |
|------|------|
| 點擊聯絡人 / 群組欄位 | 導航至聊天頁，自動選取對應 peer 或群組 |
| 點擊右側 `⋯` 按鈕 | 開啟設定 Modal（編輯暱稱、封鎖、群組詳細等） |

### 聯絡人在線狀態

`/getContactList` 不回傳 `online` 欄位，透過比對 `lobbyPeers` 取得即時在線狀態。

### 使用的 API

#### 讀取資料

| 用途 | 端點 | 回傳格式 |
|------|------|----------|
| 聯絡人列表 | `GET /getContactList` | `data.contacts[]`（含 dest_hash, nickname, notes） |
| Lobby 節點 | `GET /getLobby` | `data.lobby[]`（過濾掉 `announced_name === "Unknown"`） |
| 封鎖名單 | `GET /getBlocklist` | `data.blocklist[]` |
| 群組列表 | `GET /getGroups` | `data.groups[]` |
| 群組詳細 | `GET /getGroupChat/{group_name}` | `data.group_room`（含 members, join_confirm） |

#### 聯絡人操作

| 操作 | 端點 | Body |
|------|------|------|
| 儲存聯絡人 | `POST /saveContact` | `{ dest_hash, nickname?, notes? }` |
| 編輯暱稱 | `POST /editContactName` | `{ dest_hash, nickname }` |
| 編輯備註 | `POST /editContactNote` | `{ dest_hash, notes }` |

#### 封鎖操作

| 操作 | 端點 | Body |
|------|------|------|
| 封鎖聯絡人 | `POST /blockContact` | `{ dest_hash }` |
| 解除封鎖 | `POST /unblockContact` | `{ dest_hash }` |
| 隱藏連結 | `POST /hideLink` | `{ dest_hash }` |

#### 群組操作

| 操作 | 端點 | Body |
|------|------|------|
| 建立群組 | `POST /newGroup` | `{ group_name, self_name, members[], invite_message? }` |
| 加入群組 | `POST /joinGroup` | `{ group_name, self_name }` |
| 新增成員 | `POST /addGroupMembers` | `{ group_name, members[], invite_message? }` |
| 修改顯示名稱 | `POST /setSelfDisplayName` | `{ group_name, self_name }` |

### 注意事項

- Lobby 節點列表會過濾掉 `announced_name === 'Unknown'` 的條目
- Modal 底部設有 `paddingBottom: 28` 以避免被手機系統 UI 遮擋
- 群組詳細 Modal 開啟時採兩階段更新：先顯示快照，再以 `/getGroupChat` 覆蓋

---

## Tab 2：聊天頁（`app/(tabs)/index.tsx`）

### 功能概述

應用的核心頁面，支援**點對點（P2P）** 和**群組**兩種對話模式，具備 GPS 位置分享功能。

### 介面元素

- **Navigation Title**：動態顯示當前對話對象名稱與在線燈號
- **GiftedChat 訊息列表**：支援文字和位置地圖氣泡
- **位置按鈕**（左下角）：分享當前 GPS 座標
- **加入群組 Banner / Modal**：尚未加入的群組顯示提示
- **群組成員選單**（右上角 headerRight）：群組模式下顯示，列出成員與在線狀態

### Navigation Title 狀態

| chatMode | 顯示 |
|----------|------|
| `null` | `SNS對話` |
| `'peer'` — 在線 | `● {peer 名稱}`（綠點） |
| `'peer'` — 離線 | `● {peer 名稱}`（灰點） |
| `'group'` | `■ {群組名稱}`（藍方形） |

### 導航接收（來自聯絡人頁）

透過 `useLocalSearchParams` 接收 `dest_hash` 或 `group_name` 參數，自動選取對應對話目標並清除參數。

### 使用的 API

#### 讀取訊息（輪詢）

| 場景 | 端點 | 間隔 | 說明 |
|------|------|------|------|
| 已儲存聯絡人 | `GET /getChat/{dest_hash}` | 4,000 ms | 回傳 `data.messages[]` |
| 未儲存節點（404 fallback） | `GET /getDirectChat/{dest_hash}` | 4,000 ms | 回傳 `data.messages[]` |
| 群組訊息 | `GET /getGroupChat/{group_name}` | 5,000 ms | 回傳 `data.messages[]` + `data.group_room` |

切換節點或群組時，除顯示快取訊息外，會**立即觸發一次 poll**，不等待下一個 interval tick。

#### 發送訊息

| 場景 | 端點 | 方法 | Body |
|------|------|------|------|
| 已儲存聯絡人 | `POST /msgContact` | POST | `{ dest_hash, message }` |
| 未儲存節點（404 fallback） | `POST /msgDirect` | POST | `{ dest_hash, message }` |
| 群組訊息 | `POST /msgGroup` | POST | `{ group_name, message }` |
| 快速加入群組 | `POST /msgGroup` | POST | `{ group_name, message: "/join" }` |

### 位置訊息格式

發送時以純文字傳輸：`📍 Location: {latitude}, {longitude}`

接收時以正則解析還原地圖氣泡：
```
LOCATION_MESSAGE_RE = /(?:📍\s*)?Location:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i
```

### 訊息方向判斷

| 欄位 | 判斷邏輯 |
|------|----------|
| P2P 訊息 | `status !== 'received'` → 自己發的（右側） |
| 群組訊息 | `status === 'delivered'` 或 `from_name === selfName` → 自己發的 |

### 過濾機制

接收到的 P2P 訊息會過濾掉 `category === "group"` 的 JSON 封包（群組邀請、群組訊息透過 P2P 通道傳送所產生的副本）。

---

## 設定頁（`app/(tabs)/j_settings.tsx`）

### 功能概述

提供後端連線設定、端點連通性診斷、群組 Debug 面板，以及原始 JSON 資料檢視。

### 功能區塊

| 區塊 | 說明 |
|------|------|
| 端點設定 | 修改 Host / Port，即時生效 |
| 端點診斷 | 依序測試各 API 端點並顯示回應 |
| 群組 Debug | 列出所有群組詳細資訊及 JSON 原始回應 |
| 自動刷新 | 每 5 秒自動重新查詢所有診斷資料 |
| 測試發送 | 對指定節點發送測試訊息 |

### 診斷的 API 端點

| 端點 | 用途 |
|------|------|
| `GET /status` | 後端服務狀態 |
| `GET /identity` | 本機節點身份（`destination_in.hash`） |
| `GET /messages` | 舊版訊息列表 |
| `GET /getContactList` | 聯絡人列表 |
| `GET /getLobby` | Lobby 節點 |
| `GET /getGroupChat/{name}` | 群組詳細（逐一查詢已知群組） |

---

## 隱藏 Tab：群組管理（`app/(tabs)/groups.tsx`）

> 此頁面在底部導覽列隱藏（`href: null`），保留程式碼供直接路由使用。
> 群組功能已整合至聯絡介面（contacts.tsx）的「群組」子標籤。

---

## 共用元件

### `GroupModals`（`components/GroupModals.tsx`）

群組相關 Modal 元件，從 `groups.tsx` 抽出以便多頁面共用：
`CreateGroupModal`、`JoinGroupModal`、`GroupDetailModal`、`AddMembersModal`

### `LocationMessageBubble`（`components/LocationMessageBubble.tsx`）

在聊天訊息中渲染 Mapbox 迷你地圖，顯示發送的 GPS 位置。

- **地圖大小**：220 × 150 px（`LOCATION_MAP_SIZE`）
- **縮放級別**：14（`LOCATION_MAP_ZOOM`）
- **離線支援**：優先使用本地快取磁磚
- **無 token 降級**：顯示文字坐標
- **offlineStatus 徽章**：顯示 queued / sent / failed 狀態

### `MessagingContext`（`app/context/MessagingContext.tsx`）

詳見架構文件，此為應用唯一的全域狀態中心。
