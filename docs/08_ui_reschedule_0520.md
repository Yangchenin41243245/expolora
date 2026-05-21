# UI Reschedule — 工程變更文件（branch: ui_reschedule_0520）

> 基於 `main`（v1.0.4）分支，記錄本次 UI 重構的所有修改。

---

## 一、目標

將原本獨立的 **群組頁（groups tab）** 整合進 **聯絡人頁（contacts tab）** 的子標籤選單，
並重新設計聊天頁（index）的導航流程，以聯絡人欄位點擊跳轉取代 header 下拉選單。

---

## 二、檔案變更摘要

| 檔案 | 類型 | 說明 |
|------|------|------|
| `components/GroupModals.tsx` | 新增 | 群組相關 Modal 元件（從 groups.tsx 抽出） |
| `app/(tabs)/_layout.tsx` | 修改 | Tab 順序調整、groups 從底部導覽列隱藏 |
| `app/(tabs)/contacts.tsx` | 修改 | 新增群組子標籤、欄位點擊導航、⋯ 選項按鈕、聯絡人在線燈號 |
| `app/(tabs)/groups.tsx` | 修改 | 移除 Modal 元件定義（改 import GroupModals） |
| `app/(tabs)/index.tsx` | 修改 | 移除 header 下拉選單、動態 title 燈號、群組成員選單 |
| `.github/workflows/apk-build.yml` | 修改 | 加入 `ui_reschedule_0520` 至 APK build 觸發分支 |

---

## 三、詳細變更

### 3.1 `components/GroupModals.tsx`（新增，~790 行）

將原本散落在 `groups.tsx` 的四個 Modal 抽出為獨立元件：

| 元件 | Props 型別 | 功能 |
|------|-----------|------|
| `CreateGroupModal` | `CreateGroupModalProps` | 建立群組、設定名稱與邀請成員 |
| `JoinGroupModal` | `JoinGroupModalProps` | 輸入群組名稱與顯示名稱加入 |
| `GroupDetailModal` | `GroupDetailModalProps` | 查看成員、修改名稱、確認加入、移除群組 |
| `AddMembersModal` | `AddMembersModalProps` | 從 Lobby 選取節點並邀請加入 |

所有 Modal 共用色彩常數 `C`，`modalSheet` 設有 `paddingBottom: 28` 以避免被手機系統 UI 遮擋。

---

### 3.2 `app/(tabs)/_layout.tsx`

**變更前**：底部導覽列顯示 CHAT、CONTACTS、GROUPS、SETTINGS
**變更後**：底部導覽列顯示 CHAT、CONTACTS、SETTINGS（groups 隱藏 `href: null`）

Tab 順序調整：
```
舊：index → contacts → groups → identity → j_settings
新：contacts → groups(hidden) → identity(hidden) → index → j_settings
```

聯絡人頁標題由「聯絡人」改為「聯絡介面」，聊天頁標題由「SNS對話」改為「通訊頁面」（可由 index.tsx 動態覆蓋）。

---

### 3.3 `app/(tabs)/contacts.tsx`

#### 3.3.1 群組子標籤整合

新增第二個子標籤「群組」，tab 順序：

| 位置 | 標籤 | 原頁面 |
|------|------|--------|
| 1 | 聯絡人 | contacts.tsx（原有） |
| 2 | 群組 | groups.tsx 功能搬移 |
| 3 | 區域搜索 | 原「Lobby」更名 |
| 4 | 封鎖 | contacts.tsx（原有） |

Header 按鈕根據 tab 動態切換：
- **群組 tab**：左側顯示「加入」「＋新建」，右側顯示「↻刷新」
- **其他 tab**：只顯示「↻刷新」

#### 3.3.2 欄位互動重新設計

**變更前**：點擊欄位彈出設定 Modal
**變更後**：

| 操作 | 行為 |
|------|------|
| 點擊欄位 | 導航至聊天頁（index），自動選取對應 peer 或群組 |
| 點擊右側 `⋯` 按鈕 | 開啟原本的設定 Modal |

