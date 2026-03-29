// filepath: app/(tabs)/index.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
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

// ── 常數 ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4000;
const MY_USER_ID       = 1;
const BOT_USER_ID      = 2;

const SYSTEM_PREFIXES = [
  '[SYSTEM]', '[OUT]', '[SEND COMPLETE]', '[PACKET]',
  '[PACKET RECV]', '[IN]', '[ERROR]', '[WARN]', '[INFO]', '[RECEIPT TIMEOUT]',
];

const isSystemLine = (raw: string): boolean => {
  const t = raw.trim();
  if (t === '') return true;
  return SYSTEM_PREFIXES.some(p => t.startsWith(p));
};

const lineToIMessage = (text: string, uid: string): IMessage => ({
  _id: uid,
  text: text.trim(),
  createdAt: new Date(),
  user: { _id: BOT_USER_ID, name: 'Peer' },
});

// ── 型別 ──────────────────────────────────────────────────────────────────────

type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  custom_nickname?: string;
  is_saved_contact?: boolean;
  online?: boolean;
};

// 每個節點獨立保存自己的訊息紀錄與已知長度
type PeerChatState = {
  messages: IMessage[];
  knownCount: number;
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 10)}…` : '—');

const peerDisplayName = (peer: LobbyPeer): string =>
  peer.custom_nickname || peer.announced_name || shortHash(peer.dest_hash);

const peerSubtitle = (peer: LobbyPeer): string => {
  if (peer.is_saved_contact) {
    const base = peer.announced_name || shortHash(peer.dest_hash);
    return peer.custom_nickname ? base : '';
  }
  return `未知節點 · ${shortHash(peer.dest_hash)}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 主元件
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { baseUrl, lobbyPeers } = useMessaging();

  // ── 目前選中的節點 ────────────────────────────────────────────────────────
  const [selectedPeer, setSelectedPeer] = useState<LobbyPeer | null>(null);
  const [showPeerPicker, setShowPeerPicker] = useState(false);

  // ── 每個節點的對話紀錄（以 dest_hash 為 key）────────────────────────────
  const chatStatesRef = useRef<Record<string, PeerChatState>>({});
  const [messages, setMessages] = useState<IMessage[]>([]);

  // 選中節點變更時，載入對應的歷史訊息
  const selectedHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedPeer) return;
    const hash = selectedPeer.dest_hash;
    if (selectedHashRef.current === hash) return;
    selectedHashRef.current = hash;

    // 從快取中恢復該節點的訊息
    const cached = chatStatesRef.current[hash];
    setMessages(cached?.messages ?? []);
  }, [selectedPeer]);

  // lobby 更新時，若選中節點仍在 lobby 中，更新其 metadata（暱稱等）
  useEffect(() => {
    if (!selectedPeer) {
      // 自動選第一個
      if (lobbyPeers.length > 0) setSelectedPeer(lobbyPeers[0] as LobbyPeer);
      return;
    }
    const updated = lobbyPeers.find(p => p.dest_hash === selectedPeer.dest_hash);
    if (updated) {
      setSelectedPeer(updated as LobbyPeer);
    }
    // 若選中節點已離開 lobby，保持選中但標記為 offline（API 資料中 online 已為 false）
  }, [lobbyPeers]);

  // ── baseUrl 變更時全部重置 ────────────────────────────────────────────────
  const prevBaseUrl = useRef(baseUrl);
  useEffect(() => {
    if (prevBaseUrl.current === baseUrl) return;
    prevBaseUrl.current = baseUrl;
    chatStatesRef.current = {};
    setMessages([]);
    setSelectedPeer(null);
    selectedHashRef.current = null;
  }, [baseUrl]);

  // ── 輪詢 /messages ────────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const hash = selectedHashRef.current;
      if (!hash) return;
      try {
        const res = await fetch(`${baseUrl}/messages`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const json: unknown = await res.json();
        if (!Array.isArray(json)) return;

        const lines: string[] = json.map(item =>
          typeof item === 'string' ? item : JSON.stringify(item)
        );

        const state = chatStatesRef.current[hash] ?? { messages: [], knownCount: 0 };
        if (lines.length <= state.knownCount) return;

        const newLines = lines.slice(state.knownCount);
        const newKnown = lines.length;

        const incoming: IMessage[] = newLines
          .filter(l => !isSystemLine(l))
          .map((l, i) => lineToIMessage(l, `recv_${state.knownCount + i}_${l.slice(0, 16)}`));

        const updatedMessages = incoming.length > 0
          ? GiftedChat.append(state.messages, incoming)
          : state.messages;

        chatStatesRef.current[hash] = { messages: updatedMessages, knownCount: newKnown };

        // 只在仍然選中該節點時更新畫面
        if (selectedHashRef.current === hash) {
          setMessages(updatedMessages);
        }
      } catch { /* 靜默 */ }
    };

    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [baseUrl]);

  // ── 發送訊息 ──────────────────────────────────────────────────────────────
  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      const hash = selectedHashRef.current;
      if (!hash) return;

      // 樂觀更新
      const state = chatStatesRef.current[hash] ?? { messages: [], knownCount: 0 };
      const updated = GiftedChat.append(state.messages, newMessages);
      chatStatesRef.current[hash] = { ...state, messages: updated };
      setMessages(updated);

      // 已儲存聯絡人用 msgContact，否則用 msgDirect
      const endpoint = selectedPeer?.is_saved_contact ? '/msgContact' : '/msgDirect';

      for (const msg of newMessages) {
        try {
          await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ dest_hash: hash, message: msg.text }),
          });
        } catch { /* 靜默 */ }
      }
    },
    [baseUrl, selectedPeer?.is_saved_contact]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const renderBubble = (props: any) => {
    const isMe = props.currentMessage?.user?._id === MY_USER_ID;
    return (
      <View>
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: '#00C853',
              borderTopRightRadius: 20, borderTopLeftRadius: 20,
              borderBottomRightRadius: 4, borderBottomLeftRadius: 20,
              paddingHorizontal: 14, paddingVertical: 10, marginVertical: 2,
            },
            left: {
              backgroundColor: '#FFFFFF',
              borderTopRightRadius: 20, borderTopLeftRadius: 20,
              borderBottomRightRadius: 20, borderBottomLeftRadius: 4,
              paddingHorizontal: 14, paddingVertical: 10, marginVertical: 2,
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
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
        disabled={!hasText || !selectedPeer}
        containerStyle={styles.sendContainer}
      >
        <Ionicons
          name="send"
          size={24}
          color={hasText && selectedPeer ? '#00C853' : '#AAAAAA'}
        />
      </Send>
    );
  };

  // ── Header 中間：節點選擇器觸發區 ────────────────────────────────────────
  const HeaderCenter = () => {
    if (lobbyPeers.length === 0) {
      return (
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>等待節點…</Text>
          <Text style={styles.headerSub}>Lobby 無活躍節點</Text>
        </View>
      );
    }

    const subtitle = selectedPeer ? peerSubtitle(selectedPeer) : '';

    return (
      <TouchableOpacity
        style={styles.headerCenter}
        onPress={() => setShowPeerPicker(true)}
        activeOpacity={0.7}
      >
        <View style={styles.headerNameRow}>
          {selectedPeer && (
            <View style={[
              styles.onlineDot,
              selectedPeer.online ? styles.dotOnline : styles.dotOffline,
            ]} />
          )}
          <Text style={styles.headerName} numberOfLines={1}>
            {selectedPeer ? peerDisplayName(selectedPeer) : '選擇節點'}
          </Text>
          <Text style={styles.headerChevron}>⌄</Text>
        </View>
        {subtitle ? (
          <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F6" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <HeaderCenter />
        <View style={{ width: 40 }} />
      </View>

      {/* ── 對話區 ── */}
      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: MY_USER_ID }}
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        messagesContainerStyle={{ backgroundColor: '#E5DDD5' }}
        textInputProps={{
          placeholder: selectedPeer ? '輸入訊息' : 'Lobby 無節點，無法傳送',
          placeholderTextColor: '#999',
          style: { fontSize: 16 },
          editable: !!selectedPeer,
        }}
        isSendButtonAlwaysVisible
        isScrollToBottomEnabled
        scrollToBottomOffset={150}
        timeFormat="HH:mm"
        dateFormat="YYYY年M月D日"
      />

      {/* ── 節點選擇器 Modal ── */}
      <PeerPickerModal
        visible={showPeerPicker}
        peers={lobbyPeers as LobbyPeer[]}
        selectedHash={selectedPeer?.dest_hash ?? null}
        onSelect={(peer) => {
          setSelectedPeer(peer);
          setShowPeerPicker(false);
        }}
        onClose={() => setShowPeerPicker(false)}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PeerPickerModal
// ─────────────────────────────────────────────────────────────────────────────

type PeerPickerModalProps = {
  visible: boolean;
  peers: LobbyPeer[];
  selectedHash: string | null;
  onSelect: (peer: LobbyPeer) => void;
  onClose: () => void;
};

const PeerPickerModal: React.FC<PeerPickerModalProps> = ({
  visible, peers, selectedHash, onSelect, onClose,
}) => {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true,
        damping: 20, stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible]);

  const renderPeer = ({ item }: { item: LobbyPeer }) => {
    const isSelected = item.dest_hash === selectedHash;
    const name       = peerDisplayName(item);
    const isContact  = !!item.is_saved_contact;

    return (
      <TouchableOpacity
        style={[styles.peerRow, isSelected && styles.peerRowSelected]}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={[styles.peerAvatar, isContact ? styles.peerAvatarContact : styles.peerAvatarUnknown]}>
          <Text style={styles.peerAvatarText}>
            {name[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>

        {/* 資訊 */}
        <View style={styles.peerInfo}>
          <View style={styles.peerNameRow}>
            <View style={[
              styles.onlineDot,
              item.online ? styles.dotOnline : styles.dotOffline,
            ]} />
            <Text style={styles.peerName}>{name}</Text>
            {isContact
              ? <View style={styles.contactTag}><Text style={styles.contactTagText}>聯絡人</Text></View>
              : <View style={styles.unknownTag}><Text style={styles.unknownTagText}>未知</Text></View>
            }
          </View>
          <Text style={styles.peerHash} numberOfLines={1}>
            {item.announced_name && item.custom_nickname
              ? `${item.announced_name} · ${shortHash(item.dest_hash)}`
              : shortHash(item.dest_hash)
            }
          </Text>
        </View>

        {/* 選中勾 */}
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* 半透明遮罩 */}
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose} />

      {/* 底部選單 */}
      <Animated.View style={[styles.pickerSheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* 標題列 */}
        <View style={styles.pickerHeader}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>選擇對話節點</Text>
          <Text style={styles.pickerCount}>{peers.length} 個活躍</Text>
        </View>

        {/* 節點列表 */}
        {peers.length === 0 ? (
          <View style={styles.pickerEmpty}>
            <Text style={styles.pickerEmptyIcon}>📡</Text>
            <Text style={styles.pickerEmptyText}>Lobby 中尚無活躍節點</Text>
          </View>
        ) : (
          <FlatList
            data={peers}
            keyExtractor={p => p.dest_hash}
            renderItem={renderPeer}
            style={styles.pickerList}
            ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
          />
        )}
      </Animated.View>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 樣式
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F6' },

  // ── Header ──
  header: {
    height: 58,
    backgroundColor: '#F6F6F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  headerName: {
    fontSize: 17, fontWeight: '600', color: '#000',
    textAlign: 'center', maxWidth: 200,
  },
  headerChevron: {
    fontSize: 13, color: '#888', marginTop: 1,
  },
  headerSub: { fontSize: 11, color: '#888', marginTop: 1 },

  // ── 在線點 ──
  onlineDot:   { width: 7, height: 7, borderRadius: 4 },
  dotOnline:   { backgroundColor: '#00C853' },
  dotOffline:  { backgroundColor: '#BBBBBB' },

  // ── GiftedChat ──
  inputToolbar: {
    backgroundColor: '#F6F6F6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8D8D8',
    paddingVertical: 6,
  },
  primaryStyle: {
    borderRadius: 22, backgroundColor: '#FFFFFF',
    borderWidth: 0.5, borderColor: '#E0E0E0',
    paddingHorizontal: 12, marginHorizontal: 8,
  },
  sendContainer: {
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, marginBottom: 8,
  },
  tickContainer: { alignItems: 'flex-end', marginRight: 8, marginTop: -4 },
  tick: { fontSize: 12, color: 'rgba(0,0,0,0.4)' },

  // ── Picker Modal 遮罩 ──
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // ── Picker 底部 Sheet ──
  pickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '60%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 16,
  },
  pickerHeader: {
    alignItems: 'center', paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECEC',
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#DDDDDD', marginBottom: 10,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  pickerCount: { fontSize: 11, color: '#999', marginTop: 2 },
  pickerList:  { paddingBottom: 24 },
  pickerSep:   { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F0', marginLeft: 72 },
  pickerEmpty: {
    alignItems: 'center', paddingVertical: 48,
  },
  pickerEmptyIcon: { fontSize: 36, marginBottom: 12 },
  pickerEmptyText: { fontSize: 14, color: '#AAA' },

  // ── 節點列 ──
  peerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
    backgroundColor: '#FFFFFF',
  },
  peerRowSelected: { backgroundColor: '#F0F8FF' },
  peerAvatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  peerAvatarContact: { backgroundColor: '#1A6B3C' },
  peerAvatarUnknown: { backgroundColor: '#555555' },
  peerAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  peerInfo:   { flex: 1 },
  peerNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  peerName:   { fontSize: 15, fontWeight: '600', color: '#111', flexShrink: 1 },
  peerHash:   { fontSize: 11, color: '#999', fontFamily: 'monospace', marginTop: 2 },
  checkmark:  { fontSize: 18, color: '#00C853', fontWeight: '700' },

  // ── 標籤 ──
  contactTag: {
    backgroundColor: '#E8F5E9', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  contactTagText: { fontSize: 10, color: '#2E7D32', fontWeight: '600' },
  unknownTag: {
    backgroundColor: '#F3F3F3', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  unknownTagText: { fontSize: 10, color: '#888' },
});