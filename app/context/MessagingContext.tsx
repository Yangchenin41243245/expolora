// filepath: app/context/MessagingContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

// ── 預設值 ────────────────────────────────────────────
export const DEFAULT_HOST = 'rns-chat.local';
export const DEFAULT_PORT = 5000;
const LOBBY_POLL_MS  = 5000;
const GROUPS_POLL_MS = 10000;

// AsyncStorage keys
const STORAGE_KEY_HOST            = 'saved_host';
const STORAGE_KEY_PORT            = 'saved_port';
const STORAGE_KEY_GROUPS          = 'known_group_names';    // string[] — 已知群組名稱清單
const STORAGE_KEY_EXCLUDED_GROUPS = 'excluded_group_names'; // string[] — 永久排除（本地刪除）清單

// ── 型別 ──────────────────────────────────────────────

export type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  custom_nickname?: string;
  is_saved_contact?: boolean;
  online?: boolean;
};

export type GroupMember = {
  dest_hash: string;
  display_name?: string;
};

export type GroupRoom = {
  group_name: string;
  self_name?: string;
  join_confirm?: boolean;
  members?: GroupMember[];
};

// getGroupChat 完整回應裡的訊息型別
export type GroupMessage = {
  message_id: string;
  message_type: 'GROUP' | 'GROUP_INVITE' | 'GROUP_SYSTEM';
  content?: string;
  from_hash?: string;
  from_name?: string;
  group_name?: string;
  status?: string;
  timestamp?: number;
  to_hash?: string;
};

type MessagingCtx = {
  // 連線設定
  host: string;
  port: number;
  baseUrl: string;
  setHost: (h: string) => void;
  setPort: (p: number) => void;

  // 自身節點
  selfDestHash: string | null;

  // Lobby
  firstPeer: LobbyPeer | null;
  lobbyPeers: LobbyPeer[];

  // 群組
  groupRooms: GroupRoom[];
  groupsLoading: boolean;
  /** 從後端重新抓取所有已知群組的最新狀態 */
  refreshGroups: () => Promise<void>;
  /**
   * 將一個新的 group_name 加入本地已知清單，並立即抓取該房間狀態。
   * 建立群組或收到邀請後呼叫。
   */
  registerGroup: (group_name: string) => Promise<void>;
  /**
   * 從本地已知清單中移除一個群組。
   * 目前後端沒有 leaveGroup，此操作僅為本地清單維護。
   */
  unregisterGroup: (group_name: string) => Promise<void>;
};

// ── Context 預設值 ─────────────────────────────────────

const MessagingContext = createContext<MessagingCtx>({
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  baseUrl: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
  setHost: () => {},
  setPort: () => {},
  selfDestHash: null,
  firstPeer: null,
  lobbyPeers: [],
  groupRooms: [],
  groupsLoading: false,
  refreshGroups: async () => {},
  registerGroup: async () => {},
  unregisterGroup: async () => {},
});

export const useMessaging = () => useContext(MessagingContext);

// ── Provider ──────────────────────────────────────────