導航方式使用 `router.navigate({ pathname: '/(tabs)', params: { dest_hash } })`，index 頁透過 `useLocalSearchParams` 接收並呼叫 `selectPeer` / `selectGroup`。

受影響的元件：`ContactRow`、`LobbyRow`、`BlockRow`、`GroupRow`

#### 3.3.3 聯絡人在線燈號修正

`/getContactList` API 不回傳 `online` 欄位，`ContactRow` 現在透過比對 `lobbyPeers`（已在 state）取得即時在線狀態：

```tsx
const isOnline = item.online ?? lobbyPeers.find(p => p.dest_hash === item.dest_hash)?.online;
```

#### 3.3.4 Modal 位置修正

所有 Modal 的 `modalSheet` 設有 `paddingBottom: 28`，防止被手機底部系統 UI 遮擋。

---

### 3.4 `app/(tabs)/groups.tsx`

移除四個 Modal 元件定義（`CreateGroupModal`、`JoinGroupModal`、`GroupDetailModal`、`AddMembersModal`），改從 `../../components/GroupModals` import。

功能邏輯與 API 呼叫維持不變，僅重構元件結構。

---

### 3.5 `app/(tabs)/index.tsx`

#### 3.5.1 Header 下拉選單移除

移除原本位於聊天頁頂部的「節點下拉」與「群組下拉」選單（共 ~130 行 JSX）。
相關 state 同步清除：`peerDropOpen`、`groupDropOpen`。

#### 3.5.2 動態 Navigation Title

透過 `<Tabs.Screen options={{ headerTitle: ... }} />` 動態覆蓋導覽列標題：

| chatMode | title 顯示 |
|----------|-----------|
| `null` | `SNS對話`（無燈號） |
| `'peer'` — 在線 | `● Alice`（綠點） |
| `'peer'` — 離線 | `● Alice`（灰點） |
| `'group'` | `■ MyGroup`（藍方形） |

#### 3.5.3 群組成員選單（headerRight）

群組對話開啟時，右上角出現 `people` 圖示按鈕。點擊後彈出絕對定位的下拉選單，列出群組所有成員與在線狀態：

- 成員資料來源：`currentGroup.members`（`GroupMember[]`）
- 在線狀態：比對 `lobbyPeers` 取得，綠點 = 在線，灰點 = 離線
- 點擊選單外側自動關閉
- 離開群組模式時自動關閉

#### 3.5.4 跨 Tab 導航接收

```tsx
const { dest_hash: navDestHash, group_name: navGroupName } =
  useLocalSearchParams<{ dest_hash?: string; group_name?: string }>();

useEffect(() => {
  if (!navDestHash) return;
  selectPeer(String(navDestHash));
  router.setParams({ dest_hash: '' });
}, [navDestHash, selectPeer]);
```

接收來自 contacts.tsx 的導航參數，呼叫後立即清除 params 防止重複觸發。

---

## 四、導航流程圖

```
CONTACTS tab
  └── 聯絡人欄位點擊 ──────────────► CHAT tab（selectPeer）
  └── 群組欄位點擊  ──────────────► CHAT tab（selectGroup）
  └── ⋯ 按鈕      ──────────────► Modal（設定）

CHAT tab title
  └── chatMode = null   ► "SNS對話"
  └── chatMode = peer   ► "● {peer 名稱}"
  └── chatMode = group  ► "■ {群組名稱}" + [people] 按鈕
```

---

## 五、移除的元件 / 樣式

| 移除項目 | 位置 | 說明 |
|---------|------|------|
| `peerDropOpen` / `groupDropOpen` state | index.tsx | 下拉選單已移除 |
| `peerSubLabel` / `groupSubLabel` | index.tsx | 不再需要副標題 |
| Header `<View style={styles.header}>` | index.tsx | 整個自訂 header 區塊移除 |
| `ScrollView` import | index.tsx | 隨 header 一同移除 |
| `rowChevron`（部分） | contacts.tsx | 改為 `optionBtn` |
| Groups tab 底部圖示 | _layout.tsx | `href: null` 隱藏 |
