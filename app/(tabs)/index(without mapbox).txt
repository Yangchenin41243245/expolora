// filepath: app/(tabs)/index.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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
  SystemMessage,
} from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMessaging } from '../context/MessagingContext';

// ── 常數 ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS       = 4000;
const GROUP_POLL_INTERVAL_MS = 5000;
const MY_USER_ID  = 1;
const BOT_USER_ID = 2;

// ── 型別 ──────────────────────────────────────────────────────────────────────

type ChatMode = 'peer' | 'group' | null;

type ChatState = {
  messages: IMessage[];
  knownCount: number;
};

type RawGroupMsg = {
  message_type: 'GROUP' | 'GROUP_INVITE' | 'GROUP_SYSTEM' | 'GROUP_JOIN';
  content?: string;
  from_hash?: string;
  from_name?: string;
  message_id?: string;
  status?: string;       // 'delivered' = 自己發的, 'received' = 別人發的
  timestamp?: number;
};

type RawPeerMsg = {
  msg_id?: string;
  from_hash?: string;
  to_hash?: string;
  content?: string;
  status?: string;       // 'delivered' = 自己發的, 'received' = 別人發的
  timestamp?: number;
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 8)}…` : '—');

const rawPeerMsgToIMessage = (m: RawPeerMsg, idx: number): IMessage => ({
  _id:       m.msg_id ?? `p2p_${idx}`,
  text:      m.content ?? '',
  createdAt: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
  user:      { _id: m.status === 'delivered' ? MY_USER_ID : BOT_USER_ID },
});

const rawGroupMsgToIMessage = (
  m: RawGroupMsg,
  idx: number,
  selfName?: string,
): IMessage => {
  const isSystem = m.message_type === 'GROUP_SYSTEM' || m.message_type === 'GROUP_INVITE' || m.message_type === 'GROUP_JOIN';
  const isSelf =
    m.status === 'delivered' ||
    (!!selfName && !!m.from_name && m.from_name === selfName);

  return {
    _id:       m.message_id ?? `grp_${idx}_${m.timestamp ?? idx}`,
    text:      m.content ?? '',
    createdAt: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
    system:    isSystem,
    user: isSystem
      ? { _id: 0 }
      : {
          _id:  isSelf ? MY_USER_ID : BOT_USER_ID,
          name: m.from_name ?? 'Member',
        },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 主元件
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const {
    baseUrl,
    lobbyPeers:    lobbyPeersRaw,
    groupRooms:    groupRoomsRaw,
    refreshGroups: refreshGroupsRaw,
  } = useMessaging();

  const lobbyPeers    = lobbyPeersRaw    ?? [];
  const groupRooms    = groupRoomsRaw    ?? [];
  const refreshGroups = refreshGroupsRaw ?? (async () => {});

  // ── 選擇狀態：純字串，不存物件，從根本避免無限迴圈 ──────────────────────
  const [chatMode, setChatMode]                   = useState<ChatMode>(null);
  const [selectedPeerHash, setSelectedPeerHash]   = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);

  // 下拉面板開關
  const [peerDropOpen, setPeerDropOpen]   = useState(false);
  const [groupDropOpen, setGroupDropOpen] = useState(false);

  // ── 訊息快取 ──────────────────────────────────────────────────────────────
  const chatStatesRef = useRef<Record<string, ChatState>>({});
  const [messages, setMessages] = useState<IMessage[]>([]);

  // ── 加入確認 Modal ────────────────────────────────────────────────────────
  const [showJoinModal, setShowJoinModal] = useState(false);

  // ── ref：供非同步回調讀取最新狀態，不觸發 effect ─────────────────────────
  const chatModeRef      = useRef<ChatMode>(null);
  const selectedPeerRef  = useRef<string | null>(null);
  const selectedGroupRef = useRef<string | null>(null);
  const lobbyPeersRef    = useRef(lobbyPeers);

  useEffect(() => { chatModeRef.current = chatMode; },             [chatMode]);
  useEffect(() => { selectedPeerRef.current = selectedPeerHash; }, [selectedPeerHash]);
  useEffect(() => { selectedGroupRef.current = selectedGroupName; },[selectedGroupName]);
  useEffect(() => { lobbyPeersRef.current = lobbyPeers; },          [lobbyPeers]);

  // ── 衍生：當前 peer / room 物件（純渲染用，不用於 effect 依賴）───────────
  const currentPeer  = lobbyPeers.find(p => p.dest_hash === selectedPeerHash) ?? null;
  const currentGroup = groupRooms.find(r => r.group_name === selectedGroupName) ?? null;
  const joinPending  = chatMode === 'group' && !!currentGroup && !currentGroup.join_confirm;
  const isGroupMode  = chatMode === 'group';

  // ── 切換對話目標 ──────────────────────────────────────────────────────────

  const selectPeer = useCallback((hash: string) => {
    setChatMode('peer');
    setSelectedPeerHash(hash);
    setPeerDropOpen(false);
    setGroupDropOpen(false);
    const key = `peer:${hash}`;
    setMessages(chatStatesRef.current[key]?.messages ?? []);
  }, []);

  const selectGroup = useCallback((name: string) => {
    setChatMode('group');
    setSelectedGroupName(name);
    setPeerDropOpen(false);
    setGroupDropOpen(false);
    const key = `group:${name}`;
    setMessages(chatStatesRef.current[key]?.messages ?? []);
  }, []);

  // ── baseUrl 變更時全部重置 ────────────────────────────────────────────────
  const prevBaseUrl = useRef(baseUrl);
  useEffect(() => {
    if (prevBaseUrl.current === baseUrl) return;
    prevBaseUrl.current = baseUrl;
    chatStatesRef.current = {};
    setMessages([]);
    setChatMode(null);
    setSelectedPeerHash(null);
    setSelectedGroupName(null);
  }, [baseUrl]);

  // ── 快取更新：透過 ref 讀取當前狀態，避免 setState 觸發 effect ───────────
  const applyMessages = useCallback((key: string, msgs: IMessage[], knownCount?: number) => {
    const prev = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
    chatStatesRef.current[key] = { messages: msgs, knownCount: knownCount ?? prev.knownCount };
    const mode  = chatModeRef.current;
    const pHash = selectedPeerRef.current;
    const gName = selectedGroupRef.current;
    const curKey = mode === 'peer' ? `peer:${pHash}` : mode === 'group' ? `group:${gName}` : '';
    if (curKey === key) setMessages(msgs);
  }, []);

  // ── 一對一輪詢 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      if (chatModeRef.current !== 'peer') return;
      const hash = selectedPeerRef.current;
      if (!hash) return;
      const key = `peer:${hash}`;
      try {
        const peer = lobbyPeersRef.current.find(p => p.dest_hash === hash);
        const endpoint = peer?.is_saved_contact
          ? `/getChat/${encodeURIComponent(hash)}`
          : `/getDirectChat/${encodeURIComponent(hash)}`;
        const res = await fetch(`${baseUrl}${endpoint}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const json = await res.json();
        const rawMsgs: RawPeerMsg[] = json?.data?.messages ?? [];
        const converted = rawMsgs.map((m, i) => rawPeerMsgToIMessage(m, i)).reverse();
        applyMessages(key, converted);
      } catch { /* 靜默 */ }
    };
    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [baseUrl, applyMessages]);

  // ── 群組輪詢 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      if (chatModeRef.current !== 'group') return;
      const groupName = selectedGroupRef.current;
      if (!groupName) return;
      const key = `group:${groupName}`;
      try {
        const res = await fetch(`${baseUrl}/getGroupChat/${groupName}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const json = await res.json();
        const rawMsgs: RawGroupMsg[] = json?.data?.messages ?? [];
        const selfName: string | undefined = json?.data?.group_room?.self_name;
        const converted = rawMsgs.map((m, i) => rawGroupMsgToIMessage(m, i, selfName)).reverse();
        applyMessages(key, converted);
      } catch { /* 靜默 */ }
    };
    poll();
    const t = setInterval(poll, GROUP_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [baseUrl, applyMessages]);

  // ── 發送 ──────────────────────────────────────────────────────────────────
  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const mode  = chatModeRef.current;
    const hash  = selectedPeerRef.current;
    const gname = selectedGroupRef.current;
    if (!mode) return;

    if (mode === 'group') {
      const room = groupRoomsRaw?.find(r => r.group_name === gname);
      if (!room?.join_confirm) { setShowJoinModal(true); return; }
    }

    const key   = mode === 'peer' ? `peer:${hash}` : `group:${gname}`;
    const state = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
    applyMessages(key, GiftedChat.append(state.messages, newMessages));

    for (const msg of newMessages) {
      try {
        if (mode === 'group') {
          await fetch(`${baseUrl}/msgGroup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ group_name: gname, message: msg.text }),
          });
        } else {
          const peer     = lobbyPeersRaw?.find(p => p.dest_hash === hash);
          const endpoint = peer?.is_saved_contact ? '/msgContact' : '/msgDirect';
          await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ dest_hash: hash, message: msg.text }),
          });
        }
      } catch { /* 靜默 */ }
    }
  }, [baseUrl, applyMessages, lobbyPeersRaw, groupRoomsRaw]);

  // ── 快速加入 ──────────────────────────────────────────────────────────────
  const quickJoinGroup = useCallback(async () => {
    const gname = selectedGroupRef.current;
    if (!gname) return;
    try {
      await fetch(`${baseUrl}/msgGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ group_name: gname, message: '/join' }),
      });
      await refreshGroups();
      setShowJoinModal(false);
    } catch { /* 靜默 */ }
  }, [baseUrl, refreshGroups]);

  // ── GiftedChat 渲染函式 ───────────────────────────────────────────────────

  const renderBubble = (props: any) => {
    const isMe = props.currentMessage?.user?._id === MY_USER_ID;
    return (
      <View>
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: isGroupMode ? '#0B6EFD' : '#00C853',
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
            right: { color: '#fff', fontSize: 16, lineHeight: 22 },
            left:  { color: '#000', fontSize: 16, lineHeight: 22 },
          }}
          timeTextStyle={{
            right: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
            left:  { color: '#888', fontSize: 11 },
          }}
          renderUsernameOnMessage={isGroupMode}
        />
        {isMe && !isGroupMode && (
          <View style={styles.tickContainer}>
            <Text style={styles.tick}>✓✓</Text>
          </View>
        )}
      </View>
    );
  };

  const renderSystemMessage = (props: any) => (
    <SystemMessage {...props} containerStyle={styles.sysContainer} textStyle={styles.sysText} />
  );

  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={[styles.inputToolbar, joinPending && styles.inputToolbarBlocked]}
      primaryStyle={styles.primaryStyle}
    />
  );

  const renderSend = (props: any) => {
    const hasText = props.text?.trim().length > 0;
    const canSend = hasText && !!chatMode && !joinPending;
    return (
      <Send {...props} disabled={!canSend} containerStyle={styles.sendContainer}>
        <Ionicons name="send" size={24} color={canSend ? (isGroupMode ? '#0B6EFD' : '#00C853') : '#AAAAAA'} />
      </Send>
    );
  };

  const JoinBanner = () => {
    if (!joinPending) return null;
    return (
      <View style={styles.joinBanner}>
        <Text style={styles.joinBannerText}>◌ 尚未加入此群組，無法發送訊息</Text>
        <TouchableOpacity style={styles.joinBannerBtn} onPress={() => setShowJoinModal(true)}>
          <Text style={styles.joinBannerBtnText}>立即加入</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const inputPlaceholder = () => {
    if (!chatMode)   return '請先從上方選擇節點或群組';
    if (joinPending) return '請先加入此群組';
    if (isGroupMode) return `傳送至 ${selectedGroupName}`;
    return '輸入訊息';
  };

  // ── Header：左側節點下拉 / 右側群組下拉 ──────────────────────────────────

  const peerBtnLabel = chatMode === 'peer' && currentPeer
    ? (currentPeer.nickname || currentPeer.announced_name || shortHash(currentPeer.dest_hash))
    : '節點';

  const groupBtnLabel = chatMode === 'group' && currentGroup
    ? currentGroup.group_name
    : '群組';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F6" />

      {/* ── Header ── */}
      <View style={styles.header}>

        {/* 節點下拉區塊 */}
        <View style={styles.dropWrapper}>
          <TouchableOpacity
            style={[styles.dropBtn, chatMode === 'peer' && styles.dropBtnPeerActive]}
            onPress={() => { setPeerDropOpen(v => !v); setGroupDropOpen(false); }}
            activeOpacity={0.75}
          >
            <View style={[
              styles.statusDot,
              currentPeer?.online ? styles.dotOnline : styles.dotOffline,
            ]} />
            <Text style={[styles.dropBtnText, chatMode === 'peer' && styles.dropBtnPeerText]} numberOfLines={1}>
              {peerBtnLabel}
            </Text>
            <Text style={styles.dropChevron}>{peerDropOpen ? '▲' : '▾'}</Text>
          </TouchableOpacity>

          {peerDropOpen && (
            <View style={styles.dropList}>
              {lobbyPeers.length === 0 ? (
                <View style={styles.dropEmpty}>
                  <Text style={styles.dropEmptyText}>Lobby 中無活躍節點</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {lobbyPeers.map((peer, idx) => {
                    const isSel = peer.dest_hash === selectedPeerHash && chatMode === 'peer';
                    const name  = peer.nickname || peer.announced_name || shortHash(peer.dest_hash);
                    return (
                      <TouchableOpacity
                        key={peer.dest_hash}
                        style={[
                          styles.dropRow,
                          isSel && styles.dropRowSelected,
                          idx > 0 && styles.dropRowBorder,
                        ]}
                        onPress={() => selectPeer(peer.dest_hash)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.dropAvatar, peer.is_saved_contact ? styles.avatarSaved : styles.avatarUnknown]}>
                          <Text style={styles.dropAvatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <View style={[styles.statusDot, peer.online ? styles.dotOnline : styles.dotOffline]} />
                            <Text style={styles.dropRowName} numberOfLines={1}>{name}</Text>
                          </View>
                          <Text style={styles.dropRowSub}>{shortHash(peer.dest_hash)}</Text>
                        </View>
                        {isSel && <Text style={styles.dropCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        <View style={styles.headerDivider} />

        {/* 群組下拉區塊 */}
        <View style={styles.dropWrapper}>
          <TouchableOpacity
            style={[styles.dropBtn, chatMode === 'group' && styles.dropBtnGroupActive]}
            onPress={() => { setGroupDropOpen(v => !v); setPeerDropOpen(false); }}
            activeOpacity={0.75}
          >
            <View style={styles.groupSquare} />
            <Text style={[styles.dropBtnText, chatMode === 'group' && styles.dropBtnGroupText]} numberOfLines={1}>
              {groupBtnLabel}
            </Text>
            <Text style={styles.dropChevron}>{groupDropOpen ? '▲' : '▾'}</Text>
          </TouchableOpacity>

          {groupDropOpen && (
            <View style={[styles.dropList, styles.dropListRight]}>
              {groupRooms.length === 0 ? (
                <View style={styles.dropEmpty}>
                  <Text style={styles.dropEmptyText}>尚無群組，前往「群組」頁建立</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {groupRooms.map((room, idx) => {
                    const isSel = room.group_name === selectedGroupName && chatMode === 'group';
                    return (
                      <TouchableOpacity
                        key={room.group_name}
                        style={[
                          styles.dropRow,
                          isSel && styles.dropRowSelected,
                          idx > 0 && styles.dropRowBorder,
                        ]}
                        onPress={() => selectGroup(room.group_name)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.dropAvatar, styles.avatarGroup]}>
                          <Text style={styles.dropAvatarText}>{room.group_name[0]?.toUpperCase() ?? '#'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dropRowName} numberOfLines={1}>{room.group_name}</Text>
                          <Text style={styles.dropRowSub}>
                            {room.join_confirm ? '✓ 已加入' : '◌ 待加入'}
                            {room.self_name ? `  ·  ${room.self_name}` : ''}
                          </Text>
                        </View>
                        {isSel && <Text style={styles.dropCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </View>

      {/* 點擊空白關閉下拉的遮罩（在 Header 下方，不蓋住 Header）*/}
      {(peerDropOpen || groupDropOpen) && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject, { top: 52 }]}
          activeOpacity={0}
          onPress={() => { setPeerDropOpen(false); setGroupDropOpen(false); }}
        />
      )}

      {/* ── 對話區 ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'android' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={{ _id: MY_USER_ID }}
          renderBubble={renderBubble}
          renderSystemMessage={renderSystemMessage}
          renderInputToolbar={renderInputToolbar}
          renderSend={renderSend}
          messagesContainerStyle={{ backgroundColor: isGroupMode ? '#E8EFF8' : '#E5DDD5' }}
          textInputProps={{
            placeholder: inputPlaceholder(),
            placeholderTextColor: '#999',
            style: { fontSize: 16 },
            editable: !!chatMode && !joinPending,
          }}
          listProps={{ keyboardShouldPersistTaps: 'handled' }}
          isSendButtonAlwaysVisible
          isScrollToBottomEnabled
          scrollToBottomOffset={150}
          timeFormat="HH:mm"
          dateFormat="YYYY年M月D日"
          renderFooter={() => <JoinBanner />}
        />
      </KeyboardAvoidingView>

      {/* ── 快速加入 Modal ── */}
      <QuickJoinModal
        visible={showJoinModal}
        groupName={selectedGroupName ?? ''}
        onJoin={quickJoinGroup}
        onClose={() => setShowJoinModal(false)}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickJoinModal
// ─────────────────────────────────────────────────────────────────────────────

type QuickJoinModalProps = {
  visible: boolean;
  groupName: string;
  onJoin: () => Promise<void>;
  onClose: () => void;
};

const QuickJoinModal: React.FC<QuickJoinModalProps> = ({ visible, groupName, onJoin, onClose }) => {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try { await onJoin(); }
    finally { setLoading(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.joinModalOverlay}>
        <View style={styles.joinModalSheet}>
          <Text style={styles.joinModalTitle}>加入群組</Text>
          <Text style={styles.joinModalBody}>
            你尚未加入{'\n'}
            <Text style={styles.joinModalGroupName}>{groupName}</Text>
            {'\n\n'}點擊「快速加入」將在本地確認加入狀態。{'\n'}
            如需設定顯示名稱，請前往「群組」頁面。
          </Text>
          <View style={styles.joinModalActions}>
            <TouchableOpacity style={styles.joinCancelBtn} onPress={onClose}>
              <Text style={styles.joinCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.joinConfirmBtn, loading && { opacity: 0.6 }]}
              onPress={handle}
              disabled={loading}
            >
              <Text style={styles.joinConfirmText}>{loading ? '加入中…' : '⊕ 快速加入'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    height: 52,
    backgroundColor: '#F6F6F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    zIndex: 100,
  },
  headerDivider: {
    width: 1, height: 24,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 2,
  },

  // ── 下拉容器 ──
  dropWrapper: {
    flex: 1,
    position: 'relative',
  },

  // ── 觸發按鈕 ──
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  dropBtnPeerActive:  { backgroundColor: '#E8F5E9' },
  dropBtnGroupActive: { backgroundColor: '#EEF2FF' },
  dropBtnText:        { flex: 1, fontSize: 14, fontWeight: '600', color: '#555' },
  dropBtnPeerText:    { color: '#1A6B3C' },
  dropBtnGroupText:   { color: '#0B4FA8' },
  dropChevron:        { fontSize: 10, color: '#999' },

  // ── 狀態點 ──
  statusDot:  { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  dotOnline:  { backgroundColor: '#00C853' },
  dotOffline: { backgroundColor: '#BBBBBB' },
  groupSquare: {
    width: 8, height: 8, borderRadius: 2,
    backgroundColor: '#0B6EFD', flexShrink: 0,
  },

  // ── 下拉清單 ──
  dropList: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  dropListRight: {},   // 群組選單與節點選單共用同樣對齊方式

  // ── 下拉列表項目 ──
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    backgroundColor: '#FFF',
  },
  dropRowSelected: { backgroundColor: '#F0F8FF' },
  dropRowBorder:   { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0F0F0' },
  dropAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarSaved:    { backgroundColor: '#1A6B3C' },
  avatarUnknown:  { backgroundColor: '#888' },
  avatarGroup:    { backgroundColor: '#0B4FA8', borderRadius: 9 },
  dropAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dropRowName:    { fontSize: 14, fontWeight: '600', color: '#111' },
  dropRowSub:     { fontSize: 11, color: '#999', marginTop: 1 },
  dropCheck:      { fontSize: 16, color: '#00C853', fontWeight: '700', flexShrink: 0 },

  // ── 空狀態 ──
  dropEmpty:     { paddingHorizontal: 16, paddingVertical: 16 },
  dropEmptyText: { fontSize: 13, color: '#AAA' },

  // ── GiftedChat ──
  inputToolbar: {
    backgroundColor: '#F6F6F6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8D8D8',
    paddingVertical: 6,
  },
  inputToolbarBlocked: { backgroundColor: '#F0F0F0', opacity: 0.6 },
  primaryStyle: {
    borderRadius: 22, backgroundColor: '#FFFFFF',
    borderWidth: 0.5, borderColor: '#E0E0E0',
    paddingHorizontal: 12, marginHorizontal: 8,
  },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 12, marginBottom: 8 },
  tickContainer: { alignItems: 'flex-end', marginRight: 8, marginTop: -4 },
  tick:          { fontSize: 12, color: 'rgba(0,0,0,0.4)' },

  // ── 系統訊息 ──
  sysContainer: { marginVertical: 8 },
  sysText: {
    color: '#888', fontSize: 12, textAlign: 'center',
    fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
    overflow: 'hidden',
  },

  // ── 加入 Banner ──
  joinBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#FFE082',
  },
  joinBannerText: { color: '#7a6000', fontSize: 12, flex: 1 },
  joinBannerBtn: {
    backgroundColor: '#0B6EFD', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginLeft: 10,
  },
  joinBannerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── 快速加入 Modal ──
  joinModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  joinModalSheet: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    padding: 24, width: '84%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 16, elevation: 12,
  },
  joinModalTitle:     { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12 },
  joinModalBody:      { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 20 },
  joinModalGroupName: { color: '#0B6EFD', fontWeight: '700', fontSize: 15 },
  joinModalActions:   { flexDirection: 'row', gap: 10 },
  joinCancelBtn: {
    flex: 1, backgroundColor: '#F3F3F3', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  joinCancelText: { color: '#555', fontSize: 14 },
  joinConfirmBtn: {
    flex: 2, backgroundColor: '#0B6EFD', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  joinConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});