export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [host, setHostState] = useState(DEFAULT_HOST);
  const [port, setPortState] = useState(DEFAULT_PORT);
  const [lobbyPeers, setLobbyPeers]   = useState<LobbyPeer[]>([]);
  const [groupRooms, setGroupRooms]   = useState<GroupRoom[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selfDestHash, setSelfDestHash] = useState<string | null>(null);

  // ref 供 interval callback 讀最新值，不需重建 interval
  const hostRef = useRef(host);
  const portRef = useRef(port);
  useEffect(() => { hostRef.current = host; }, [host]);
  useEffect(() => { portRef.current = port; }, [port]);

  // ── 初始化：從 AsyncStorage 讀取設定 ────────────────

  useEffect(() => {
    (async () => {
      try {
        const [savedHost, savedPort] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_HOST),
          AsyncStorage.getItem(STORAGE_KEY_PORT),
        ]);
        if (savedHost) setHostState(savedHost);
        if (savedPort) setPortState(Number(savedPort));
      } catch { /* ignore */ }
    })();
  }, []);

  // ── setHost / setPort（外部呼叫，同步寫 AsyncStorage）──

  const setHost = useCallback((h: string) => {
    const trimmed = h.trim();
    setHostState(trimmed);
    AsyncStorage.setItem(STORAGE_KEY_HOST, trimmed).catch(() => {});
  }, []);

  const setPort = useCallback((p: number) => {
    setPortState(p);
    AsyncStorage.setItem(STORAGE_KEY_PORT, String(p)).catch(() => {});
  }, []);

  // ── 讀取已知群組名稱清單 ─────────────────────────────

  const loadKnownGroupNames = useCallback(async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_GROUPS);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }, []);

  const saveKnownGroupNames = useCallback(async (names: string[]): Promise<void> => {
    try {
      const unique = [...new Set(names)];
      await AsyncStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(unique));
    } catch { /* ignore */ }
  }, []);

  const loadExcludedGroupNames = useCallback(async (): Promise<Set<string>> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_EXCLUDED_GROUPS);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }, []);

  const addExcludedGroupName = useCallback(async (name: string): Promise<void> => {
    try {
      const excluded = await loadExcludedGroupNames();
      excluded.add(name);
      await AsyncStorage.setItem(STORAGE_KEY_EXCLUDED_GROUPS, JSON.stringify([...excluded]));
    } catch { /* ignore */ }
  }, [loadExcludedGroupNames]);

  // ── 抓取單一群組房間狀態 ─────────────────────────────
  //
  // 回傳值語意：
  //   GroupRoom  → 成功取得
  //   null       → 後端明確回傳 404（群組不存在，可從清單移除）
  //   undefined  → 網路錯誤 / 後端暫時無法連線（保留在清單，下次再試）

  const fetchOneGroup = useCallback(
    async (group_name: string): Promise<GroupRoom | null | undefined> => {
      try {
        const res = await fetch(
          `http://${hostRef.current}:${portRef.current}/getGroupChat/${group_name}`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.status === 404) return null;   // 群組確實不存在
        if (!res.ok) return undefined;         // 其他 HTTP 錯誤，保守保留
        const json = await res.json();
        return (json?.data?.group_room as GroupRoom) ?? null;
      } catch {
        return undefined;                      // 網路錯誤，保留群組
      }
    },
    []
  );

  // ── fetchAllGroupsFromBackend：從後端取得所有已知群組名稱 ──

  const fetchAllGroupsFromBackend = useCallback(async (): Promise<string[]> => {
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/getGroups`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return [];
      const json = await res.json();
      const groups: GroupRoom[] = json?.data?.groups ?? [];
      return groups.map(g => g.group_name).filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  // ── refreshGroups：合併後端清單 + AsyncStorage 清單後逐一抓取 ──

  // 防止 unregisterGroup 執行中時 refreshGroups 把群組復原
  const pendingRemoveRef = useRef<Set<string>>(new Set());

  const refreshGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      // Step 1：從後端取得所有已知群組名稱（/getGroups），合併到 AsyncStorage
      const [backendNames, localNames, excluded] = await Promise.all([
        fetchAllGroupsFromBackend(),
        loadKnownGroupNames(),
        loadExcludedGroupNames(),
      ]);
      const merged = [...new Set([...localNames, ...backendNames])].filter(
        n => !pendingRemoveRef.current.has(n) && !excluded.has(n)
      );
      if (merged.length !== localNames.length) {
        await saveKnownGroupNames(merged);
      }

      if (merged.length === 0) {
        setGroupRooms([]);
        return;
      }

      // Step 2：逐一抓取詳細狀態
      const results = await Promise.all(merged.map(fetchOneGroup));

      // null  → 後端確認 404，從清單移除
      // undefined → 網路錯誤，保留清單但不顯示
      const valid         = results.filter((r): r is GroupRoom => r != null);
      const survivingNames = merged.filter((_, i) => results[i] !== null); // 保留 undefined（網路錯誤）
      if (survivingNames.length !== merged.length) {
        await saveKnownGroupNames(survivingNames);
      }
      setGroupRooms(valid);
    } finally {
      setGroupsLoading(false);
    }
  }, [loadKnownGroupNames, fetchOneGroup, fetchAllGroupsFromBackend, saveKnownGroupNames, loadExcludedGroupNames]);

  // ── registerGroup：新增群組到已知清單並立即載入 ──────

  const registerGroup = useCallback(
    async (group_name: string) => {
      // 從排除清單移除（允許重新加入之前刪除的群組）
      try {
        const excluded = await loadExcludedGroupNames();
        if (excluded.has(group_name)) {
          excluded.delete(group_name);
          await AsyncStorage.setItem(STORAGE_KEY_EXCLUDED_GROUPS, JSON.stringify([...excluded]));
        }
      } catch { /* ignore */ }

      const names = await loadKnownGroupNames();
      if (!names.includes(group_name)) {
        await saveKnownGroupNames([...names, group_name]);
      }
      const room = await fetchOneGroup(group_name);
      if (room != null) {
        setGroupRooms(prev => {
          const others = prev.filter(r => r.group_name !== group_name);
          return [...others, room];
        });
      }
    },
    [loadKnownGroupNames, saveKnownGroupNames, fetchOneGroup, loadExcludedGroupNames]
  );

  // ── unregisterGroup：從已知清單移除 ─────────────────

  const unregisterGroup = useCallback(
    async (group_name: string) => {
      pendingRemoveRef.current.add(group_name);
      try {
        await Promise.all([
          addExcludedGroupName(group_name),
          loadKnownGroupNames().then(names =>
            saveKnownGroupNames(names.filter(n => n !== group_name))
          ),
        ]);
        setGroupRooms(prev => prev.filter(r => r.group_name !== group_name));
      } finally {
        pendingRemoveRef.current.delete(group_name);
      }
    },
    [loadKnownGroupNames, saveKnownGroupNames, addExcludedGroupName]
  );

  // ── 取得自身節點 hash（只在連線設定變更時抓一次）───────

  const fetchIdentity = useCallback(async () => {
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/identity`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const json = await res.json();
      const hash: string | undefined =
        json?.data?.destination_in?.hash ?? json?.destination_in?.hash;
      if (hash) setSelfDestHash(hash);
    } catch { /* 靜默失敗 */ }
  }, []);

  useEffect(() => {
    fetchIdentity();
  }, [fetchIdentity, host, port]);

  // ── Lobby 輪詢 ───────────────────────────────────────

  const fetchLobby = useCallback(async () => {
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/getLobby`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const json = await res.json();
      setLobbyPeers(json?.data?.lobby ?? []);
    } catch { /* 靜默失敗 */ }
  }, []);

  useEffect(() => {
    fetchLobby();
    const t = setInterval(fetchLobby, LOBBY_POLL_MS);
    return () => clearInterval(t);
  }, [fetchLobby]);

  // ── 群組輪詢（頻率比 Lobby 低）──────────────────────

  useEffect(() => {
    refreshGroups(); // 啟動時立即抓一次
    const t = setInterval(refreshGroups, GROUPS_POLL_MS);
    return () => clearInterval(t);
  }, [refreshGroups]);

  // ── 計算值 ───────────────────────────────────────────

  const baseUrl  = `http://${host}:${port}`;
  const firstPeer = lobbyPeers[0] ?? null;

  return (
    <MessagingContext.Provider
      value={{
        host,
        port,
        baseUrl,
        setHost,
        setPort,
        selfDestHash,
        firstPeer,
        lobbyPeers,
        groupRooms,
        groupsLoading,
        refreshGroups,
        registerGroup,
        unregisterGroup,
      }}
    >
      {children}
    </MessagingContext.Provider>
  );
};