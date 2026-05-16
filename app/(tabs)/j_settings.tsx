// filepath: app/(tabs)/j_settings.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMessaging } from '../context/MessagingContext';

// ── 設定區 ──────────────────────────────────────────────
const POLL_INTERVAL_MS = 5000;
const TEST_MESSAGE = 'hello from mobile test';
const TEST_IS_SAVED = false;
// ────────────────────────────────────────────────────────

const ENDPOINT_GROUPS = {
  診斷: ['/status', '/identity', '/messages'],
  聯絡人: ['/getContactList', '/getBlocklist'],
  Lobby: ['/getLobby'],
} as const;

type Group = keyof typeof ENDPOINT_GROUPS;
type Endpoint = (typeof ENDPOINT_GROUPS)[Group][number];

const ALL_ENDPOINTS: Endpoint[] = Object.values(ENDPOINT_GROUPS).flat() as Endpoint[];

type FetchState = { data: unknown; loading: boolean; error: string | null; lastUpdated: Date | null };
type SendState = { loading: boolean; result: unknown; error: string | null };

const initState = (): FetchState => ({ data: null, loading: false, error: null, lastUpdated: null });
const initSendState = (): SendState => ({ loading: false, result: null, error: null });

type GroupDebugState = {
  groupName: string;
  data: unknown;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
};
const initGroupDebug = (): GroupDebugState => ({
  groupName: '', data: null, loading: false, error: null, lastUpdated: null,
});

