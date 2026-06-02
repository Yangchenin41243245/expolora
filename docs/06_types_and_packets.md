# 型別定義與群組封包格式

---

## TypeScript 型別定義

### `types/chat.ts`

```typescript
// 離線訊息同步狀態
type OfflineStatus = 'queued' | 'sending' | 'sent' | 'failed';

// GPS 座標載體
interface LocationPayload {
  latitude:  number;  // -90 ~ 90
  longitude: number;  // -180 ~ 180
}

// 擴充 GiftedChat IMessage，新增位置與離線狀態
interface LocationMessage extends IMessage {
  location?:      LocationPayload;
  offlineStatus?: OfflineStatus;
  deliveryStatus?: DeliveryStatus;
}
```

### `app/context/MessagingContext.tsx`

```typescript
// Lobby 中的活躍節點
type LobbyPeer = {
  dest_hash:         string;   // 32 hex 字元
  announced_name?:   string;   // RNS Announce 攜帶的名稱
  nickname?:         string;   // 已儲存聯絡人的暱稱
  is_saved_contact?: boolean;
  online?:           boolean;
};

// 群組成員
type GroupMember = {
  dest_hash:     string;
  display_name?: string;  // 群組內的顯示名稱
};

// 群組房間狀態
type GroupRoom = {
  group_name:    string;
  group_id?:     string;       // 後端分配的 UUID，建立/加入後填入
  self_name?:    string;       // 自己在該群組的顯示名稱
  join_confirm?: boolean;      // true = 已確認加入
  members?:      GroupMember[];
};

// 群組訊息（來自後端 /getGroupChat）
type GroupMessage = {
  message_id:   string;
  message_type: 'GROUP' | 'GROUP_INVITE' | 'GROUP_SYSTEM' | 'GROUP_JOIN';
  content?:     string;
  from_hash?:   string;
  from_name?:   string;
  group_name?:  string;
  status?:      string;    // 'delivered' | 'received'
  timestamp?:   number;    // Unix 秒
  to_hash?:     string;
};
```

**Context 方法簽名：**

```typescript
registerGroup:   (room: GroupRoom) => Promise<void>;
unregisterGroup: (group_id: string) => Promise<void>;
refreshGroups:   () => Promise<void>;
```

### `app/(tabs)/chat.tsx`（本地型別）

```typescript
// 原始 P2P 訊息（來自後端 /getChat 或 /getDirectChat）
type RawPeerMsg = {
  message_id?: string;
  from_hash?:  string;
  to_hash?:    string;
  content?:    string;
  status?:     string;    // 'delivered' = 自己發的, 'received' = 別人發的
  timestamp?:  number;    // Unix 秒
};

// 原始群組訊息（來自後端 /getGroupChat）
type RawGroupMsg = {
  message_type: 'GROUP' | 'GROUP_INVITE' | 'GROUP_SYSTEM' | 'GROUP_JOIN';
  content?:     string;
  from_hash?:   string;
  from_name?:   string;
  message_id?:  string;
  status?:      string;
  timestamp?:   number;
};
```

### `app/(tabs)/broadcast_chat.tsx`（本地型別）

```typescript
// 來自後端 /broadcaster/history/{dest_hash} 的原始訊息
type RawMsg = {
  message_id?: string;
  timestamp?:  number;   // Unix 秒
  from_hash?:  string;   // 廣播 PLAIN 目的地 hash（非發送者身份 hash）
  content?:    string;
  status?:     string;   // 'send_pending' = 自己發的
};

// 渲染用訊息
type DisplayMsg = {
  id:        string;
  timestamp: number;
  from_hash: string;
  content:   string;
  isSelf:    boolean;   // status === 'send_pending'
};
```

---

## 後端 API 回應 JSON 格式

### `GET /getLobby`

```json
{
  "data": {
    "lobby": [
      {
        "dest_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "announced_name": "Alice",
        "nickname": null,
        "is_saved_contact": false,
        "online": true
      }
    ]
  }
}
```

### `GET /getGroups`

```json
{
  "data": {
    "groups": [
      {
        "group_id":      "550e8400-e29b-41d4-a716-446655440000",
        "group_name":    "my_group",
        "self_name":     "Bob",
        "join_confirm":  true,
        "invite_message": "",
        "members": [
          { "dest_hash": "a1b2c3d4...", "display_name": "Alice" }
        ],
        "created_at": 1715000000,
        "updated_at": 1715000001
      }
    ],
    "count": 1
  }
}
```

### `GET /getChat/{dest_hash}` 與 `GET /getDirectChat/{dest_hash}`

```json
{
  "data": {
    "messages": [
      {
        "message_id": "550e8400-e29b-41d4-a716-446655440000",
        "from_hash":  "a1b2c3d4...",
        "to_hash":    "e5f6a7b8...",
        "content":    "Hello!",
        "status":     "received",
        "timestamp":  1715000000
      }
    ]
  }
}
```

### `GET /getGroupChat/{group_id}`

路徑參數使用 **UUID（group_id）**，傳入 display name 會回傳 404。

```json
{
  "data": {
    "group_room": {
      "group_id":      "550e8400-e29b-41d4-a716-446655440000",
      "group_name":    "my_group",
      "self_name":     "Bob",
      "join_confirm":  true,
      "members": [
        { "dest_hash": "a1b2c3d4...", "display_name": "Alice" }
      ]
    },
    "messages": [
      {
        "message_id":   "uuid...",
        "message_type": "GROUP",
        "content":      "大家好",
        "from_hash":    "a1b2c3d4...",
        "from_name":    "Alice",
        "group_name":   "my_group",
        "status":       "received",
        "timestamp":    1715000001
      }
    ]
  }
}
```

