// filepath: app/(tabs)/screen3.tsx
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

const Screen3: React.FC = () => {
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
        {current.loading && <ActivityIndicator size="small" color="#4a90e2" />}
        <TouchableOpacity onPress={() => fetchEndpoint(activeEndpoint)}>
          <Text style={styles.refreshBtn}>↻ 刷新</Text>
        </TouchableOpacity>
      </View>

      {/* ── 內容區 ── */}
      <ScrollView
        style={styles.content}
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
    </View>
  );
};

// ── 遞迴 JSON 顯示 ──────────────────────────────────────
const JsonViewer: React.FC<{ data: unknown; depth: number }> = ({ data, depth }) => {
  const indent = depth * 12;
  if (data === null) return <Text style={[styles.jNull, { marginLeft: indent }]}>null</Text>;
  if (typeof data === 'boolean') return <Text style={[styles.jBool, { marginLeft: indent }]}>{data ? 'true' : 'false'}</Text>;
  if (typeof data === 'number') return <Text style={[styles.jNum, { marginLeft: indent }]}>{data}</Text>;
  if (typeof data === 'string') return <Text style={[styles.jStr, { marginLeft: indent }]}>{'"'}{data}{'"'}</Text>;
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

// ── 樣式 ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1117' },
  testSendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#12141e', borderBottomWidth: 1, borderBottomColor: '#1e2130', gap: 8,
  },
  testSendInfo: { flex: 1 },
  testSendLabel: { color: '#aaa', fontSize: 12, fontFamily: 'monospace' },
  testSendMeta: { color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 1 },
  testSendBtn: {
    backgroundColor: '#2a5298', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 9, minWidth: 110, alignItems: 'center',
  },
  testSendBtnDisabled: { opacity: 0.4 },
  testSendBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sendResultBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, gap: 8,
  },
  sendResultSuccess: { backgroundColor: '#1a3320' },
  sendResultError: { backgroundColor: '#2a1515' },
  sendResultText: { flex: 1, fontFamily: 'monospace', fontSize: 11, color: '#ccc' },
  sendResultClose: { color: '#666', fontSize: 14, paddingLeft: 8 },
  hostRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, backgroundColor: '#1a1d27', gap: 8,
  },
  hostInput: {
    flex: 1, backgroundColor: '#252836', color: '#e0e0e0',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 13, fontFamily: 'monospace',
  },
  applyBtn: { backgroundColor: '#4a90e2', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  applyBtnText: { color: '#fff', fontSize: 13 },
  toggleBtn: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 },
  toggleBtnOn: { backgroundColor: '#2a7a2a' },
  toggleBtnText: { color: '#fff', fontSize: 12 },
  portRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingBottom: 10, backgroundColor: '#1a1d27', gap: 8,
  },
  portLabel: { color: '#888', fontSize: 13, fontFamily: 'monospace', width: 36 },
  portInput: {
    width: 80, backgroundColor: '#252836', color: '#e0e0e0',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 13, fontFamily: 'monospace',
  },
  contextNote: { color: '#444', fontSize: 11, fontFamily: 'monospace', flex: 1 },
  groupRow: {
    flexDirection: 'row', backgroundColor: '#12141e',
    paddingHorizontal: 10, paddingTop: 8, gap: 6,
  },
  groupTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1e2130' },
  groupTabActive: { backgroundColor: '#4a90e2' },
  groupTabText: { color: '#666', fontSize: 12, fontFamily: 'monospace' },
  groupTabTextActive: { color: '#fff', fontWeight: 'bold' },
  tabRow: {
    flexDirection: 'row', backgroundColor: '#1a1d27',
    borderBottomWidth: 1, borderBottomColor: '#2a2d3a', paddingTop: 4,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4a90e2' },
  tabText: { color: '#555', fontSize: 11, fontFamily: 'monospace' },
  tabTextActive: { color: '#4a90e2' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#151820',
  },
  statusText: { color: '#555', fontSize: 11 },
  refreshBtn: { color: '#4a90e2', fontSize: 14 },
  content: { flex: 1, padding: 12 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 40 },
  errorBox: {
    backgroundColor: '#2a1515', borderRadius: 8, padding: 16,
    borderWidth: 1, borderColor: '#7a2a2a', marginTop: 20,
  },
  errorTitle: { color: '#e57373', fontSize: 16, marginBottom: 8 },
  errorMsg: { color: '#ef9a9a', fontFamily: 'monospace', fontSize: 13 },
  errorHint: { color: '#888', fontSize: 12, marginTop: 12, lineHeight: 20 },
  jBracket: { color: '#d4d4d4', fontFamily: 'monospace', fontSize: 13 },
  jKey: { color: '#9cdcfe', fontFamily: 'monospace', fontSize: 13 },
  jStr: { color: '#ce9178', fontFamily: 'monospace', fontSize: 13 },
  jNum: { color: '#b5cea8', fontFamily: 'monospace', fontSize: 13 },
  jBool: { color: '#569cd6', fontFamily: 'monospace', fontSize: 13 },
  jNull: { color: '#569cd6', fontFamily: 'monospace', fontSize: 13 },
  jRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  jPunct: { color: '#d4d4d4', fontFamily: 'monospace', fontSize: 13 },
});

export default Screen3;