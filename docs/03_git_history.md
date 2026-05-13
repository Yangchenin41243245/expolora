# Git 更新歷史

分支說明：
- `main`：穩定版本
- `dev_0512`：2026-05-12 開始的主要開發分支（當前分支）
- `fortest_donotmerge`：實驗性功能測試分支（已合併至 main）

---

## 2026-05-13　dev_0512 分支

| Hash | 說明 |
|------|------|
| `79cdd9f` | refactor: refreshGroups 改用 GET /getGroups，刪除舊備份 txt 檔 |

---

## 2026-05-12　dev_0512 分支

| Hash | 說明 |
|------|------|
| `56b6b00` | feat: Location Message 位置資訊解析功能（withLocationPayload、renderMessageText 對齊 main） |
| `1119c1b` | feat: 加回位置資訊解析功能至訊息轉換（LOCATION_MESSAGE_RE） |
| `4b8f356` | feat: 過濾 contacts.tsx 的 Unknown lobbyPeers |
| `eb91ce5` | feat: 過濾 MessagingContext lobbyPeers 中的 Unknown 節點 |
| `dae175e` | feat: 新增群組封包檢測（isGroupPacket），過濾 P2P 聊天中的群組訊息 |
| `00bbda8` | fix: 修正 refreshGroups 誤刪 AsyncStorage 群組記錄的 bug（移除過激的 pruning 邏輯） |
| `d43514e` | refactor: 刪除不必要的 web stub 檔案，恢復原生 Mapbox |
| `74ffcd8` | feat: 新增 web 版 LocationMessageBubble 與 location.web.ts |
| `53be3ec` | feat: 重構群組創建邏輯，增加錯誤處理，刪除 web stub |
| `390a608` | fix: 訊息發送加入 404 fallback（/msgContact → /msgDirect） |
| `a3e7c80` | fix: 修正 P2P 訊息顯示問題，調整訊息狀態判斷邏輯 |
| `e32e9cd` | feat(web): 加入 Mapbox platform stubs 供 web 測試 |
| `8cf96d8` | feat: 實作含位置分享的聊天畫面與群組功能 |
| `50b2138` | ci: 觸發 Build Preview Android APK |
| `3c9e0de` | fix: 修正 API 欄位名稱（custom_nickname → nickname）及 P2P 端點（/messages → /getChat）※ 此 commit 誤刪位置解析邏輯 |
| `ad6975a` | feat: 增加 web 平台支援，避免執行離線地圖相關功能 |
| `67e1940` | feat: 新增 hostReady 狀態，確保 AsyncStorage 讀取完成後才啟動 |
| `4c9d90e` | feat: 統一 custom_nickname 欄位名稱為 nickname |
| `41ece43` | feat: 更新 README，新增後端版本對應資訊 |

---

## 2026-05-11　dev_0512 / fortest_donotmerge 分支

| Hash | 說明 |
|------|------|
| `6026d5b` | feat: 修復 nickname 顯示、新增自身節點過濾、補充後端雙向通訊說明 |
| `8ce3010` | feat: README 新增下載 APK 說明 |
| `1f6dd07` | feat: 重新改為下載固定地圖 |
| `8df7ba2` | feat: 更新聊天功能，nickname 欄位修正，新增位置分享 |
| `b77dbc2` | feat: 新增 web 端位置功能 stub |
| `8ff5ade` | feat: 更新 APK 建構流程，新增離線地圖下載與版本號更新 |
| `47404ae` | fix: LobbyPeer 型別改用 nickname |
| `ec3dfb1` | 新增自我節點 Hash 處理，過濾群組和聯絡人列表以排除自身節點 |

---

## 2026-05-10　jongcs/dev/location 分支合併

| Hash | 說明 |
|------|------|
| `bb5c59a` | Merge pull request #11 from jongcs/dev/location |
| `2919f6c` | feat: 應用啟動時預載離線地圖並顯示通知 |
| `45c6d30` | docs: 新增完整 Expolora 專案文件 |
| `4cf90b0` | fix: 修正接收到的位置訊息渲染問題 |

---

## 2026-04-17 ~ 04-16

| Hash | 說明 |
|------|------|
| `1f0604d` | 更新 README，新增 APK 下載連結 |
| `4e4b40a` | 更新 README，新增硬體驗證說明 |
| `26aa292` | 更新 README，移除 Expo project 說明 |
| `75b407b` | 更新 README，加入後端連結 |
| `d7517a0` | 當前進度快照 |

---

## 2026-04-12

| Hash | 說明 |
|------|------|
| `f6a133a` | chore: 更新 workflow 名稱，區分 preview / production APK |
| `d10c2ec` | fix: 修正鍵盤遮擋聊天輸入框的問題（跨裝置） |
| `b586c57` | fix: 修正聊天鍵盤重疊問題，Header 遷移至原生 Tabs，版本升至 1.0.2 |
| `1f54ac1` | fix(chat): 修正輸入文字不可見的問題 |
| `61a05b3` | 新增 web 端測試用文字對應檔案 |

---

## 2026-04-09

| Hash | 說明 |
|------|------|
| `c9ee27e` | feat: 整合 Mapbox 與 expo-location，支援位置訊息與離線磁磚快取 |
| `b62e2fc` | 更新群組對話功能 |

---

## 2026-04-08 ~ 04-07

| Hash | 說明 |
|------|------|
| `8739ccd` | fix: 修正 index.tsx 錯誤 |
| `eb76d1b` | 更新 Expo Router 設定 |
| `1d5dd7a` / `c919cd5` | 更新 Screen 名稱 |

---

## 2026-03-30

| Hash | 說明 |
|------|------|
| `c04e498` | fix: 鍵盤不再遮蓋聊天輸入列 |
| `fb9c6b8` | 移除重複依賴項，修正 JSX 跳脫字元（PR #5） |

---

## 2026-03-29 ~ 03-25

| Hash | 說明 |
|------|------|
| `52f5866` | 更新 Expo Router 功能 |
| `c507b5d` | Merge PR #3 from jongcs/dev-persistent-ip |
| `17a8722` | feat: 實作 host / port 設定跨重啟持久化（AsyncStorage） |

---

## 2026-03-24 ~ 03-10

| Hash | 說明 |
|------|------|
| `a0caab6` | Merge PR #2 |
| `ed63302` | 更新專案 |
| `219b50a` | 更新 Screen 3 測試按鈕 |
| `bace7b4` | 更新 Screen 3 |
| `820acd3` | Merge PR #1 |
| `a19ef56` | 新增功能 |
| `78d2f14` | Initial commit |
| `4c5bba9` | Initial commit |

---

## 重要里程碑

| 日期 | 事件 |
|------|------|
| 2026-03-10 | 專案初始化 |
| 2026-03-25 | Host/Port 持久化（AsyncStorage） |
| 2026-04-09 | Mapbox 整合、位置分享功能上線 |
| 2026-04-12 | v1.0.2，修正鍵盤遮擋問題，EAS CI 建置 |
| 2026-05-10 | 離線地圖預載功能（startup preload） |
| 2026-05-11 | 自身節點過濾，nickname 欄位統一 |
| 2026-05-12 | dev_0512：群組功能完整化，位置訊息解析修復，P2P 端點遷移 |
| 2026-05-13 | `79cdd9f` refreshGroups 改用 /getGroups，解決重裝後群組消失 |
