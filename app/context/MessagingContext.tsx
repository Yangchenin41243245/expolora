// filepath: app/(tabs)/MessagingContext.tsx
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── 預設值 ────────────────────────────────────────────
export const DEFAULT_HOST = '10.165.0.78';
export const DEFAULT_PORT = 5000;
const LOBBY_POLL_MS = 5000;

// ── 型別 ──────────────────────────────────────────────
export type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  online?: boolean;
};

type MessagingCtx = {
  host: string;
  port: number;
  setHost: (h: string) => void;
  setPort: (p: number) => void;
  firstPeer: LobbyPeer | null;
  lobbyPeers: LobbyPeer[];
  baseUrl: string;
};

// ── Context ───────────────────────────────────────────
const MessagingContext = createContext<MessagingCtx>({
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  setHost: () => {},
  setPort: () => {},
  firstPeer: null,
  lobbyPeers: [],
  baseUrl: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
});

export const useMessaging = () => useContext(MessagingContext);

// ── Provider ──────────────────────────────────────────
export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [host, setHostState] = useState(DEFAULT_HOST);
  const [port, setPortState] = useState(DEFAULT_PORT);
  const [lobbyPeers, setLobbyPeers] = useState<LobbyPeer[]>([]);

  // 從 AsyncStorage 讀取已儲存的 host / port
  useEffect(() => {
    (async () => {
      try {
        const [savedHost, savedPort] = await Promise.all([
          AsyncStorage.getItem('saved_host'),
          AsyncStorage.getItem('saved_port'),
        ]);
        if (savedHost) setHostState(savedHost);
        if (savedPort) setPortState(Number(savedPort));
      } catch { /* ignore */ }
    })();
  }, []);

  // ref 供 interval callback 讀最新值，不需重建 interval
  const hostRef = useRef(host);
  const portRef = useRef(port);
  useEffect(() => { hostRef.current = host; }, [host]);
  useEffect(() => { portRef.current = port; }, [port]);

  const setHost = useCallback((h: string) => setHostState(h.trim()), []);
  const setPort = useCallback((p: number) => setPortState(p), []);

  const fetchLobby = useCallback(async () => {
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/getLobby`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return;
      const json = await res.json();
      const peers: LobbyPeer[] = json?.data?.lobby ?? [];
      setLobbyPeers(peers);
    } catch {
      // 靜默失敗；Screen3 自己的錯誤提示仍正常顯示
    }
  }, []);

  // 啟動時立即抓一次，之後每 5 秒輪詢
  useEffect(() => {
    fetchLobby();
    const t = setInterval(fetchLobby, LOBBY_POLL_MS);
    return () => clearInterval(t);
  }, [fetchLobby]);

  const baseUrl = `http://${host}:${port}`;
  const firstPeer = lobbyPeers[0] ?? null;

  return (
    <MessagingContext.Provider
      value={{ host, port, setHost, setPort, firstPeer, lobbyPeers, baseUrl }}
    >
      {children}
    </MessagingContext.Provider>
  );
};