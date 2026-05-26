# 各 Screen 具體功能與 API 使用說明

後端基礎 URL：`http://{host}:{port}`（預設 `http://rns-chat.local:5000`）

---

## Tab 1：聯絡人頁（`app/(tabs)/contacts.tsx`）

### 功能概述

統一管理**已儲存聯絡人**、**Lobby 活躍節點**、**封鎖名單**、**群組**四種資料，並提供導航至聊天頁的入口。

### 子標籤

| 標籤 | 說明 |
|------|------|
| 聯絡人 | 已儲存的聯絡人列表，可編輯暱稱與備註 |
| 群組 | 已加入的群組列表，可建立、加入、管理群組 |
| 區域搜索 | 目前在 Lobby 中的活躍節點，可直接儲存或導航 |
| 封鎖 | 封鎖名單，可解除封鎖 |

### 導航

點擊聯絡人或 Lobby 節點 → 跳轉至 `chat.tsx` 並帶入 `dest_hash` 參數
點擊群組 → 跳轉至 `chat.tsx` 並帶入 `group_name` 參數

### 使用的 API

#### 讀取資料

| 用途 | 端點 | 回傳格式 |
|------|------|----------|
| 聯絡人列表 | `GET /getContactList` | `data.contacts[]`（含 dest_hash, nickname, notes） |
| Lobby 節點 | `GET /getLobby` | `data.lobby[]`（過濾掉 `announced_name === "Unknown"`） |
| 封鎖名單 | `GET /getBlocklist` | `data.blocklist[]` |
| 群組清單 | `GET /getGroups`（由 MessagingContext 輪詢） | `data.groups[]`（含 group_id, group_name, members） |
| 群組詳情刷新 | `GET /getGroupChat/{group_id}` | `data.group_room`（含最新 members） |

#### 聯絡人操作

| 操作 | 端點 | Body |
|------|------|------|
| 儲存聯絡人 | `POST /saveContact` | `{ dest_hash, nickname?, notes? }` |
| 編輯暱稱 | `POST /editContactName` | `{ dest_hash, nickname }` |
| 編輯備註 | `POST /editContactNote` | `{ dest_hash, note_text }` |
| 封鎖聯絡人 | `POST /blockContact` | `{ dest_hash, reason? }` |
| 解除封鎖 | `POST /unblockContact` | `{ dest_hash }` |
| 隱藏連結 | `POST /hideLink` | `{ dest_hash, reason? }` |
| 刪除聯絡人 | `POST /deleteContact` | `{ dest_hash }` |

#### 群組操作

| 操作 | 端點 | Body |
|------|------|------|
| 建立群組 | `POST /newGroup` | `{ group_name, self_name, members[], invite_message? }` |
| 加入群組 | `POST /joinGroup` | `{ group_name, self_name }` |
| 新增成員 | `POST /addGroupMembers` | `{ group_id, group_name, members[], invite_message? }` |
| 修改顯示名稱 | `POST /setSelfDisplayName` | `{ group_id, group_name, self_name }` |
| 離開群組 | `POST /leaveGroup` | `{ group_id }` |

> `group_id` 為後端分配的 UUID，建立或加入群組後由 API 回應的 `data.group_room.group_id` 取得。所有需要識別群組的操作均優先傳送 `group_id`。

### 群組詳細 Modal 的資料更新機制

開啟詳細 Modal 時採兩階段更新：
1. 立即以 `groupRooms` 快照渲染（無延遲）
2. 同時呼叫 `GET /getGroupChat/{group_id}` 取得最新 `group_room`，完成後覆蓋顯示

此外，`groupRooms` 每次輪詢更新時（每 10 秒），若 Modal 仍開啟，會自動同步最新成員清單。

### 注意事項

- Lobby 節點列表過濾掉 `announced_name === 'Unknown'` 的條目（本機節點）
- `registerGroup(room)` 在建立或加入群組後立即將後端回傳的 `GroupRoom`（含 `group_id`）寫入本地狀態，不需等待下次輪詢

---

## Tab 2：聊天頁（`app/(tabs)/chat.tsx`）

### 功能概述

應用的核心對話頁面，支援**點對點（P2P）** 和**群組**兩種模式，具備 GPS 位置分享功能。由 `contacts.tsx` 導航時帶入目標（`dest_hash` 或 `group_name` 參數）。

### 介面元素

- **Header 標題**：顯示當前對話對象名稱與連線狀態點
- **群組成員選單**（Header 右側按鈕）：群組模式下顯示成員清單
- **GiftedChat 訊息列表**：支援文字和位置地圖氣泡
- **位置按鈕**（左下角）：分享當前 GPS 座標
- **傳遞狀態 tick**：P2P 模式下顯示 ✓（傳送中）、✓✓（已送達）、✕（逾時）

### 使用的 API

#### 讀取訊息（輪詢）

| 場景 | 端點 | 間隔 | 說明 |
|------|------|------|------|
| 已儲存聯絡人 | `GET /getChat/{dest_hash}` | 4,000 ms | 回傳 `data.messages[]` |
| 未儲存節點（404 fallback） | `GET /getDirectChat/{dest_hash}` | 4,000 ms | 回傳 `data.messages[]` |
| 群組訊息 | `GET /getGroupChat/{group_id}` | 5,000 ms | 回傳 `data.messages[]` + `data.group_room`，以 `group_id` 查詢（fallback 至 `group_name`） |

切換節點或群組時，除顯示快取訊息外，會**立即觸發一次 poll**，不等待下一個 interval tick。

#### 發送訊息

