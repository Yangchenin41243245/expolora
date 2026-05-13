# 後端系統架構說明

後端為獨立的 Python 專案（`rns_app-core`），透過 HTTP REST API 與本 App 通訊。

---

## 技術堆疊

| 層次 | 技術 |
|------|------|
| Web 框架 | Flask（同步，單執行緒） |
| 網路層 | Reticulum Network Stack（RNS） |
| 資料持久化 | JSON 檔案（本地磁碟） |
| 通訊協定 | RNS Packet / Link（非 TCP/IP，走 LoRa / Serial / I2P 等介面） |

---

## 目錄結構（`rns_app-core`）

```
rns_app-core/
├── src/rns_app/
│   ├── api/
│   │   └── routes.py            ← 所有 HTTP 端點定義（Flask Blueprint）
│   ├── rns/
│   │   ├── __init__.py          ← Reticulum 初始化、Destination / Link 設定
│   │   ├── announce_data.py     ← Announce 廣播處理（Lobby 更新）
│   │   ├── core.py              ← RNS 核心邏輯
│   │   ├── group_chat.py        ← 群組建立、加入、發送、封包處理
│   │   ├── state.py             ← 全域執行狀態（SharedState，含 lock）
│   │   └── status.py            ← 連線狀態追蹤
│   ├── util/
│   │   ├── identity_manager.py  ← RNS Identity / Destination 載入、config 路徑解析
│   │   ├── persistence_manager.py ← JSON 檔案讀寫（所有持久化邏輯集中於此）
│   │   ├── zeroconf_manager.py  ← mDNS / Zeroconf 服務廣播
│   │   └── log_formatter.py
│   ├── constants.py             ← 常數與 Reticulum config 路徑候選
│   ├── core_app.py              ← App 啟動入口（RNS + Flask 初始化）
│   └── flask_app.py             ← Flask app 工廠
└── ...
```

**執行時資料目錄（`~/.reticulum/storage/`）：**

```
~/.reticulum/storage/
├── rns_app_contacts.json        ← 聯絡人
├── rns_app_blocklist.json       ← 封鎖名單
├── rns_app_groups.json          ← 群組房間 metadata
├── rns_app_message_cache.json   ← 待確認送達的訊息快取
├── rns_app_chats/
│   └── {dest_hash}.json         ← P2P 聊天記錄（每個聯絡人一檔）
└── rns_app_group_chats/
    └── {group_name}.json        ← 群組聊天記錄（每個群組一檔）
```

> Reticulum config 目錄依序搜尋：`/etc/reticulum` → `~/.config/reticulum` → `~/.reticulum`，取第一個存在的目錄。`storage/` 子目錄由 `persistence_manager.get_storage_directory()` 自動建立。

---

## Reticulum Network Stack（RNS）

RNS 是為低頻寬、高延遲網路（LoRa、封包無線電、串列埠）設計的 P2P 網路協定，**與 IP 完全無關**。

### 核心概念

| 概念 | 說明 |
|------|------|
| **Identity** | 每個節點的加密身份（公私鑰對），由 RNS 自動生成 |
| **Destination** | 可定址的端點，分為 `IN`（可接收）與 `OUT`（僅傳送）兩種 |
| **dest_hash** | Destination 的 16 byte（32 hex 字元）雜湊，作為節點唯一識別碼 |
| **Announce** | 節點廣播自身存在（類似 ARP），攜帶 app_data（顯示名稱） |
| **Link** | 兩節點間的加密雙向連線（類似 TCP session） |
| **Packet** | 單向、無需連線的資料傳送（類似 UDP datagram） |
| **Lobby** | 後端監聽的 Announce 集合，即最近廣播過的活躍節點清單 |

### 訊息傳遞流程

```
發送端 App
  │
  ├─ POST /msgContact or /msgDirect
  │
  └─ Flask routes.py
       │
       └─ RNS Destination.send() 或 Link.send()
            │
            ├─ 若已有 Link：直接透過 Link 傳送
            └─ 若無 Link：建立新 Link（需對方在線並回應 Announce）
                 └─ 傳送後存入 rns_app_chats/{dest_hash}.json
```

---

## 持久化格式

### 聯絡人（`rns_app_contacts.json`）

```json
{
  "a1b2c3d4...": {
    "dest_hash": "a1b2c3d4...",
    "nickname": "Alice",
    "notes": "同學"
  }
}
```

### 群組記錄（`rns_app_groups.json`）

```json
{
  "my_group": {
    "group_name": "my_group",
    "self_name": "Bob",
    "join_confirm": true,
    "invite_message": "",
    "members": [
      { "dest_hash": "a1b2c3d4...", "display_name": "Alice" }
    ],
    "created_at": 1715000000,
    "updated_at": 1715000001
  }
}
```

### P2P 聊天記錄（`rns_app_chats/{dest_hash}.json`）

```json
[
  {
    "msg_id": "550e8400-e29b-41d4-a716-446655440000",
    "from_hash": "a1b2c3d4...",
    "to_hash":   "e5f6g7h8...",
    "content":   "Hello!",
    "status":    "delivered",
    "timestamp": 1715000000
  }
]
```

`status` 值：
- `"delivered"` — 自己發出的訊息
- `"received"` — 收到的訊息

### 群組聊天記錄（`rns_app_group_chats/{group_name}.json`）

```json
[
  {
    "message_id": "uuid-...",
    "message_type": "GROUP",
    "content": "大家好",
    "from_hash": "a1b2c3d4...",
    "from_name": "Alice",
    "group_name": "my_group",
    "status": "received",
    "timestamp": 1715000001
  }
]
```

`message_type` 值：

| 值 | 說明 |
|----|------|
| `GROUP` | 一般群組文字訊息 |
| `GROUP_INVITE` | 邀請封包（通知被加入群組） |
| `GROUP_JOIN` | 確認加入群組 |
| `GROUP_SYSTEM` | 系統通知（成員變更等） |

---

## 為什麼使用輪詢而非 WebSocket

Flask 預設為同步 WSGI，無法維持長連線。前端每隔數秒以 HTTP GET 查詢最新訊息。後續若升級至 Flask-SocketIO 或 FastAPI，可改為推送通知。

---

## 已知限制

- **單執行緒**：Flask dev server 同時只處理一個請求，高頻輪詢下可能有輕微延遲
- **群組封包透過 P2P 通道傳送**：RNS 群組邀請與訊息會以 JSON 封包透過點對點連線傳遞，後端將其存入直接訊息記錄，前端必須用 `isGroupPacket()` 過濾
