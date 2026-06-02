// filepath: app/(tabs)/broadcast_chat.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHeaderHeight } from '@react-navigation/elements';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import { useMessaging } from '../context/MessagingContext';

const POLL_MS = 4000;
const STORAGE_KEY_BCASTER = 'bcaster_dest_hash';

type RawMsg = {
  message_id?: string;
  timestamp?: number;
  from_hash?: string;
  content?: string;
  status?: string;
};

type DisplayMsg = {
  id: string;
  timestamp: number;
  from_hash: string;
  content: string;
  isSelf: boolean;
};

const shortHash = (h?: string): string => {
  if (!h) return '????????';
  // RNS pretty format: <AppName.aspect:hexhash> → extract hex after colon
  const match = h.match(/:([0-9a-f]{8,})/i);
  return match ? match[1].slice(0, 8) : h.slice(0, 8);
};
const formatTime = (ts: number) => {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export default function BroadcastChat() {
  const headerHeight = useHeaderHeight();
  const { baseUrl, localDestHash } = useMessaging();

  const [bcasterDest, setBcasterDest] = useState<string | null>(null);
  const [messages, setMessages]       = useState<DisplayMsg[]>([]);
  const [inputText, setInputText]     = useState('');
  const [sending, setSending]         = useState(false);

  const bcasterDestRef = useRef<string | null>(null);
  const baseUrlRef     = useRef(baseUrl);

  useEffect(() => { bcasterDestRef.current = bcasterDest; }, [bcasterDest]);
  useEffect(() => { baseUrlRef.current = baseUrl; },        [baseUrl]);

  // 啟動時從 AsyncStorage 讀取已知的 bcasterDest
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_BCASTER).then(v => {
      if (v) setBcasterDest(v);
    });
  }, []);

  // 抓取歷史訊息
  const fetchHistory = useCallback(async () => {
    const dest = bcasterDestRef.current;
    if (!dest) return;
    try {
      const res = await fetch(
        `${baseUrlRef.current}/broadcaster/history/${encodeURIComponent(dest)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return;
      const json = await res.json();
      const raw: RawMsg[] = json?.data?.messages ?? [];
      const converted: DisplayMsg[] = raw
        .filter(m => m.content)
        .map(m => ({
          id:        m.message_id ?? String(m.timestamp ?? Math.random()),
          timestamp: m.timestamp ?? 0,
          from_hash: m.from_hash ?? '',
          content:   m.content!,
          isSelf:    m.status === 'send_pending',
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      setMessages(converted);
    } catch { /* 靜默失敗 */ }
  }, []);

  // 有 bcasterDest 後啟動輪詢
  useEffect(() => {
    if (!bcasterDest) return;
    fetchHistory();
    const t = setInterval(fetchHistory, POLL_MS);
    return () => clearInterval(t);
  }, [bcasterDest, fetchHistory]);

  // 送出廣播
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${baseUrlRef.current}/broadcaster/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender_name: localDestHash?.slice(0, 8) ?? 'unknown',
          message:     text,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const dest: string | undefined = json?.data?.dest_hash;
      if (dest && !bcasterDestRef.current) {
        setBcasterDest(dest);
        await AsyncStorage.setItem(STORAGE_KEY_BCASTER, dest);
      }
      setInputText('');
      await fetchHistory();
    } catch { /* 靜默失敗 */ } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="translate-with-padding"
        keyboardVerticalOffset={headerHeight}
      >
        {/* 訊息列表 */}
        {!bcasterDest ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>📡 廣播頻道</Text>
            <Text style={styles.emptyHint}>送出第一則訊息以加入廣播頻道</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
                <Text style={styles.fromHash}>{shortHash(item.from_hash)}</Text>
                <Text style={[styles.msgText, item.isSelf ? styles.msgTextSelf : styles.msgTextOther]}>
                  {item.content}
                </Text>
                <Text style={[styles.msgTime, item.isSelf ? styles.msgTimeSelf : styles.msgTimeOther]}>
                  {formatTime(item.timestamp)}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyHint}>尚無訊息</Text>
              </View>
            }
          />
        )}

        {/* 輸入列 */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="輸入廣播訊息..."
            placeholderTextColor="#999"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>送出</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F6F6F6' },

  emptyState:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle:  { fontSize: 22, marginBottom: 10, color: '#222' },
  emptyHint:   { fontSize: 14, color: '#999', textAlign: 'center' },

  listContent: { paddingHorizontal: 12, paddingVertical: 8 },

  bubble: {
    maxWidth: '80%',
    marginVertical: 4,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleSelf:  { alignSelf: 'flex-end',   backgroundColor: '#fff171' },
  bubbleOther: { alignSelf: 'flex-start',  backgroundColor: '#E4E4E4' },

  fromHash: {
    fontSize: 10,
    color: '#777',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  msgText:     { fontSize: 15, lineHeight: 20 },
  msgTextSelf: { color: '#222' },
  msgTextOther:{ color: '#222' },

  msgTime:      { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  msgTimeSelf:  { color: '#888' },
  msgTimeOther: { color: '#999' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F6F6F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: '#222',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sendBtn: {
    backgroundColor: '#0B6EFD',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
    minWidth: 62,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
