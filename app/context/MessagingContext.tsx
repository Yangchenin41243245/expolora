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
import { checkAndSyncSystemTime } from '../../utils/systemTime';

// ── 預設值 ────────────────────────────────────────────
export const DEFAULT_HOST = 'rns-chat.local';
export const DEFAULT_PORT = 5000;
const LOBBY_POLL_MS  = 5000;
const GROUPS_POLL_MS = 10000;
const STARTUP_TIME_SYNC_RETRY_MS = 5000;
const STARTUP_TIME_SYNC_MAX_ATTEMPTS = 5;

// AsyncStorage keys
const STORAGE_KEY_HOST   = 'saved_host';
const STORAGE_KEY_PORT   = 'saved_port';
const STORAGE_KEY_GROUPS = 'known_group_names'; // string[] — 已知群組名稱清單

// ── 型別 ──────────────────────────────────────────────

export type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  nickname?: string;
  is_saved_contact?: boolean;
  online?: boolean;
};

export type GroupMember = {
  dest_hash: string;
  display_name?: string;
};

export type GroupRoom = {
  group_name: string;
  group_id?: string;
  self_name?: string;
  join_confirm?: boolean;
  members?: GroupMember[];
};

// getGroupChat 完整回應裡的訊息型別
export type GroupMessage = {
  message_id: string;
  message_type: 'GROUP' | 'GROUP_INVITE' | 'GROUP_SYSTEM' | 'GROUP_JOIN';
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

  // 本機節點身份
  localDestHash: string | null;

  // Lobby
  firstPeer: LobbyPeer | null;
  lobbyPeers: LobbyPeer[];

  // 群組
  groupRooms: GroupRoom[];
  groupsLoading: boolean;
  /** 從後端重新抓取所有已知群組的最新狀態 */
  refreshGroups: () => Promise<void>;
  /**
   * 將一個群組房間直接寫入本地狀態。建立群組或收到邀請後呼叫，傳入後端回傳的完整 GroupRoom（含 group_id）。
   */
  registerGroup: (room: GroupRoom) => Promise<void>;
  /**
   * 離開群組：呼叫後端 /leaveGroup 並從本地狀態移除。
   */
  unregisterGroup: (group_id: string) => Promise<void>;
};

// ── Context 預設值 ─────────────────────────────────────

const MessagingContext = createContext<MessagingCtx>({
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  baseUrl: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
  setHost: () => {},
  setPort: () => {},
  localDestHash: null,
  firstPeer: null,
  lobbyPeers: [],
  groupRooms: [],
  groupsLoading: false,
  refreshGroups: async () => {},
  registerGroup: async (_room) => {},
  unregisterGroup: async (_group_id) => {},
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
  const [localDestHash, setLocalDestHash] = useState<string | null>(null);
  const [connectionSettingsLoaded, setConnectionSettingsLoaded] = useState(false);

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
      finally {
        setConnectionSettingsLoaded(true);
      }
    })();
  }, []);

  // ── 啟動時校正 Raspberry Pi OS 時鐘 ──────────────────

  useEffect(() => {
    if (!connectionSettingsLoaded) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const baseUrl = `http://${host}:${port}`;
    let attempts = 0;

    const run = async () => {
      attempts += 1;
      try {
        await checkAndSyncSystemTime({ baseUrl });
      } catch {
        if (!cancelled && attempts < STARTUP_TIME_SYNC_MAX_ATTEMPTS) {
          retryTimer = setTimeout(run, STARTUP_TIME_SYNC_RETRY_MS);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [connectionSettingsLoaded, host, port]);

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

  // ── 本機身份：host/port 變更時重新抓取，直到取得 hash 為止 ──────────────

  useEffect(() => {
    let cancelled = false;
    setLocalDestHash(null);

    const load = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`http://${host}:${port}/identity`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled) setTimeout(load, 4000);
          return;
        }
        const json = await res.json();
        const hash: string | undefined = json?.destination_in?.hash;
        if (hash) {
          if (!cancelled) setLocalDestHash(hash);
        } else {
          // RNS 節點尚未完成初始化，4 秒後重試
          if (!cancelled) setTimeout(load, 4000);
        }
      } catch {
        // 後端暫時不可達，4 秒後重試
        if (!cancelled) setTimeout(load, 4000);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [host, port]);

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
      // 去重後儲存
      const unique = [...new Set(names)];
      await AsyncStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(unique));
    } catch { /* ignore */ }
  }, []);

  // ── 抓取單一群組房間狀態（需傳入 UUID）────────────────

  const fetchOneGroup = useCallback(
    async (group_id: string): Promise<GroupRoom | null> => {
      if (!group_id) return null;
      try {
        const res = await fetch(
          `http://${hostRef.current}:${portRef.current}/getGroupChat/${encodeURIComponent(group_id)}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) return null;
        const json = await res.json();
        return (json?.data?.group_room as GroupRoom) ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  // ── refreshGroups：依 AsyncStorage 清單逐一抓取 ──────

  // 防止 unregisterGroup 執行中時 refreshGroups 把群組復原
  const pendingRemoveRef = useRef<Set<string>>(new Set());

  const refreshGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/getGroups`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const json = await res.json();
      const rooms: GroupRoom[] = (json?.data?.groups ?? []) as GroupRoom[];
      setGroupRooms(rooms.filter(r => !pendingRemoveRef.current.has(r.group_id ?? '')));
    } finally {
      setGroupsLoading(false);
    }
  }, [saveKnownGroupNames]);

  // ── registerGroup：將後端回傳的 GroupRoom 直接寫入狀態 ──

  const registerGroup = useCallback(
    async (room: GroupRoom) => {
      setGroupRooms(prev => {
        const filtered = prev.filter(
          r => r.group_id !== room.group_id && r.group_name !== room.group_name
        );
        return [...filtered, room];
      });
    },
    []
  );

  // ── unregisterGroup：呼叫後端 /leaveGroup 並移除 ─────

  const unregisterGroup = useCallback(
    async (group_id: string) => {
      pendingRemoveRef.current.add(group_id);
      try {
        try {
          await fetch(
            `http://${hostRef.current}:${portRef.current}/leaveGroup`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ group_id }),
            }
          );
        } catch { /* 靜默失敗，繼續本地移除 */ }
        setGroupRooms(prev => prev.filter(r => r.group_id !== group_id));
      } finally {
        pendingRemoveRef.current.delete(group_id);
      }
    },
    []
  );

  // ── Lobby 輪詢 ───────────────────────────────────────

  const fetchLobby = useCallback(async () => {
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/getLobby`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const json = await res.json();
      const peers: LobbyPeer[] = json?.data?.lobby ?? [];
      // 過濾掉顯示名稱為 "Unknown" 的節點（通常是自己的本地節點）
      setLobbyPeers(peers.filter(p => (p.nickname || p.announced_name) !== 'Unknown'));
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
        localDestHash,
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
