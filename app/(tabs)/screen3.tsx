// filepath: src/screens/Screen3.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// ── 設定區 ──────────────────────────────────────────────
// 熱點連線時，把這裡改成電腦的 IP（例如 10.165.0.78）
const DEFAULT_HOST = '10.165.0.78';
const PORT = 5000;
const POLL_INTERVAL_MS = 10000; // 每 10 秒自動刷新

const ENDPOINTS = ['/messages', '/status', '/identity'] as const;
type Endpoint = (typeof ENDPOINTS)[number];
// ────────────────────────────────────────────────────────

type FetchState = {
  data: unknown;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
};

const initState = (): FetchState => ({
  data: null,
  loading: false,
  error: null,
  lastUpdated: null,
});

const Screen3: React.FC = () => {
  const [host, setHost] = useState(DEFAULT_HOST);
  const [editingHost, setEditingHost] = useState(DEFAULT_HOST);
  const [activeTab, setActiveTab] = useState<Endpoint>('/messages');
  const [states, setStates] = useState<Record<Endpoint, FetchState>>({
    '/messages': initState(),
    '/status': initState(),
    '/identity': initState(),
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEndpoint = useCallback(
    async (endpoint: Endpoint) => {
      setStates(prev => ({
        ...prev,
        [endpoint]: { ...prev[endpoint], loading: true, error: null },
      }));
      try {
        const res = await fetch(`http://${host}:${PORT}${endpoint}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStates(prev => ({
          ...prev,
          [endpoint]: {
            data: json,
            loading: false,
            error: null,
            lastUpdated: new Date(),
          },
        }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setStates(prev => ({
          ...prev,
          [endpoint]: { ...prev[endpoint], loading: false, error: msg },
        }));
      }
    },
    [host]
  );

  const fetchAll = useCallback(() => {
    ENDPOINTS.forEach(ep => fetchEndpoint(ep));
  }, [fetchEndpoint]);

  // 初次載入 + host 改變時拉一次
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 自動輪詢
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchAll]);

  const applyHost = () => {
    setHost(editingHost.trim());
  };

  const current = states[activeTab];

  return (
    <View style={styles.container}>
      {/* ── Host 設定列 ── */}
      <View style={styles.hostRow}>
        <TextInput
          style={styles.hostInput}
          value={editingHost}
          onChangeText={setEditingHost}
          placeholder="電腦 IP"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          onSubmitEditing={applyHost}
        />
        <TouchableOpacity style={styles.applyBtn} onPress={applyHost}>
          <Text style={styles.applyBtnText}>套用</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, autoRefresh && styles.toggleBtnOn]}
          onPress={() => setAutoRefresh(v => !v)}
        >
          <Text style={styles.toggleBtnText}>
            {autoRefresh ? '⏸ 暫停' : '▶ 自動'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── 端點 Tab ── */}
      <View style={styles.tabRow}>
        {ENDPOINTS.map(ep => (
          <TouchableOpacity
            key={ep}
            style={[styles.tab, activeTab === ep && styles.tabActive]}
            onPress={() => setActiveTab(ep)}
          >
            <Text style={[styles.tabText, activeTab === ep && styles.tabTextActive]}>
              {ep}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 狀態列 ── */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {current.lastUpdated
            ? `最後更新：${current.lastUpdated.toLocaleTimeString()}`
            : '尚未載入'}
        </Text>
        {current.loading && <ActivityIndicator size="small" color="#4a90e2" />}
        <TouchableOpacity onPress={() => fetchEndpoint(activeTab)}>
          <Text style={styles.refreshBtn}>↻ 刷新</Text>
        </TouchableOpacity>
      </View>

      {/* ── 內容區 ── */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={current.loading}
            onRefresh={() => fetchEndpoint(activeTab)}
          />
        }
      >
        {current.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>⚠ 連線失敗</Text>
            <Text style={styles.errorMsg}>{current.error}</Text>
            <Text style={styles.errorHint}>
              請確認：{'\n'}• 手機連至電腦熱點{'\n'}• 電腦 IP 為 {host}{'\n'}• Flask 執行於 port {PORT}
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

// ── 遞迴 JSON 顯示元件 ──────────────────────────────────
const JsonViewer: React.FC<{ data: unknown; depth: number }> = ({ data, depth }) => {
  const indent = depth * 12;

  if (data === null) return <Text style={[styles.jNull, { marginLeft: indent }]}>null</Text>;
  if (typeof data === 'boolean')
    return <Text style={[styles.jBool, { marginLeft: indent }]}>{data ? 'true' : 'false'}</Text>;
  if (typeof data === 'number')
    return <Text style={[styles.jNum, { marginLeft: indent }]}>{data}</Text>;
  if (typeof data === 'string')
    return <Text style={[styles.jStr, { marginLeft: indent }]}>"{data}"</Text>;

  if (Array.isArray(data)) {
    if (data.length === 0)
      return <Text style={[styles.jBracket, { marginLeft: indent }]}>[]</Text>;
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
    if (entries.length === 0)
      return <Text style={[styles.jBracket, { marginLeft: indent }]}>{'{}'}</Text>;
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

  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#1a1d27',
    gap: 8,
  },
  hostInput: {
    flex: 1,
    backgroundColor: '#252836',
    color: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  applyBtn: {
    backgroundColor: '#4a90e2',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  applyBtnText: { color: '#fff', fontSize: 13 },
  toggleBtn: {
    backgroundColor: '#333',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toggleBtnOn: { backgroundColor: '#2a7a2a' },
  toggleBtnText: { color: '#fff', fontSize: 12 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1d27',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2d3a',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4a90e2' },
  tabText: { color: '#666', fontSize: 12, fontFamily: 'monospace' },
  tabTextActive: { color: '#4a90e2' },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#151820',
  },
  statusText: { color: '#555', fontSize: 11 },
  refreshBtn: { color: '#4a90e2', fontSize: 14 },

  content: { flex: 1, padding: 12 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 40 },

  errorBox: {
    backgroundColor: '#2a1515',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#7a2a2a',
    marginTop: 20,
  },
  errorTitle: { color: '#e57373', fontSize: 16, marginBottom: 8 },
  errorMsg: { color: '#ef9a9a', fontFamily: 'monospace', fontSize: 13 },
  errorHint: { color: '#888', fontSize: 12, marginTop: 12, lineHeight: 20 },

  // JSON 顏色（VS Code Dark 風格）
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