| 場景 | 端點 | 方法 | Body |
|------|------|------|------|
| 已儲存聯絡人 | `POST /msgContact` | POST | `{ dest_hash, message }` |
| 未儲存節點（404 fallback） | `POST /msgDirect` | POST | `{ dest_hash, message }` |
| 群組訊息 | `POST /msgGroup` | POST | `{ group_id, group_name, message }` |

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
| 群組訊息 | ① `from_hash === localDestHash`（最可靠）② `status === 'delivered'` ③ `from_name === selfName` |

### 過濾機制

接收到的 P2P 訊息會過濾掉 `packet_type`（或緊湊鍵 `pkt_type`）為 `"group"`、`"group_system"`、`"broadcast"` 的 JSON 封包（群組／廣播控制封包透過 P2P 通道傳送所產生的副本）：

```typescript
const isGroupPacket = (content?: string): boolean => {
  try {
    const p = JSON.parse(content);
    const pt: string = p.packet_type ?? p.pkt_type;
    return pt === 'group' || pt === 'group_system' || pt === 'broadcast';
  } catch { return false; }
};
```

### Stale Closure 防護

`pollPeer`、`pollGroup`、`onSend`、`sendLocation` 等非同步回調使用 ref 讀取最新狀態，避免 closure 捕捉到舊值：

- `chatModeRef` / `selectedPeerRef` / `selectedGroupRef` — 當前模式與目標
- `groupRoomsRef` — 最新群組清單（用於取得 `group_id`）
- `localDestHashRef` — 本機節點 hash（用於 isSelf 判斷）
- `lobbyPeersRef` — 最新 Lobby 清單

---

## Tab 3：廣播頻道（`app/(tabs)/broadcast_chat.tsx`）

### 功能概述

透過 RNS PLAIN 廣播目的地（所有節點共享）發送與接收廣播訊息。無群組、無成員概念，純粹的廣播訊息輸入／輸出頁面。

### 介面元素

- **訊息列表**：自己發出的訊息靠右（淡黃底色 `#fff171`），收到的靠左（灰底 `#E4E4E4`）
- **寄件人標籤**：他人訊息上方顯示 `from_hash` 前 8 字元
- **時間戳**：每則訊息底部顯示 `HH:MM`
- **輸入列**：文字輸入框 + 送出按鈕
- **空狀態提示**：首次使用前顯示「送出第一則訊息以加入廣播頻道」

### 廣播頻道初始化流程

1. 啟動時從 AsyncStorage（`bcaster_dest_hash`）嘗試恢復已知的廣播目的地 hash
2. 若無，需要先送出一則訊息
3. 送出成功後，從後端回應的 `data.dest_hash` 取得廣播目的地 hash 並存入 AsyncStorage
4. 取得 hash 後才啟動 4,000 ms 輪詢抓取歷史訊息

### 使用的 API

| 用途 | 端點 | 方法 | Body / 說明 |
|------|------|------|-------------|
| 送出廣播 | `/broadcaster/send` | POST | `{ sender_name, message }` → 回應包含 `data.dest_hash` |
| 抓取歷史 | `/broadcaster/history/{dest_hash}` | GET | 回傳 `data.messages[]` |

### 訊息方向判斷

| 欄位 | 說明 |
|------|------|
| `status === 'send_pending'` | 自己發出的訊息（右側） |
| 其餘（`'received'` 等） | 收到的訊息（左側） |

> 廣播歷史在後端重啟後不會自動恢復記憶體（僅儲存至磁碟，不在啟動時載回），前端重啟後須等新訊息進來才能重建顯示。

---

## Tab 4：設定與診斷頁（`app/(tabs)/j_settings.tsx`）

### 功能概述

提供後端連線設定、端點連通性診斷、群組 Debug 面板，以及原始 JSON 資料檢視。

### 功能區塊

| 區塊 | 說明 |
|------|------|
| 端點設定 | 修改 Host / Port，即時生效 |
| 本機 Hash | 顯示本機 RNS 節點的 dest_hash（`尚未取得` 表示尚未連線） |
| 端點診斷 | 依序測試各 API 端點並顯示回應 |
| 群組 Debug | 列出所有群組詳細資訊及 JSON 原始回應 |
| 自動刷新 | 每 5 秒自動重新查詢所有診斷資料 |

### 診斷的 API 端點

| 端點 | 用途 |
|------|------|
| `GET /status` | 後端服務狀態 |
| `GET /identity` | 本機節點身份（`destination_in.hash`） |
| `GET /getSystemTime` | 後端系統時間（時鐘同步用） |
| `GET /getContactList` | 聯絡人列表 |
| `GET /getLobby` | Lobby 節點 |
| `GET /getGroupChat/{group_id}` | 群組詳細（逐一查詢已知群組） |

---

## 共用元件

### `LocationMessageBubble`（`components/LocationMessageBubble.tsx`）

在聊天訊息中渲染 Mapbox 迷你地圖，顯示發送的 GPS 位置。

- **地圖大小**：220 × 150 px（`LOCATION_MAP_SIZE`）
- **縮放級別**：14（`LOCATION_MAP_ZOOM`）
- **離線支援**：優先使用本地快取磁磚
- **無 token 降級**：顯示文字坐標
- **offlineStatus 徽章**：顯示 queued / sent / failed 狀態

### `GroupModals`（`components/GroupModals.tsx`）

群組相關 Modal 元件集合：

| 元件 | 功能 |
|------|------|
| `CreateGroupModal` | 建立新群組（名稱、顯示名稱、邀請成員） |
| `JoinGroupModal` | 輸入群組名稱與顯示名稱加入群組 |
| `GroupDetailModal` | 查看成員、修改顯示名稱、新增成員、離開群組 |
| `AddMembersModal` | 從 Lobby 選取節點並發送邀請 |

### `MessagingContext`（`app/context/MessagingContext.tsx`）

詳見架構文件，此為應用唯一的全域狀態中心。
