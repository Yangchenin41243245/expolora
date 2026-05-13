# 第三方模組列表

版本資訊來源：`package.json`（expolora v1.0.2）

---

## 核心框架

| 模組 | 版本 | 用途 |
|------|------|------|
| `react` | 19.1.0 | UI 框架基礎 |
| `react-native` | 0.81.5 | 跨平台原生 App 框架 |
| `expo` | ~54.0.33 | React Native 工具鏈與服務平台 |
| `expo-router` | ~6.0.23 | 檔案系統路由（類 Next.js 風格） |
| `typescript` | ~5.9.2 | 靜態型別系統 |

---

## 導航

| 模組 | 版本 | 用途 |
|------|------|------|
| `@react-navigation/native` | ^7.1.33 | React Navigation 核心 |
| `@react-navigation/bottom-tabs` | ^7.15.5 | 底部標籤導航 |
| `@react-navigation/native-stack` | ^7.14.4 | 原生堆疊導航 |
| `@react-navigation/elements` | ^2.6.3 | 導航 UI 元件（`useHeaderHeight`） |
| `react-native-screens` | ~4.16.0 | 原生 screen 容器，提升效能 |
| `react-native-safe-area-context` | ~5.6.0 | 安全區域感知（瀏海、導航列） |

---

## 聊天介面

| 模組 | 版本 | 用途 |
|------|------|------|
| `react-native-gifted-chat` | ^3.3.2 | 完整聊天 UI 元件（訊息列表、輸入列、氣泡） |

**使用的 GiftedChat 元件：**
- `GiftedChat` — 主容器，管理訊息狀態
- `Bubble` — 訊息氣泡（自訂樣式）
- `InputToolbar` — 輸入列（自訂樣式）
- `Send` — 發送按鈕
- `SystemMessage` — 系統訊息（群組加入通知）
- `MessageText` — 文字渲染（有位置時隱藏）

---

## 地圖與定位

| 模組 | 版本 | 用途 |
|------|------|------|
| `@rnmapbox/maps` | ^10.3.0 | Mapbox GL 原生地圖渲染、離線磁磚管理 |
| `expo-location` | ~19.0.8 | 取得裝置 GPS 座標、請求位置權限 |

**Mapbox 設定（`constants/mapbox.ts`）：**
- Token：`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`（環境變數）
- 預設地圖樣式：`mapbox://styles/mapbox/streets-v12`
- 迷你地圖尺寸：220 × 150 px，縮放 14
- 預載範圍：虎尾（23.706375°N, 120.430419°E），半徑 2 km，縮放 12–16

---

## 儲存與持久化

| 模組 | 版本 | 用途 |
|------|------|------|
| `@react-native-async-storage/async-storage` | 2.2.0 | 本地鍵值儲存（host、port、群組清單） |

---

## 動畫與手勢

| 模組 | 版本 | 用途 |
|------|------|------|
| `react-native-reanimated` | ~4.1.1 | 高效能動畫（JS Thread 外執行） |
| `react-native-gesture-handler` | ~2.28.0 | 手勢識別，GiftedChat / 導航依賴 |
| `react-native-worklets` | 0.5.1 | Reanimated 工作執行緒支援 |

---

## UI 元件與樣式

| 模組 | 版本 | 用途 |
|------|------|------|
| `@expo/vector-icons` | ^15.0.3 | 圖示集（Ionicons 等），聊天按鈕、標籤圖示 |
| `expo-symbols` | ~1.0.8 | iOS SF Symbols 支援 |
| `expo-image` | ~3.0.11 | 高效能圖片載入（記憶體快取） |
| `expo-haptics` | ~15.0.8 | 觸覺反饋（標籤切換） |
| `react-native-element-dropdown` | ^2.12.4 | 下拉選單元件 |
| `react-native-keyboard-controller` | 1.18.5 | 鍵盤避讓控制（聊天輸入列不被遮擋） |

---

## Web 與多平台

| 模組 | 版本 | 用途 |
|------|------|------|
| `react-native-web` | ~0.21.0 | React Native 元件 Web 渲染層 |
| `react-native-webview` | 13.15.0 | WebView 元件 |
| `expo-web-browser` | ~15.0.10 | 系統內建瀏覽器開啟外部連結 |

---

## Expo 服務

| 模組 | 版本 | 用途 |
|------|------|------|
| `expo-status-bar` | ~3.0.9 | 狀態列樣式控制 |
| `expo-constants` | ~18.0.13 | 取得 Expo/App 設定常數 |
| `expo-font` | ~14.0.11 | 自訂字體載入 |
| `expo-linking` | ~8.0.11 | Deep link / Universal link 處理 |
| `expo-splash-screen` | ~31.0.13 | 啟動畫面控制（延遲隱藏至資源就緒） |
| `expo-updates` | ~29.0.16 | OTA 更新支援 |
| `expo-build-properties` | ~1.0.10 | 原生建置屬性（cleartext 流量、arm64） |

---

## 開發工具

| 模組 | 版本 | 用途 |
|------|------|------|
| `eslint` | ^9.25.0 | 程式碼風格與品質檢查 |
| `eslint-config-expo` | ~10.0.0 | Expo 官方 ESLint 規則集 |
| `@types/react` | ~19.1.0 | React TypeScript 型別定義 |

---

## EAS Build / CI

| 工具 | 說明 |
|------|------|
| EAS Build | Expo Application Services 雲端建置，projectId: `92896463-d4f8-4f51-9ebb-f63ab6cf2524` |
| GitHub Actions | `.github/workflows/` 中定義 Preview APK 與 Production APK 兩套流程 |

---

## 模組依賴關係

```
react-native-gifted-chat
  └─ react-native-gesture-handler（手勢支援）

@rnmapbox/maps
  └─ expo-location（GPS 座標輸入）
  └─ 環境變數 EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN

expo-router
  └─ @react-navigation/native（底層導航）
  └─ react-native-screens（原生 screen）
  └─ react-native-safe-area-context（安全區域）

MessagingContext
  └─ @react-native-async-storage/async-storage（設定持久化）
  └─ fetch API（HTTP 輪詢）
```
