# 各 Screen 具體功能與 API 使用說明

後端基礎 URL：`http://{host}:{port}`（預設 `http://rns-chat.local:5000`）

---

## Tab 1：聊天頁（`app/(tabs)/index.tsx`）

### 功能概述

應用的核心頁面，支援**點對點（P2P）** 和**群組**兩種對話模式，具備 GPS 位置分享功能。

### 介面元素

- **Header 上方雙下拉**：左側選擇 P2P 節點，右側選擇群組
- **GiftedChat 訊息列表**：支援文字和位置地圖氣泡
- **位置按鈕**（左下角）：分享當前 GPS 座標
- **加入群組 Banner / Modal**：尚未加入的群組顯示提示

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

## Tab 2：聯絡人頁（`app/(tabs)/contacts.tsx`）

### 功能概述

管理三種類型的節點：**已儲存聯絡人**、**Lobby 活躍節點**、**封鎖名單**。

### 子標籤

| 標籤 | 說明 |
|------|------|
| 聯絡人 | 已儲存的聯絡人列表，可編輯暱稱與備註 |
| Lobby | 目前在 Lobby 中的活躍節點，可直接儲存 |
| 封鎖 | 封鎖名單，可解除封鎖 |

### 使用的 API

#### 讀取資料

| 用途 | 端點 | 回傳格式 |
|------|------|----------|
| 聯絡人列表 | `GET /getContactList` | `data.contacts[]`（含 dest_hash, nickname, notes） |
| Lobby 節點 | `GET /getLobby` | `data.lobby[]`（過濾掉 `announced_name === "Unknown"`） |
| 封鎖名單 | `GET /getBlocklist` | `data.blocklist[]` |

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

### 注意事項

- Lobby 節點列表會過濾掉 `announced_name === 'Unknown'` 的條目（通常是本機節點）
- 從 Lobby 標籤可直接點擊節點開啟「新增聯絡人」Modal

---

## Tab 3：群組管理頁（`app/(tabs)/groups.tsx`）

### 功能概述

建立、加入、管理群組房間，支援成員邀請與顯示名稱設定。

### 群組狀態

| 狀態 | 說明 |
|------|------|
| `join_confirm: true` | 已加入群組，可收發訊息（綠色標示） |
| `join_confirm: false` | 待加入（收到邀請但未確認），黃色標示 |

### Modal 種類

| Modal | 功能 |
|-------|------|
| 建立群組 | 設定群組名稱、自身顯示名稱、邀請 Lobby 節點、邀請訊息 |
| 加入群組 | 輸入已知群組名稱與顯示名稱 |
| 群組詳細 | 查看成員、修改顯示名稱、確認加入、新增成員、本地移除 |
| 新增成員 | 從 Lobby 選取節點並發送邀請 |

### 群組詳細 Modal 的資料更新機制

開啟詳細 Modal 時採兩階段更新：
1. 立即以 `groupRooms` 快照渲染（無延遲）
2. 同時呼叫 `GET /getGroupChat/{group_name}` 取得最新 `group_room`，完成後覆蓋顯示

此外，`groupRooms` 每次輪詢更新時（每 10 秒），若 Modal 仍開啟，會自動同步最新成員清單，無需關閉重開。

### 使用的 API

| 操作 | 端點 | Body |
|------|------|------|
| 建立群組 | `POST /newGroup` | `{ group_name, self_name, members[], invite_message? }` |
| 加入群組 | `POST /joinGroup` | `{ group_name, self_name }` |
| 新增成員 | `POST /addGroupMembers` | `{ group_name, members[], invite_message? }` |
| 修改顯示名稱 | `POST /setSelfDisplayName` | `{ group_name, self_name }` |
| 讀取群組清單 | `GET /getGroups` | 回傳 `data.groups[]`（含所有群組 metadata） |
| 讀取群組狀態 | `GET /getGroupChat/{group_name}` | 回傳 `data.group_room`（含 members, join_confirm） |

### 群組清單持久化

群組名稱清單儲存於 AsyncStorage（`known_group_names`），每次 `refreshGroups()` 輪詢時由後端 `GET /getGroups` 覆寫更新。重裝 App 後，10 秒內即可從後端自動恢復群組清單。

---

## Tab 4：對話紀錄頁（`app/(tabs)/identity.tsx`）

### 功能概述

查詢特定節點的對話紀錄，支援清除歷史記錄，可快速從 Lobby 選取目標節點。

### 介面元素

- **模式切換**：聯絡人模式（`/getChat`）/ 未儲存模式（`/getDirectChat`）
- **Lobby 快速選取**：直接點選活躍節點
- **訊息卡片**：顯示每則訊息的詳細資訊（方向、狀態、時間戳）
- **清除按鈕**：清除選定節點的聊天紀錄

### 使用的 API

| 操作 | 端點 | 說明 |
|------|------|------|
| 查詢聯絡人記錄 | `GET /getChat/{dest_hash}` | 回傳 `data.messages[]` |
| 查詢未儲存記錄 | `GET /getDirectChat/{dest_hash}` | 回傳 `data.messages[]` |
| 清除紀錄 | `POST /clearChatHistory` | `{ dest_hash }` |

### 訊息方向判斷

利用 `localDestHash`（從 `/identity` 取得）與訊息的 `from_hash` 比對，判斷是否為自己發出的訊息。

---

## Tab 5：設定與診斷頁（`app/(tabs)/j_settings.tsx`）

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

## 共用元件

### `LocationMessageBubble`（`components/LocationMessageBubble.tsx`）

在聊天訊息中渲染 Mapbox 迷你地圖，顯示發送的 GPS 位置。

- **地圖大小**：220 × 150 px（`LOCATION_MAP_SIZE`）
- **縮放級別**：14（`LOCATION_MAP_ZOOM`）
- **離線支援**：優先使用本地快取磁磚
- **無 token 降級**：顯示文字坐標
- **offlineStatus 徽章**：顯示 queued / sent / failed 狀態

### `MessagingContext`（`app/context/MessagingContext.tsx`）

詳見架構文件，此為應用唯一的全域狀態中心。