### `POST /newGroup` 與 `POST /joinGroup` 回應

建立或加入群組後，回應中包含完整的 `group_room`（含 `group_id`），前端立即以此寫入本地狀態：

```json
{
  "data": {
    "group_room": {
      "group_id":   "550e8400-e29b-41d4-a716-446655440000",
      "group_name": "my_group",
      "self_name":  "Bob",
      "join_confirm": true,
      "members": []
    }
  }
}
```

### `GET /identity`

```json
{
  "destination_in": {
    "hash": "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  }
}
```

### `POST /broadcaster/send`

發送廣播訊息。首次呼叫可從回應中取得廣播 PLAIN 目的地 hash。

請求 Body：
```json
{ "sender_name": "a1b2c3d4", "message": "Hello world" }
```

回應：
```json
{
  "data": {
    "dest_hash":  "f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2",
    "message_id": "550e8400-e29b-41d4-a716-446655440000",
    "status":     "queued"
  }
}
```

### `GET /broadcaster/history/{dest_hash}`

取得廣播頻道歷史訊息。`dest_hash` 為廣播 PLAIN 目的地 hash（非個人身份 hash）。

```json
{
  "data": {
    "messages": [
      {
        "message_id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp":  1715000000,
        "from_hash":  "f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2",
        "content":    "Hello world",
        "status":     "send_pending"
      }
    ]
  }
}
```

> `from_hash` 為廣播 PLAIN 目的地 hash，所有訊息的 `from_hash` 相同（非各別發送者身份）。`status === 'send_pending'` 標識自己發出的訊息，其餘為收到的訊息。

---

## 群組封包格式（P2P 通道中的群組控制訊息）

RNS 群組控制訊息以 JSON 字串形式透過點對點連線傳送，後端將其儲存在目標節點的直接訊息記錄（`rns_app_chats/{dest_hash}.json`）中。前端必須偵測並過濾這些封包，避免在 P2P 聊天介面顯示。

### 辨識與過濾流程

```typescript
// 定義於 app/(tabs)/chat.tsx（模組層級，非 React hook）
const isGroupPacket = (content?: string): boolean => {
  if (!content) return false;
  try {
    const p = JSON.parse(content);
    if (typeof p !== 'object' || p === null) return false;
    // packet_type = 舊版欄位；pkt_type = 新版緊湊欄位
    const pt: string = p.packet_type ?? p.pkt_type;
    return pt === 'group' || pt === 'group_system' || pt === 'broadcast';
  } catch { return false; }
};
```

**過濾發生的位置**：僅在 `pollPeer`（P2P 訊息輪詢）套用：

```typescript
const converted = rawMsgs
  .filter(m => !isGroupPacket(m.content))   // ← 過濾群組封包
  .map((m, i) => rawPeerMsgToIMessage(m, i))
  .reverse();
```

**過濾邏輯**：
- `content` 為空或非字串 → `false`（保留訊息）
- `JSON.parse` 失敗（純文字訊息）→ `false`（保留訊息）
- 解析後物件的 `packet_type`（或緊湊鍵 `pkt_type`）為 `"group"` / `"group_system"` / `"broadcast"` → `true`（過濾掉）

> **緊湊鍵說明**：新版廣播封包（`broadcaster.py`）使用 `pkt_type` 而非 `packet_type`，後端 `on_packet` 兩者都接受（`contents.get("pkt_type") or contents.get("packet_type")`）。前端過濾邏輯亦應同時檢查兩個鍵。

### 群組封包通用格式

新版封包使用 `packet_type` 欄位（舊版為 `category`）：

```json
{
  "packet_type": "group",
  "action":      "invite | message | joined | leave",
  "group_id":    "550e8400-e29b-41d4-a716-446655440000",
  "group_name":  "my_group",
  "from_name":   "Alice",
  ...
}
```

### 邀請封包（`action: "invite"`）

```json
{
  "packet_type":    "group",
  "action":         "invite",
  "group_id":       "550e8400-e29b-41d4-a716-446655440000",
  "group_name":     "my_group",
  "from_name":      "Alice",
  "invite_message": "歡迎加入！"
}
```

> GROUP 封包不攜帶完整成員清單（RNS MTU 約 500 bytes），成員清單僅在 GROUP_SYSTEM 封包中傳送。

### 系統通知（`packet_type: "group_system"`）

```json
{
  "packet_type": "group_system",
  "group_id":    "550e8400-e29b-41d4-a716-446655440000",
  "group_name":  "my_group",
  "content":     "Alice 已加入群組",
  "members": [
    { "dest_hash": "a1b2c3d4...", "display_name": "Alice" }
  ]
}
```

### 為何這些封包出現在 P2P 記錄中

RNS 目前沒有原生群播（multicast）機制，群組邀請由建立者逐一透過 P2P 連線發送給每位成員。後端在接收封包時將其存入直接訊息記錄（作為歷史備份），導致 P2P 聊天介面在不過濾的情況下會顯示原始 JSON 字串。

---

## 位置訊息格式

位置訊息以純文字傳送，接收端以正則解析還原地圖氣泡。

**發送格式：**
```
📍 Location: 23.706375, 120.430419
```

**解析正則：**
```typescript
const LOCATION_MESSAGE_RE =
  /(?:📍\s*)?Location:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
```

解析後將 `{ latitude, longitude }` 注入 `LocationMessage.location`，`renderMessageText` 在有 `location` 時返回 `null` 以隱藏文字，改由 `LocationMessageBubble` 渲染地圖氣泡。
