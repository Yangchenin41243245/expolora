// filepath: app/(tabs)/identity.tsx
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useMessaging } from '../context/MessagingContext';

// ── 型別 ─────────────────────────────────────────────────────────────────────

type ChatMessage = {
  _id?: string;
  message_id?: string;
  text?: string;
  content?: string;
  message?: string;
  from_hash?: string;
  status?: string;
  timestamp?: number;
  createdAt?: string | number;
};

type ChatResult = {
  dest_hash: string;
  messages: ChatMessage[];
  count: number;
  storage_type?: 'persisted' | 'session';
  peer?: { dest_hash: string; nickname?: string; announced_name?: string };
};

type ClearResult = {
  dest_hash: string;
  storage_type: string;
  cleared_messages: number;
  cleared_cached_messages: number;
  cleared_session_messages: number;
  deleted_chat_file: boolean;
};

type QueryMode = 'contact' | 'direct';

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 10)}…` : '—');


// ── 顏色常數 ─────────────────────────────────────────────────────────────────

const C = {
  bg:       '#0f1117',
  surface:  '#1a1d27',
  surface2: '#12141e',
  surface3: '#0d0f18',
  border:   '#1e2130',
  accent:   '#4a90e2',
  accentDim:'#2a5298',
  text:     '#e0e0e0',
  textDim:  '#8a8d9a',
  textMute: '#3a3d4a',
  danger:   '#c0392b',
  dangerBg: '#2a1515',
  dangerBorder: '#5a2020',
  green:    '#27ae60',
  greenBg:  '#1a3320',
  greenBorder: '#2a6040',
  yellow:   '#e2a84a',
};

// ─────────────────────────────────────────────────────────────────────────────
// 主元件
// ─────────────────────────────────────────────────────────────────────────────

export default function identity() {
  const { baseUrl, lobbyPeers } = useMessaging();

  const [mode, setMode]           = useState<QueryMode>('contact');
  const [destHash, setDestHash]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [chatResult, setChatResult]   = useState<ChatResult | null>(null);
  const [clearResult, setClearResult] = useState<ClearResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // 選取 lobby 節點
  const [showPicker, setShowPicker] = useState(false);

  // 清除確認 Modal
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 動畫
  const resultAnim = useRef(new Animated.Value(0)).current;
  const fadeResult = () => {
    resultAnim.setValue(0);
    Animated.timing(resultAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  };

  // ── API ───────────────────────────────────────────────────────────────────

  const fetchChat = useCallback(async () => {
    const hash = destHash.trim();
    if (!hash) { setError('請輸入或選取 Destination Hash'); return; }
    setLoading(true);
    setError(null);
    setChatResult(null);
    setClearResult(null);
    try {
      const endpoint = mode === 'contact'
        ? `/getChat/${hash}`
        : `/getDirectChat/${hash}`;
      const res = await fetch(`${baseUrl}${endpoint}`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error_message ?? `HTTP ${res.status}`);
      setChatResult(json.data as ChatResult);
      fadeResult();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, destHash, mode]);

  const clearHistory = useCallback(async () => {
    const hash = destHash.trim();
    if (!hash) return;
    setLoading(true);
    setError(null);
    setChatResult(null);
    setClearResult(null);
    try {
      const res = await fetch(`${baseUrl}/clearChatHistory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ dest_hash: hash }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error_message ?? `HTTP ${res.status}`);
      setClearResult(json.data as ClearResult);
      fadeResult();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, destHash]);

  // ── 選取 Lobby 節點 ───────────────────────────────────────────────────────

  const pickPeer = (peer: typeof lobbyPeers[0]) => {
    setDestHash(peer.dest_hash);
    // 若有 is_saved_contact 則自動切換模式（型別中可能有，視 Context 是否回傳）
    const isSaved = (peer as any).is_saved_contact;
    if (typeof isSaved === 'boolean') setMode(isSaved ? 'contact' : 'direct');
    setShowPicker(false);
    setChatResult(null);
    setClearResult(null);
    setError(null);
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  const peerName = (peer: typeof lobbyPeers[0]) =>
    peer.nickname || peer.announced_name || shortHash(peer.dest_hash);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── 頂部 Bar ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>對話紀錄</Text>
        <Text style={styles.headerSub}>查詢 · 清除</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >

        {/* ── 模式切換 ── */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'contact' && styles.modeBtnActive]}
            onPress={() => { setMode('contact'); setChatResult(null); setClearResult(null); setError(null); }}
          >
            <Text style={[styles.modeBtnText, mode === 'contact' && styles.modeBtnTextActive]}>
              🤝 聯絡人
            </Text>
            <Text style={[styles.modeBtnHint, mode === 'contact' && styles.modeBtnHintActive]}>
              getChat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'direct' && styles.modeBtnActive]}
            onPress={() => { setMode('direct'); setChatResult(null); setClearResult(null); setError(null); }}
          >
            <Text style={[styles.modeBtnText, mode === 'direct' && styles.modeBtnTextActive]}>
              📡 未儲存節點
            </Text>
            <Text style={[styles.modeBtnHint, mode === 'direct' && styles.modeBtnHintActive]}>
              getDirectChat
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Hash 輸入列 ── */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>DESTINATION HASH</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.hashInput}
              value={destHash}
              onChangeText={v => { setDestHash(v); setChatResult(null); setClearResult(null); setError(null); }}
              placeholder="貼上或從 Lobby 選取…"
              placeholderTextColor={C.textMute}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={fetchChat}
            />
            {/* Lobby 選取按鈕 */}
            <TouchableOpacity
              style={styles.lobbyPickBtn}
              onPress={() => setShowPicker(true)}
            >
              <Text style={styles.lobbyPickIcon}>📡</Text>
            </TouchableOpacity>
          </View>

          {/* Lobby 快速選取列 */}
          {lobbyPeers.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {lobbyPeers.map(peer => (
                <TouchableOpacity
                  key={peer.dest_hash}
                  style={[
                    styles.chip,
                    destHash === peer.dest_hash && styles.chipActive,
                  ]}
                  onPress={() => pickPeer(peer)}
                >
                  <View style={[
                    styles.chipDot,
                    peer.online ? styles.chipDotOn : styles.chipDotOff,
                  ]} />
                  <Text style={[styles.chipText, destHash === peer.dest_hash && styles.chipTextActive]}>
                    {peerName(peer)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── 操作按鈕 ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.queryBtn, loading && styles.btnLoading]}
            onPress={fetchChat}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Text style={styles.queryBtnIcon}>🔍</Text>
                  <Text style={styles.queryBtnText}>查詢紀錄</Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.clearBtn, loading && styles.btnLoading]}
            onPress={() => {
              if (!destHash.trim()) { setError('請先輸入 Destination Hash'); return; }
              setShowClearConfirm(true);
            }}
            disabled={loading}
          >
            <Text style={styles.clearBtnIcon}>🗑</Text>
            <Text style={styles.clearBtnText}>清除紀錄</Text>
          </TouchableOpacity>
        </View>

        {/* ── 錯誤提示 ── */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 清除結果 ── */}
        {clearResult && (
          <Animated.View style={[styles.clearResultBox, { opacity: resultAnim }]}>
            <View style={styles.clearResultHeader}>
              <Text style={styles.clearResultTitle}>✓ 清除完成</Text>
              <Text style={styles.clearResultHash}>{shortHash(clearResult.dest_hash)}</Text>
            </View>
            <View style={styles.clearStatGrid}>
              <ClearStat label="持久化訊息" value={clearResult.cleared_messages} />
              <ClearStat label="快取訊息"   value={clearResult.cleared_cached_messages} />
              <ClearStat label="Session 訊息" value={clearResult.cleared_session_messages} />
              <ClearStat label="刪除檔案" value={clearResult.deleted_chat_file ? '是' : '否'} text />
            </View>
          </Animated.View>
        )}

        {/* ── 對話紀錄結果（raw JSON）── */}
        {chatResult && (
          <Animated.View style={{ opacity: resultAnim }}>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => Clipboard.setStringAsync(JSON.stringify(chatResult, null, 2))}
            >
              <Text style={styles.copyBtnText}>複製 JSON</Text>
            </TouchableOpacity>
            <Text style={styles.rawJson} selectable>
              {JSON.stringify(chatResult, null, 2)}
            </Text>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 清除確認 Modal ── */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>確認清除對話紀錄？</Text>
            <Text style={styles.confirmBody}>
              此操作將清除{'\n'}
              <Text style={styles.confirmHash}>{shortHash(destHash)}</Text>
              {'\n'}的所有對話紀錄，無法復原。
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowClearConfirm(false)}
              >
                <Text style={styles.confirmCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDangerBtn}
                onPress={() => { setShowClearConfirm(false); clearHistory(); }}
              >
                <Text style={styles.confirmDangerText}>確認清除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Lobby 完整選取 Modal（與 j_settings 對應的 overlay 模式）── */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Lobby 節點</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {lobbyPeers.length === 0 && (
                <View style={styles.pickerEmpty}>
                  <Text style={styles.pickerEmptyText}>Lobby 中尚無活躍節點</Text>
                </View>
              )}
              {lobbyPeers.map(peer => {
                const isSaved = !!(peer as any).is_saved_contact;
                const name    = peerName(peer);
                return (
                  <TouchableOpacity
                    key={peer.dest_hash}
                    style={[styles.pickerRow, destHash === peer.dest_hash && styles.pickerRowActive]}
                    onPress={() => pickPeer(peer)}
                  >
                    <View style={[styles.pickerAvatar, isSaved ? styles.avatarContact : styles.avatarUnknown]}>
                      <Text style={styles.pickerAvatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                    <View style={styles.pickerInfo}>
                      <View style={styles.pickerNameRow}>
                        <View style={[styles.chipDot, peer.online ? styles.chipDotOn : styles.chipDotOff]} />
                        <Text style={styles.pickerName}>{name}</Text>
                        <View style={isSaved ? styles.tagContact : styles.tagUnknown}>
                          <Text style={styles.tagText}>{isSaved ? '聯絡人' : '未知'}</Text>
                        </View>
                      </View>
                      <Text style={styles.pickerHash}>{shortHash(peer.dest_hash)}</Text>
                    </View>
                    {destHash === peer.dest_hash && <Text style={styles.pickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const ClearStat: React.FC<{ label: string; value: number | string; text?: boolean }> = ({ label, value, text }) => (
  <View style={styles.clearStatCell}>
    <Text style={styles.clearStatValue}>{text ? value : (value as number) > 0 ? `−${value}` : '0'}</Text>
    <Text style={styles.clearStatLabel}>{label}</Text>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// 樣式
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  scroll:       { flex: 1 },
  scrollContent:{ padding: 14, paddingTop: 0 },

  // ── Header ──
  header: {
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12,
    backgroundColor: C.surface2,
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
  },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
  headerSub:   { color: C.textMute, fontSize: 12, fontFamily: 'monospace' },

  // ── 模式切換 ──
  modeRow: {
    flexDirection: 'row', gap: 8,
    marginTop: 14, marginBottom: 14,
  },
  modeBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 10,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  modeBtnActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  modeBtnText:       { color: C.textDim, fontSize: 13, fontWeight: '600' },
  modeBtnTextActive: { color: '#fff' },
  modeBtnHint:       { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 3 },
  modeBtnHintActive: { color: 'rgba(255,255,255,0.55)' },

  // ── Hash 輸入 ──
  inputSection: { marginBottom: 14 },
  inputLabel:   { color: C.textMute, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 },
  inputRow:     { flexDirection: 'row', gap: 8 },
  hashInput: {
    flex: 1, backgroundColor: C.surface, color: C.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 13, fontFamily: 'monospace',
    borderWidth: 1, borderColor: C.border,
  },
  lobbyPickBtn: {
    backgroundColor: C.surface, borderRadius: 8,
    width: 46, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  lobbyPickIcon: { fontSize: 20 },

  // ── Lobby 快速 Chip ──
  chipScroll: { marginTop: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surface2, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
    marginRight: 6, borderWidth: 1, borderColor: C.border,
  },
  chipActive:       { backgroundColor: C.accentDim, borderColor: C.accent },
  chipDot:          { width: 6, height: 6, borderRadius: 3 },
  chipDotOn:        { backgroundColor: C.green },
  chipDotOff:       { backgroundColor: C.textMute },
  chipText:         { color: C.textDim, fontSize: 12 },
  chipTextActive:   { color: '#fff' },

  // ── 操作按鈕 ──
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  queryBtn: {
    flex: 2, backgroundColor: C.accentDim, borderRadius: 10,
    paddingVertical: 13, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  queryBtnIcon: { fontSize: 15 },
  queryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  clearBtn: {
    flex: 1, backgroundColor: C.dangerBg, borderRadius: 10,
    paddingVertical: 13, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: C.dangerBorder,
  },
  clearBtnIcon: { fontSize: 14 },
  clearBtnText: { color: '#e57373', fontSize: 13, fontWeight: '600' },
  btnLoading:   { opacity: 0.55 },

  // ── 錯誤 ──
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: C.dangerBg, borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.dangerBorder, marginBottom: 12,
  },
  errorIcon: { color: '#e57373', fontSize: 15 },
  errorText: { color: '#ef9a9a', fontSize: 13, flex: 1, fontFamily: 'monospace' },

  // ── 清除結果 ──
  clearResultBox: {
    backgroundColor: C.greenBg, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: C.greenBorder, marginBottom: 14,
  },
  clearResultHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  clearResultTitle: { color: '#5acd8a', fontSize: 15, fontWeight: '700' },
  clearResultHash:  { color: '#2a7a4a', fontSize: 11, fontFamily: 'monospace' },
  clearStatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clearStatCell: {
    flex: 1, minWidth: '40%', backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8, padding: 10, alignItems: 'center',
  },
  clearStatValue: { color: '#5acd8a', fontSize: 22, fontWeight: '700', fontFamily: 'monospace' },
  clearStatLabel: { color: '#2a7a4a', fontSize: 10, marginTop: 3, textAlign: 'center' },

  // ── 查詢結果 Header ──
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  resultHeaderLeft: { flex: 1 },
  resultTitle:  { color: C.text, fontSize: 15, fontWeight: '700' },
  resultSub:    { color: C.textDim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  countBadge: {
    backgroundColor: C.accentDim, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  countBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── 無紀錄 ──
  emptyResult: { alignItems: 'center', paddingVertical: 36 },
  emptyResultIcon: { fontSize: 36, marginBottom: 10 },
  emptyResultText: { color: C.textDim, fontSize: 14 },

  // ── 訊息卡片 ──
  msgCard: {
    backgroundColor: C.surface, borderRadius: 10,
    padding: 11, marginBottom: 6,
    borderWidth: 1, borderColor: C.border,
  },
  msgCardSelf: { borderLeftWidth: 3, borderLeftColor: C.accent },
  msgCardPeer: { borderLeftWidth: 3, borderLeftColor: C.green },
  msgTopRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  dirTag: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  dirTagSelf: { backgroundColor: C.accentDim },
  dirTagPeer: { backgroundColor: C.greenBg },
  dirTagText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  statusTag: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1,
  },
  statusTagText: { fontSize: 10, fontWeight: '600' },
  msgTs:    { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginLeft: 'auto' },
  msgText:  { color: C.text, fontSize: 13, lineHeight: 19 },
  msgId:    { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 5 },

  // ── 清除確認 Modal ──
  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmSheet: {
    backgroundColor: C.surface, borderRadius: 16, padding: 24,
    width: '82%', borderWidth: 1, borderColor: C.border,
  },
  confirmTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  confirmBody: { color: C.textDim, fontSize: 13, lineHeight: 20, marginBottom: 20 },
  confirmHash: { color: C.accent, fontFamily: 'monospace' },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmCancelBtn: {
    flex: 1, backgroundColor: C.surface2, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  confirmCancelText: { color: C.textDim, fontSize: 14 },
  confirmDangerBtn: {
    flex: 1, backgroundColor: C.danger, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  confirmDangerText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Lobby Picker Modal ──
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '65%', borderTopWidth: 1, borderColor: C.border,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  pickerTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  pickerClose: { color: C.textDim, fontSize: 18, padding: 4 },
  pickerEmpty: { padding: 40, alignItems: 'center' },
  pickerEmptyText: { color: C.textDim, fontSize: 13 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  pickerRowActive: { backgroundColor: '#0f1a2a' },
  pickerAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarContact: { backgroundColor: '#1A6B3C' },
  avatarUnknown: { backgroundColor: '#444' },
  pickerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pickerInfo:   { flex: 1 },
  pickerNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerName:   { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  pickerHash:   { color: C.textDim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  pickerCheck:  { color: C.accent, fontSize: 18, fontWeight: '700' },
  tagContact: {
    backgroundColor: '#1a3a2a', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tagUnknown: {
    backgroundColor: C.surface2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tagText: { color: C.textDim, fontSize: 10 },
  rawJson: { color: '#d4d4d4', fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  copyBtn: {
    alignSelf: 'flex-end', backgroundColor: '#1e2130',
    borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 8, borderWidth: 1, borderColor: '#2a3050',
  },
  copyBtnText: { color: '#4a90e2', fontSize: 12, fontFamily: 'monospace' },
});