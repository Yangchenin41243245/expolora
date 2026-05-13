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

### `app/(tabs)/index.tsx`（本地型別）

```typescript
// 原始 P2P 訊息（來自後端 /getChat 或 /getDirectChat）
type RawPeerMsg = {
  msg_id?:    string;
  from_hash?: string;
  to_hash?:   string;
  content?:   string;
  status?:    string;    // 'delivered' = 自己發的, 'received' = 別人發的
  timestamp?: number;    // Unix 秒
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
        "group_name":   "my_group",
        "self_name":    "Bob",
        "join_confirm": true,
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
        "msg_id": "550e8400-e29b-41d4-a716-446655440000",
        "from_hash": "a1b2c3d4...",
        "to_hash":   "e5f6a7b8...",
        "content":   "Hello!",
        "status":    "received",
        "timestamp": 1715000000
      }
    ]
  }
}
```

### `GET /getGroupChat/{group_name}`

```json
{
  "data": {
    "group_room": {
      "group_name":   "my_group",
      "self_name":    "Bob",
      "join_confirm": true,
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

### `GET /identity`

```json
{
  "destination_in": {
    "hash": "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  }
}
```

---

## 群組封包格式（P2P 通道中的群組控制訊息）

RNS 群組邀請與群組訊息以 JSON 字串形式透過點對點連線傳送，後端將其儲存在目標節點的直接訊息記錄（`rns_app_chats/{dest_hash}.json`）中。前端必須偵測並過濾這些封包，避免在 P2P 聊天介面顯示。

### 辨識方式

```typescript
const isGroupPacket = (content?: string): boolean => {
  if (!content) return false;
  try {
    const p = JSON.parse(content);
    return typeof p === 'object' && p !== null && p.category === 'group';
  } catch { return false; }
};
```

### 邀請封包（`action: "invite"`）

```json
{
  "category":       "group",
  "action":         "invite",
  "group_name":     "my_group",
  "from_name":      "Alice",
  "invite_message": "歡迎加入！",
  "members": [
    { "dest_hash": "a1b2c3d4...", "display_name": "Alice" }
  ]
}
```

### 群組文字訊息（`action: "message"`）

```json
{
  "category":   "group",
  "action":     "message",
  "group_name": "my_group",
  "from_name":  "Alice",
  "content":    "大家好"
}
```

### 確認加入（`action: "joined"`）

```json
{
  "category":   "group",
  "action":     "joined",
  "group_name": "my_group",
  "from_name":  "Bob"
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
