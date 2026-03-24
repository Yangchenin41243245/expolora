// filepath: app/(tabs)/index.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Bubble,
  GiftedChat,
  IMessage,
  InputToolbar,
  Send,
} from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMessaging } from '../context/MessagingContext';

// ── 常數 ──────────────────────────────────────────────
const POLL_INTERVAL_MS = 4000;
const MY_USER_ID  = 1;
const BOT_USER_ID = 2;

// ── 系統訊息前綴清單，符合任一就忽略 ─────────────────
const SYSTEM_PREFIXES = [
  '[SYSTEM]',
  '[OUT]',
  '[SEND COMPLETE]',
  '[PACKET]',
  '[PACKET RECV]',
  '[IN]',
  '[ERROR]',
  '[WARN]',
  '[INFO]',
];

/**
 * /messages 回傳 string[]
 * 判斷是否為系統/日誌訊息，是則回傳 true → 跳過不顯示
 */
const isSystemLine = (raw: string): boolean => {
  const t = raw.trim();
  if (t === '') return true;
  return SYSTEM_PREFIXES.some(p => t.startsWith(p));
};

/**
 * 純文字字串 → GiftedChat IMessage（接收方氣泡，左側）
 */
const lineToIMessage = (text: string, uid: string): IMessage => ({
  _id: uid,
  text: text.trim(),
  createdAt: new Date(),
  user: { _id: BOT_USER_ID, name: 'Peer' },
});

// ── 主元件 ────────────────────────────────────────────
export default function ChatScreen() {
  const { baseUrl, firstPeer } = useMessaging();

  const [messages, setMessages] = useState<IMessage[]>([]);

  // 每次輪詢比對陣列長度差，只插入新增的尾端部分
  const knownCountRef = useRef(0);
  const seenMsgIds    = useRef<Set<string>>(new Set());

  // host/port 變更時重置
  const prevBaseUrl = useRef(baseUrl);
  useEffect(() => {
    if (prevBaseUrl.current !== baseUrl) {
      prevBaseUrl.current = baseUrl;
      setMessages([]);
      knownCountRef.current = 0;
      seenMsgIds.current.clear();
    }
  }, [baseUrl]);

  // ── 輪詢 /messages ────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/messages`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;

        const json: unknown = await res.json();
        if (!Array.isArray(json)) return;

        // 統一轉成字串陣列
        const lines: string[] = json.map((item) =>
          typeof item === 'string' ? item : JSON.stringify(item)
        );

        // 只處理新增的尾端
        const prev = knownCountRef.current;
        if (lines.length <= prev) return;

        const newLines = lines.slice(prev);
        knownCountRef.current = lines.length;

        // 過濾系統/日誌行，只保留真正的對方訊息
        const incoming: IMessage[] = newLines
          .filter(line => !isSystemLine(line))
          .map((line, i) => {
            const uid = `recv_${prev + i}_${line.slice(0, 20)}`;
            return lineToIMessage(line, uid);
          });

        if (incoming.length > 0) {
          setMessages(prev => GiftedChat.append(prev, incoming));
        }
      } catch { /* 靜默 */ }
    };

    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [baseUrl]);

  // ── 發送訊息 ──────────────────────────────────────────
  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!firstPeer) return;

      // 樂觀更新 UI（右側氣泡）
      setMessages(prev => GiftedChat.append(prev, newMessages));

      for (const msg of newMessages) {
        seenMsgIds.current.add(String(msg._id));
        try {
          await fetch(`${baseUrl}/msgDirect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              dest_hash: firstPeer.dest_hash,
              message: msg.text,
            }),
          });
        } catch { /* 靜默 */ }
      }
    },
    [baseUrl, firstPeer]
  );

  // ── 渲染元件 ──────────────────────────────────────────
  const renderBubble = (props: any) => {
    const isMe = props.currentMessage?.user?._id === MY_USER_ID;
    return (
      <View>
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: '#00C853',
              borderTopRightRadius: 20,
              borderTopLeftRadius: 20,
              borderBottomRightRadius: 4,
              borderBottomLeftRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginVertical: 2,
            },
            left: {
              backgroundColor: '#FFFFFF',
              borderTopRightRadius: 20,
              borderTopLeftRadius: 20,
              borderBottomRightRadius: 20,
              borderBottomLeftRadius: 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginVertical: 2,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.12,
              shadowRadius: 4,
              elevation: 2,
            },
          }}
          textStyle={{
            right: { color: '#000', fontSize: 16, lineHeight: 22 },
            left:  { color: '#000', fontSize: 16, lineHeight: 22 },
          }}
          timeTextStyle={{
            right: { color: 'rgba(0,0,0,0.55)', fontSize: 11 },
            left:  { color: '#888', fontSize: 11 },
          }}
        />
        {isMe && (
          <View style={styles.tickContainer}>
            <Text style={styles.tick}>✓✓</Text>
          </View>
        )}
      </View>
    );
  };

  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={styles.primaryStyle}
    />
  );

  const renderSend = (props: any) => {
    const hasText = props.text?.trim().length > 0;
    return (
      <Send
        {...props}
        disabled={!hasText || !firstPeer}
        containerStyle={styles.sendContainer}
      >
        <Ionicons
          name="send"
          size={24}
          color={hasText && firstPeer ? '#00C853' : '#AAAAAA'}
        />
      </Send>
    );
  };

  const peerLabel = firstPeer
    ? (firstPeer.announced_name ?? `${firstPeer.dest_hash.slice(0, 12)}…`)
    : '等待節點…';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F6" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{peerLabel}</Text>
          {!firstPeer && (
            <Text style={styles.headerSub}>Lobby 無節點</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: MY_USER_ID }}
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        messagesContainerStyle={{ backgroundColor: '#E5DDD5' }}
        textInputProps={{
          placeholder: firstPeer ? '輸入訊息' : 'Lobby 無節點，無法傳送',
          placeholderTextColor: '#999',
          style: { fontSize: 16 },
          editable: !!firstPeer,
        }}
        isSendButtonAlwaysVisible
        isScrollToBottomEnabled
        scrollToBottomOffset={150}
        timeFormat="HH:mm"
        dateFormat="YYYY年M月D日"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F6' },
  header: {
    height: 54,
    backgroundColor: '#F6F6F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  headerSub: { fontSize: 11, color: '#e05a00', marginTop: 1 },
  inputToolbar: {
    backgroundColor: '#F6F6F6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8D8D8',
    paddingVertical: 6,
  },
  primaryStyle: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    marginHorizontal: 8,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 8,
  },
  tickContainer: { alignItems: 'flex-end', marginRight: 8, marginTop: -4 },
  tick: { fontSize: 12, color: 'rgba(0,0,0,0.4)' },
});