const j_settings: React.FC = () => {
  // ── 從 Context 讀取共享的 host/port ──────────────────
  const { host, port, setHost, setPort, firstPeer } = useMessaging();

  // 本地編輯暫存，套用前不影響 Context
  const [editingHost, setEditingHost] = useState(host);
  const [editingPort, setEditingPort] = useState(String(port));

  // 用 ref 讓 fetchEndpoint 的 callback 不因 host/port 變化重建
  const hostRef = useRef(host);
  const portRef = useRef(port);
  useEffect(() => { hostRef.current = host; }, [host]);
  useEffect(() => { portRef.current = port; }, [port]);

  const [activeGroup, setActiveGroup] = useState<Group>('診斷');
  const [activeEndpoint, setActiveEndpoint] = useState<Endpoint>('/status');
  const [states, setStates] = useState<Record<Endpoint, FetchState>>(
    () => Object.fromEntries(ALL_ENDPOINTS.map(ep => [ep, initState()])) as Record<Endpoint, FetchState>
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sendState, setSendState] = useState<SendState>(initSendState());
  const [groupDebug, setGroupDebug] = useState<GroupDebugState>(initGroupDebug());
  const [activeTopTab, setActiveTopTab] = useState<'endpoint' | 'group'>('endpoint');

  const fetchGroupDebug = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGroupDebug(prev => ({ ...prev, loading: true, error: null, data: null }));
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}/getGroupChat/${encodeURIComponent(trimmed)}`,
        { headers: { Accept: 'application/json' } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error_message ?? ''}`);
      setGroupDebug(prev => ({
        ...prev, loading: false, error: null, data: json, lastUpdated: new Date(),
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setGroupDebug(prev => ({ ...prev, loading: false, error: msg, data: null }));
    }
  }, []);

  const fetchEndpoint = useCallback(async (endpoint: Endpoint) => {
    setStates(prev => ({ ...prev, [endpoint]: { ...prev[endpoint], loading: true, error: null } }));
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}${endpoint}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStates(prev => ({
        ...prev,
        [endpoint]: { data: json, loading: false, error: null, lastUpdated: new Date() },
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStates(prev => ({ ...prev, [endpoint]: { ...prev[endpoint], loading: false, error: msg } }));
    }
  }, []);

  const fetchAll = useCallback(() => {
    ALL_ENDPOINTS.forEach(ep => fetchEndpoint(ep));
  }, [fetchEndpoint]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) timerRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchAll]);

  // ── 套用 host/port 並更新 Context ────────────────────
  const applySettings = () => {
    const trimmedHost = editingHost.trim();
    const parsed = parseInt(editingPort.trim(), 10);
    const validPort = !isNaN(parsed) && parsed > 0 && parsed <= 65535 ? parsed : port;
    AsyncStorage.setItem('saved_host', trimmedHost);
    AsyncStorage.setItem('saved_port', String(validPort));
    setHost(trimmedHost);
    setPort(validPort);
    ALL_ENDPOINTS.forEach(ep => fetchEndpoint(ep));
  };

  const handleGroupChange = (group: Group) => {
    setActiveGroup(group);
    setActiveEndpoint(ENDPOINT_GROUPS[group][0]);
  };

  // ── 傳送測試訊息 ──────────────────────────────────────
  const firstPeerHash = firstPeer?.dest_hash ?? null;

  const handleSendTest = async () => {
    if (!firstPeerHash) {
      setSendState({ loading: false, result: null, error: 'Lobby 中沒有可用節點' });
      return;
    }
    setSendState({ loading: true, result: null, error: null });
    const endpoint = TEST_IS_SAVED ? '/msgContact' : '/msgDirect';
    try {
      const res = await fetch(
        `http://${hostRef.current}:${portRef.current}${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ dest_hash: firstPeerHash, message: TEST_MESSAGE }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setSendState({ loading: false, result: null, error: `HTTP ${res.status}: ${JSON.stringify(json)}` });
      } else {
        setSendState({ loading: false, result: json, error: null });
      }
    } catch (e: unknown) {
      setSendState({ loading: false, result: null, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const current = states[activeEndpoint];

  return (
    <View style={styles.container}>

      {/* ── 傳送測試訊息列 ── */}
      <View style={styles.testSendRow}>
        <View style={styles.testSendInfo}>
          <Text style={styles.testSendLabel}>測試傳送</Text>
          <Text style={styles.testSendMeta} numberOfLines={1}>
            {firstPeerHash
              ? `${TEST_IS_SAVED ? 'msgContact' : 'msgDirect'} → ${firstPeerHash.slice(0, 12)}…`
              : 'Lobby 尚無節點'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.testSendBtn, (!firstPeerHash || sendState.loading) && styles.testSendBtnDisabled]}
          onPress={handleSendTest}
          disabled={!firstPeerHash || sendState.loading}
        >
          {sendState.loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.testSendBtnText}>📤 送出測試</Text>
          }
        </TouchableOpacity>
      </View>

      {/* 傳送結果 */}
      {(sendState.result !== null || sendState.error !== null) && (
        <View style={[styles.sendResultBar, sendState.error ? styles.sendResultError : styles.sendResultSuccess]}>
          <Text style={styles.sendResultText} numberOfLines={2}>
            {sendState.error
              ? `⚠ ${sendState.error}`
              : `✓ ${JSON.stringify((sendState.result as any)?.actions ?? 'sent')}`
            }
          </Text>
          <TouchableOpacity onPress={() => setSendState(initSendState())}>
            <Text style={styles.sendResultClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── 頂部模式切換 ── */}
      <View style={styles.topTabRow}>
        <TouchableOpacity
          style={[styles.topTab, activeTopTab === 'endpoint' && styles.topTabActive]}
          onPress={() => setActiveTopTab('endpoint')}
        >
          <Text style={[styles.topTabText, activeTopTab === 'endpoint' && styles.topTabTextActive]}>
            端點診斷
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTab, activeTopTab === 'group' && styles.topTabActive]}
          onPress={() => setActiveTopTab('group')}
        >
          <Text style={[styles.topTabText, activeTopTab === 'group' && styles.topTabTextActive]}>
            群組 Debug
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Host 設定列 ── */}
      <View style={styles.hostRow}>
        <TextInput
          style={styles.hostInput}
          value={editingHost}
          onChangeText={setEditingHost}
          placeholder="電腦 IP"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          onSubmitEditing={applySettings}
        />
        <TouchableOpacity style={styles.applyBtn} onPress={applySettings}>
          <Text style={styles.applyBtnText}>套用</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, autoRefresh && styles.toggleBtnOn]}
          onPress={() => setAutoRefresh(v => !v)}
        >
          <Text style={styles.toggleBtnText}>{autoRefresh ? '⏸ 暫停' : '▶ 自動'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Port 設定列 ── */}
      <View style={styles.portRow}>
        <Text style={styles.portLabel}>Port</Text>
        <TextInput
          style={styles.portInput}
          value={editingPort}
          onChangeText={setEditingPort}
          placeholder="5000"
          autoCapitalize="none"
          keyboardType="number-pad"
          onSubmitEditing={applySettings}
        />
        <Text style={styles.contextNote}>
          目前: {host}:{port}
        </Text>
      </View>

      {activeTopTab === 'endpoint' && (
        <>
          {/* ── 群組 Tab ── */}
          <View style={styles.groupRow}>
            {(Object.keys(ENDPOINT_GROUPS) as Group[]).map(group => (
              <TouchableOpacity
                key={group}
                style={[styles.groupTab, activeGroup === group && styles.groupTabActive]}
                onPress={() => handleGroupChange(group)}
              >
                <Text style={[styles.groupTabText, activeGroup === group && styles.groupTabTextActive]}>
                  {group}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── 端點 Tab ── */}
          <View style={styles.tabRow}>
            {ENDPOINT_GROUPS[activeGroup].map(ep => (
              <TouchableOpacity
                key={ep}
                style={[styles.tab, activeEndpoint === ep && styles.tabActive]}
                onPress={() => setActiveEndpoint(ep as Endpoint)}
              >
                <Text style={[styles.tabText, activeEndpoint === ep && styles.tabTextActive]}>{ep}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── 狀態列 ── */}
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>
              {current.lastUpdated ? `最後更新：${current.lastUpdated.toLocaleTimeString()}` : '尚未載入'}
            </Text>
            {current.loading && <ActivityIndicator size="small" color="#0B6EFD" />}
            <TouchableOpacity onPress={() => fetchEndpoint(activeEndpoint)}>
              <Text style={styles.refreshBtn}>↻ 刷新</Text>
            </TouchableOpacity>
          </View>

          {/* ── 內容區 ── */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            refreshControl={
              <RefreshControl refreshing={current.loading} onRefresh={() => fetchEndpoint(activeEndpoint)} />
            }
          >
            {current.error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>⚠ 連線失敗</Text>
                <Text style={styles.errorMsg}>{current.error}</Text>
                <Text style={styles.errorHint}>
                  請確認：{'\n'}• 電腦連至手機熱點{'\n'}• 電腦 IP 為 {host}{'\n'}
                  • Flask 執行於 port {port}
                </Text>
              </View>
            ) : current.data == null ? (
              <Text style={styles.emptyText}>載入中…</Text>
            ) : (
              <JsonViewer data={current.data} depth={0} />
            )}
          </ScrollView>
        </>
      )}

      {activeTopTab === 'group' && (
        <GroupDebugPanel
          state={groupDebug}
          onNameChange={name => setGroupDebug(prev => ({ ...prev, groupName: name }))}
          onFetch={() => fetchGroupDebug(groupDebug.groupName)}
        />
      )}
    </View>
  );
};

// ── 遞迴 JSON 顯示 ──────────────────────────────────────
const JsonViewer: React.FC<{ data: unknown; depth: number }> = ({ data, depth }) => {
  const indent = depth * 12;
  if (data === null) return <Text style={[styles.jNull, { marginLeft: indent }]}>null</Text>;
  if (typeof data === 'boolean') return <Text style={[styles.jBool, { marginLeft: indent }]}>{data ? 'true' : 'false'}</Text>;
  if (typeof data === 'number') return <Text style={[styles.jNum, { marginLeft: indent }]}>{data}</Text>;
  if (typeof data === 'string') return <Text style={[styles.jStr, { marginLeft: indent }]}>"{data}"</Text>;
  if (Array.isArray(data)) {
    if (data.length === 0) return <Text style={[styles.jBracket, { marginLeft: indent }]}>[]</Text>;
    return (
      <View style={{ marginLeft: indent }}>
        <Text style={styles.jBracket}>[</Text>
        {data.map((item, i) => (
          <View key={i} style={styles.jRow}>
            <JsonViewer data={item} depth={depth + 1} />
            {i < data.length - 1 && <Text style={styles.jPunct}>,</Text>}
          </View>
        ))}
        <Text style={styles.jBracket}>]</Text>
      </View>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <Text style={[styles.jBracket, { marginLeft: indent }]}>{'{}'}</Text>;
    return (
      <View style={{ marginLeft: indent }}>
        <Text style={styles.jBracket}>{'{'}</Text>
        {entries.map(([k, v], i) => (
          <View key={k} style={styles.jRow}>
            <Text style={styles.jKey}>  {k}: </Text>
            <JsonViewer data={v} depth={depth + 1} />
            {i < entries.length - 1 && <Text style={styles.jPunct}>,</Text>}
          </View>
        ))}
        <Text style={styles.jBracket}>{'}'}</Text>
      </View>
    );
  }
  return <Text style={{ marginLeft: indent }}>{String(data)}</Text>;
};

// ── 群組 Debug 面板 ────────────────────────────────────

type GroupDebugPanelProps = {
  state: GroupDebugState;
  onNameChange: (name: string) => void;
  onFetch: () => void;
};

const GroupDebugPanel: React.FC<GroupDebugPanelProps> = ({ state, onNameChange, onFetch }) => (
  <View style={{ flex: 1 }}>
    {/* 輸入列 */}
    <View style={styles.groupDbInputRow}>
      <TextInput
        style={styles.groupDbInput}
        value={state.groupName}
        onChangeText={onNameChange}
        placeholder="輸入 group_name"
        placeholderTextColor="#999999"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onFetch}
        returnKeyType="search"
      />
      <TouchableOpacity
        style={[styles.groupDbFetchBtn, state.loading && { opacity: 0.5 }]}
        onPress={onFetch}
        disabled={state.loading}
      >
        {state.loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.groupDbFetchText}>查詢</Text>
        }
      </TouchableOpacity>
    </View>

    {/* URL 預覽 */}
    {state.groupName.trim() !== '' && (
      <Text style={styles.groupDbUrlHint}>
        → GET /getGroupChat/{state.groupName.trim()}
      </Text>
    )}

    {/* 狀態列 */}
    <View style={styles.statusBar}>
      <Text style={styles.statusText}>
        {state.lastUpdated
          ? `最後更新：${state.lastUpdated.toLocaleTimeString()}`
          : '尚未查詢'}
      </Text>
      {state.loading && <ActivityIndicator size="small" color="#0B6EFD" />}
    </View>

    {/* 結果區 */}
    <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
      {state.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>⚠ 查詢失敗</Text>
          <Text style={styles.errorMsg}>{state.error}</Text>
        </View>
      ) : state.data == null ? (
        <Text style={styles.emptyText}>輸入群組名稱後按查詢</Text>
      ) : (
        <>
          <GroupDebugSummary data={state.data} />
          <Text style={styles.groupDbSectionTitle}>完整 JSON</Text>
          <JsonViewer data={state.data} depth={0} />
        </>
      )}
    </ScrollView>
  </View>
);

const GroupDebugSummary: React.FC<{ data: unknown }> = ({ data }) => {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const dataObj = d?.data && typeof d.data === 'object'
    ? (d.data as Record<string, unknown>)
    : null;
  const room = dataObj?.group_room as Record<string, unknown> | null ?? null;
  const msgs = Array.isArray(dataObj?.messages)
    ? (dataObj!.messages as Record<string, unknown>[])
    : [];
  const count = dataObj?.count;

  return (
    <View style={styles.groupDbSummaryBox}>
      <Text style={styles.groupDbSectionTitle}>快速摘要</Text>
      <View style={styles.groupDbRow}>
        <Text style={styles.groupDbLabel}>group_name</Text>
        <Text style={styles.groupDbValue}>{String(room?.group_name ?? '—')}</Text>
      </View>
      <View style={styles.groupDbRow}>
        <Text style={styles.groupDbLabel}>self_name</Text>
        <Text style={styles.groupDbValue}>{String(room?.self_name ?? '—')}</Text>
      </View>
      <View style={styles.groupDbRow}>
        <Text style={styles.groupDbLabel}>join_confirm</Text>
        <Text style={[styles.groupDbValue, { color: room?.join_confirm ? '#1A6B3C' : '#C68600' }]}>
          {String(room?.join_confirm ?? '—')}
        </Text>
      </View>
      <View style={styles.groupDbRow}>
        <Text style={styles.groupDbLabel}>訊息數</Text>
        <Text style={styles.groupDbValue}>{String(count ?? msgs.length)}</Text>
      </View>
      {msgs.length > 0 && (
        <>
          <Text style={[styles.groupDbLabel, { marginTop: 10, marginBottom: 4 }]}>最新 3 筆訊息</Text>
          {msgs.slice(-3).map((m, i) => (
            <View key={i} style={styles.groupDbMsgRow}>
              <Text style={styles.groupDbMsgType}>{String(m.message_type ?? '?')}</Text>
              <Text style={styles.groupDbMsgSender}>{String(m.sender_name ?? m.sender ?? '?')}</Text>
              <Text style={styles.groupDbMsgContent} numberOfLines={1}>{String(m.content ?? '')}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
};

// ── 樣式 ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F6' },
  testSendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 8,
  },
  testSendInfo: { flex: 1 },
  testSendLabel: { color: '#666666', fontSize: 12, fontFamily: 'monospace' },
  testSendMeta: { color: '#999999', fontSize: 11, fontFamily: 'monospace', marginTop: 1 },
  testSendBtn: {
    backgroundColor: '#0B6EFD', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 9, minWidth: 110, alignItems: 'center',
  },
  testSendBtnDisabled: { opacity: 0.4 },
  testSendBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sendResultBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, gap: 8,
  },
  sendResultSuccess: { backgroundColor: '#E8F5E9' },
  sendResultError: { backgroundColor: '#FDECEC' },
  sendResultText: { flex: 1, fontFamily: 'monospace', fontSize: 11, color: '#222222' },
  sendResultClose: { color: '#999999', fontSize: 14, paddingLeft: 8 },
  hostRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, backgroundColor: '#FFFFFF', gap: 8,
  },
  hostInput: {
    flex: 1, backgroundColor: '#FFFFFF', color: '#222222',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 13, fontFamily: 'monospace', borderWidth: 1, borderColor: '#E0E0E0',
  },
  applyBtn: { backgroundColor: '#0B6EFD', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  applyBtnText: { color: '#fff', fontSize: 13 },
  toggleBtn: { backgroundColor: '#E0E0E0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 },
  toggleBtnOn: { backgroundColor: '#E8F5E9' },
  toggleBtnText: { color: '#222222', fontSize: 12 },
  portRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingBottom: 10, backgroundColor: '#FFFFFF', gap: 8,
  },
  portLabel: { color: '#666666', fontSize: 13, fontFamily: 'monospace', width: 36 },
  portInput: {
    width: 80, backgroundColor: '#FFFFFF', color: '#222222',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 13, fontFamily: 'monospace', borderWidth: 1, borderColor: '#E0E0E0',
  },
  contextNote: { color: '#999999', fontSize: 11, fontFamily: 'monospace', flex: 1 },
  groupRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    paddingHorizontal: 10, paddingTop: 8, gap: 6,
  },
  groupTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0F0F0' },
  groupTabActive: { backgroundColor: '#0B6EFD' },
  groupTabText: { color: '#666666', fontSize: 12, fontFamily: 'monospace' },
  groupTabTextActive: { color: '#fff', fontWeight: 'bold' },
  tabRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0', paddingTop: 4,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#0B6EFD' },
  tabText: { color: '#666666', fontSize: 11, fontFamily: 'monospace' },
  tabTextActive: { color: '#0B6EFD' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F0F0F0',
  },
  statusText: { color: '#666666', fontSize: 11 },
  refreshBtn: { color: '#0B6EFD', fontSize: 14 },
  content: { flex: 1, padding: 12 },
  contentContainer: { paddingBottom: 80 },
  emptyText: { color: '#666666', textAlign: 'center', marginTop: 40 },
  errorBox: {
    backgroundColor: '#FDECEC', borderRadius: 8, padding: 16,
    borderWidth: 1, borderColor: '#F4B7B7', marginTop: 20,
  },
  errorTitle: { color: '#C0392B', fontSize: 16, marginBottom: 8 },
  errorMsg: { color: '#C0392B', fontFamily: 'monospace', fontSize: 13 },
  errorHint: { color: '#666666', fontSize: 12, marginTop: 12, lineHeight: 20 },
  jBracket: { color: '#222222', fontFamily: 'monospace', fontSize: 13 },
  jKey: { color: '#0B6EFD', fontFamily: 'monospace', fontSize: 13 },
  jStr: { color: '#A44F00', fontFamily: 'monospace', fontSize: 13 },
  jNum: { color: '#1A6B3C', fontFamily: 'monospace', fontSize: 13 },
  jBool: { color: '#5A42B5', fontFamily: 'monospace', fontSize: 13 },
  jNull: { color: '#5A42B5', fontFamily: 'monospace', fontSize: 13 },
  jRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  jPunct: { color: '#222222', fontFamily: 'monospace', fontSize: 13 },

  // ── 頂部 Tab ──
  topTabRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  topTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  topTabActive: { borderBottomWidth: 2, borderBottomColor: '#0B6EFD', backgroundColor: '#FFFFFF' },
  topTabText: { color: '#666666', fontSize: 13, fontFamily: 'monospace' },
  topTabTextActive: { color: '#0B6EFD', fontWeight: '700' },

  // ── 群組 Debug ──
  groupDbInputRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 8,
  },
  groupDbInput: {
    flex: 1, backgroundColor: '#FFFFFF', color: '#222222',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 13, fontFamily: 'monospace', borderWidth: 1, borderColor: '#E0E0E0',
  },
  groupDbFetchBtn: {
    backgroundColor: '#0B6EFD', borderRadius: 6,
    paddingHorizontal: 16, paddingVertical: 9, minWidth: 60, alignItems: 'center',
  },
  groupDbFetchText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  groupDbUrlHint: {
    color: '#0B6EFD', fontSize: 11, fontFamily: 'monospace',
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#F0F0F0',
  },
  groupDbSummaryBox: {
    backgroundColor: '#FFFFFF', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 16,
  },
  groupDbSectionTitle: {
    color: '#0B6EFD', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase',
  },
  groupDbRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  groupDbLabel: { color: '#666666', fontSize: 12, fontFamily: 'monospace' },
  groupDbValue: { color: '#0B6EFD', fontSize: 12, fontFamily: 'monospace' },
  groupDbMsgRow: {
    flexDirection: 'row', gap: 8, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0', alignItems: 'center',
  },
  groupDbMsgType: {
    color: '#A44F00', fontSize: 10, fontFamily: 'monospace',
    width: 90, flexShrink: 0,
  },
  groupDbMsgSender: {
    color: '#1A6B3C', fontSize: 11, fontFamily: 'monospace',
    width: 70, flexShrink: 0,
  },
  groupDbMsgContent: { color: '#222222', fontSize: 12, flex: 1 },
});

export default j_settings;
