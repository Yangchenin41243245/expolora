// filepath: app/(tabs)/index.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
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
import { GroupRoom, useMessaging } from '../context/MessagingContext';

// ── 常數 ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS       = 4000;
const GROUP_POLL_INTERVAL_MS = 5000;
const MY_USER_ID  = 1;
const BOT_USER_ID = 2;

const SYSTEM_PREFIXES = [
  '[SYSTEM]', '[OUT]', '[SEND COMPLETE]', '[PACKET]',
  '[PACKET RECV]', '[IN]', '[ERROR]', '[WARN]', '[INFO]', '[RECEIPT TIMEOUT]',
];

const isSystemLine = (raw: string): boolean => {
  const t = raw.trim();
  if (t === '') return true;
  return SYSTEM_PREFIXES.some(p => t.startsWith(p));
};

// ── 型別 ──────────────────────────────────────────────────────────────────────

type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  custom_nickname?: string;
  is_saved_contact?: boolean;
  online?: boolean;
};

// 聊天模式：一對一 或 群組
type ChatTarget =
  | { kind: 'peer';  peer: LobbyPeer }
  | { kind: 'group'; room: GroupRoom };

// 每個對話目標獨立儲存訊息快取與已知長度
type ChatState = {
  messages: IMessage[];
  knownCount: number; // 僅用於一對一 /messages 輪詢
};

// 後端群組訊息原始型別
type RawGroupMsg = {
  message_type: 'GROUP' | 'GROUP_INVITE' | 'GROUP_SYSTEM';
  content?: string;
  sender?: string;
  sender_name?: string;
  timestamp?: number;
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 10)}…` : '—');

const chatKey = (target: ChatTarget | null): string => {
  if (!target) return '';
  return target.kind === 'peer'
    ? `peer:${target.peer.dest_hash}`
    : `group:${target.room.group_name}`;
};

const peerDisplayName = (peer: LobbyPeer): string =>
  peer.custom_nickname || peer.announced_name || shortHash(peer.dest_hash);

const peerSubtitle = (peer: LobbyPeer): string => {
  if (peer.is_saved_contact) {
    return peer.custom_nickname ? (peer.announced_name ?? '') : '';
  }
  return `未知節點 · ${shortHash(peer.dest_hash)}`;
};

// 將後端群組訊息轉為 GiftedChat IMessage
const rawGroupMsgToIMessage = (m: RawGroupMsg, idx: number): IMessage => {
  const isSelf   = m.sender === 'self' || m.sender === 'me';
  const isSystem = m.message_type === 'GROUP_SYSTEM' || m.message_type === 'GROUP_INVITE';

  return {
    _id:       `grp_${idx}_${m.timestamp ?? idx}`,
    text:      m.content ?? '',
    createdAt: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
    system:    isSystem,
    user: isSystem
      ? { _id: 0 }
      : { _id: isSelf ? MY_USER_ID : BOT_USER_ID, name: m.sender_name ?? 'Member' },
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

  // Context 可能在初始化前尚未提供值，全部加防禦預設值
  const lobbyPeers    = lobbyPeersRaw    ?? [];
  const groupRooms    = groupRoomsRaw    ?? [];
  const refreshGroups = refreshGroupsRaw ?? (async () => {});

  // ── 目前選中的對話目標 ────────────────────────────────────────────────────
  const [chatTarget, setChatTarget]     = useState<ChatTarget | null>(null);
  const [showPicker, setShowPicker]     = useState(false);
  const chatTargetRef = useRef<ChatTarget | null>(null);

  // ── 每個對話快取（key = chatKey()）──────────────────────────────────────
  const chatStatesRef = useRef<Record<string, ChatState>>({});
  const [messages, setMessages]         = useState<IMessage[]>([]);

  // ── 加入確認 Modal ────────────────────────────────────────────────────────
  const [showJoinModal, setShowJoinModal] = useState(false);

  // ── 當 chatTarget 變更時，載入對應快取 ───────────────────────────────────
  useEffect(() => {
    chatTargetRef.current = chatTarget;
    if (!chatTarget) { setMessages([]); return; }
    const key    = chatKey(chatTarget);
    const cached = chatStatesRef.current[key];
    setMessages(cached?.messages ?? []);
  }, [chatTarget]);

  // ── Lobby 更新時同步 peer metadata ───────────────────────────────────────
  useEffect(() => {
    if (!chatTarget) {
      if (lobbyPeers.length > 0 && groupRooms.length === 0) {
        setChatTarget({ kind: 'peer', peer: lobbyPeers[0] as LobbyPeer });
      }
      return;
    }
    if (chatTarget.kind === 'peer') {
      const updated = lobbyPeers.find(p => p.dest_hash === chatTarget.peer.dest_hash);
      if (updated) setChatTarget({ kind: 'peer', peer: updated as LobbyPeer });
    }
    if (chatTarget.kind === 'group') {
      const updated = groupRooms.find(r => r.group_name === chatTarget.room.group_name);
      if (updated) setChatTarget({ kind: 'group', room: updated });
    }
  }, [lobbyPeers, groupRooms]);

  // ── baseUrl 變更時全部重置 ────────────────────────────────────────────────
  const prevBaseUrl = useRef(baseUrl);
  useEffect(() => {
    if (prevBaseUrl.current === baseUrl) return;
    prevBaseUrl.current = baseUrl;
    chatStatesRef.current = {};
    setMessages([]);
    setChatTarget(null);
    chatTargetRef.current = null;
  }, [baseUrl]);

  // ── 更新快取並刷新畫面（若仍在同一對話中）───────────────────────────────
  const applyMessages = useCallback((key: string, msgs: IMessage[], knownCount?: number) => {
    const prev = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
    chatStatesRef.current[key] = {
      messages: msgs,
      knownCount: knownCount ?? prev.knownCount,
    };
    if (chatKey(chatTargetRef.current) === key) {
      setMessages(msgs);
    }
  }, []);

  // ── 一對一輪詢（/messages）───────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const target = chatTargetRef.current;
      if (!target || target.kind !== 'peer') return;
      const key  = chatKey(target);
      const hash = target.peer.dest_hash;

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
        const state = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
        if (lines.length <= state.knownCount) return;

        const newLines = lines.slice(state.knownCount);
        const incoming: IMessage[] = newLines
          .filter(l => !isSystemLine(l))
          .map((l, i) => ({
            _id:       `recv_${state.knownCount + i}_${l.slice(0, 16)}`,
            text:      l.trim(),
            createdAt: new Date(),
            user:      { _id: BOT_USER_ID, name: 'Peer' },
          }));

        const updated = incoming.length > 0
          ? GiftedChat.append(state.messages, incoming)
          : state.messages;

        applyMessages(key, updated, lines.length);
      } catch { /* 靜默 */ }
    };

    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [baseUrl, applyMessages]);

  // ── 群組輪詢（/getGroupChat）─────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const target = chatTargetRef.current;
      if (!target || target.kind !== 'group') return;
      const key       = chatKey(target);
      const groupName = target.room.group_name;

      try {
        const res = await fetch(`${baseUrl}/getGroupChat/${groupName}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const json = await res.json();
        const rawMsgs: RawGroupMsg[] = json?.data?.messages ?? [];

        // 群組訊息全量替換（後端為完整歷史）
        const converted = rawMsgs.map(rawGroupMsgToIMessage).reverse(); // GiftedChat 最新在前
        applyMessages(key, converted);
      } catch { /* 靜默 */ }
    };

    poll();
    const t = setInterval(poll, GROUP_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [baseUrl, applyMessages]);

  // ── 發送訊息 ──────────────────────────────────────────────────────────────
  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const target = chatTargetRef.current;
    if (!target) return;

    // 群組：未加入時不允許發送
    if (target.kind === 'group' && !target.room.join_confirm) {
      setShowJoinModal(true);
      return;
    }

    // 樂觀更新
    const key   = chatKey(target);
    const state = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
    const updated = GiftedChat.append(state.messages, newMessages);
    applyMessages(key, updated);

    for (const msg of newMessages) {
      try {
        if (target.kind === 'group') {
          // 群組發送
          await fetch(`${baseUrl}/msgGroup`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body:    JSON.stringify({ group_name: target.room.group_name, message: msg.text }),
          });
        } else {
          // 一對一發送（已儲存 vs 未儲存）
          const endpoint = target.peer.is_saved_contact ? '/msgContact' : '/msgDirect';
          await fetch(`${baseUrl}${endpoint}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body:    JSON.stringify({ dest_hash: target.peer.dest_hash, message: msg.text }),
          });
        }
      } catch { /* 靜默 */ }
    }
  }, [baseUrl, applyMessages]);

  // ── 快速加入群組（/join 捷徑）────────────────────────────────────────────
  const quickJoinGroup = useCallback(async () => {
    const target = chatTargetRef.current;
    if (!target || target.kind !== 'group') return;
    try {
      await fetch(`${baseUrl}/msgGroup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ group_name: target.room.group_name, message: '/join' }),
      });
      await refreshGroups();
      setShowJoinModal(false);
    } catch { /* 靜默 */ }
  }, [baseUrl, refreshGroups]);

  // ── 衍生狀態 ──────────────────────────────────────────────────────────────
  const isGroupMode      = chatTarget?.kind === 'group';
  const currentGroup     = isGroupMode ? (chatTarget as { kind: 'group'; room: GroupRoom }).room : null;
  const joinPending      = isGroupMode && !currentGroup?.join_confirm;
  const noTargetSelected = !chatTarget;
  const isEmpty          = lobbyPeers.length === 0 && groupRooms.length === 0;

  // ── GiftedChat 自訂渲染 ───────────────────────────────────────────────────

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
          // 群組模式：在氣泡下方顯示發送者名稱（非自己的訊息）
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
    <SystemMessage
      {...props}
      containerStyle={styles.sysContainer}
      textStyle={styles.sysText}
    />
  );

  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={[
        styles.inputToolbar,
        joinPending && styles.inputToolbarBlocked,
      ]}
      primaryStyle={styles.primaryStyle}
    />
  );

  const renderSend = (props: any) => {
    const hasText = props.text?.trim().length > 0;
    const canSend = hasText && !!chatTarget && !joinPending;
    return (
      <Send {...props} disabled={!canSend} containerStyle={styles.sendContainer}>
        <Ionicons
          name="send"
          size={24}
          color={canSend ? (isGroupMode ? '#0B6EFD' : '#00C853') : '#AAAAAA'}
        />
      </Send>
    );
  };

  // ── Header 中間 ───────────────────────────────────────────────────────────
  const HeaderCenter = () => {
    if (isEmpty) {
      return (
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>等待節點…</Text>
          <Text style={styles.headerSub}>Lobby 與群組均為空</Text>
        </View>
      );
    }

    if (!chatTarget) {
      return (
        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowPicker(true)}>
          <Text style={styles.headerName}>選擇對話</Text>
          <Text style={styles.headerSub}>點此選擇節點或群組</Text>
        </TouchableOpacity>
      );
    }

    if (chatTarget.kind === 'peer') {
      const { peer } = chatTarget;
      return (
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.7}
        >
          <View style={styles.headerNameRow}>
            <View style={[styles.onlineDot, peer.online ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.headerName} numberOfLines={1}>
              {peerDisplayName(peer)}
            </Text>
            <Text style={styles.headerChevron}>⌄</Text>
          </View>
          {peerSubtitle(peer) ? (
            <Text style={styles.headerSub} numberOfLines={1}>{peerSubtitle(peer)}</Text>
          ) : null}
        </TouchableOpacity>
      );
    }

    // 群組模式
    const { room } = chatTarget;
    return (
      <TouchableOpacity
        style={styles.headerCenter}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.7}
      >
        <View style={styles.headerNameRow}>
          <View style={styles.groupDot} />
          <Text style={styles.headerName} numberOfLines={1}>{room.group_name}</Text>
          <Text style={styles.headerChevron}>⌄</Text>
        </View>
        <Text style={styles.headerSub} numberOfLines={1}>
          {room.join_confirm
            ? `◈ 群組 · ${room.self_name ?? '未設定名稱'}`
            : '◌ 尚未加入此群組'}
        </Text>
      </TouchableOpacity>
    );
  };

  // ── 加入提示 Banner（群組未加入時覆蓋輸入區上方）────────────────────────
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

  // ── 輸入框提示文字 ────────────────────────────────────────────────────────
  const inputPlaceholder = () => {
    if (isEmpty)      return 'Lobby 無節點，無法傳送';
    if (!chatTarget)  return '請先選擇對話目標';
    if (joinPending)  return '請先加入此群組';
    if (isGroupMode)  return `傳送至 ${currentGroup?.group_name}`;
    return '輸入訊息';
  };

  // ─────────────────────────────────────────────────────────────────────────
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
          messagesContainerStyle={{
            backgroundColor: isGroupMode ? '#E8EFF8' : '#E5DDD5',
          }}
          textInputProps={{
            placeholder: inputPlaceholder(),
            placeholderTextColor: '#999',
            style: { fontSize: 16 },
            editable: !!chatTarget && !joinPending,
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

      {/* ── 對話目標選擇器 Modal ── */}
      <TargetPickerModal
        visible={showPicker}
        lobbyPeers={lobbyPeers as LobbyPeer[]}
        groupRooms={groupRooms}
        currentKey={chatKey(chatTarget)}
        onSelectPeer={(peer) => {
          setChatTarget({ kind: 'peer', peer });
          setShowPicker(false);
        }}
        onSelectGroup={(room) => {
          setChatTarget({ kind: 'group', room });
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />

      {/* ── 快速加入群組 Modal ── */}
      <QuickJoinModal
        visible={showJoinModal}
        groupName={currentGroup?.group_name ?? ''}
        onJoin={quickJoinGroup}
        onClose={() => setShowJoinModal(false)}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TargetPickerModal：節點 + 群組雙區塊選擇器
// ─────────────────────────────────────────────────────────────────────────────

type TargetPickerModalProps = {
  visible: boolean;
  lobbyPeers: LobbyPeer[];
  groupRooms: GroupRoom[];
  currentKey: string;
  onSelectPeer: (peer: LobbyPeer) => void;
  onSelectGroup: (room: GroupRoom) => void;
  onClose: () => void;
};

const TargetPickerModal: React.FC<TargetPickerModalProps> = ({
  visible,
  lobbyPeers: lobbyPeersProp,
  groupRooms: groupRoomsProp,
  currentKey,
  onSelectPeer,
  onSelectGroup,
  onClose,
}) => {
  // props 可能因 Context 初始化時序問題傳入 undefined，加防禦預設值
  const lobbyPeers = lobbyPeersProp ?? [];
  const groupRooms = groupRoomsProp ?? [];
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

  const SectionHeader = ({ label, count }: { label: string; count: number }) => (
    <View style={styles.pickerSection}>
      <Text style={styles.pickerSectionLabel}>{label}</Text>
      <View style={styles.pickerSectionBadge}>
        <Text style={styles.pickerSectionCount}>{count}</Text>
      </View>
    </View>
  );

  const PeerRow = ({ item }: { item: LobbyPeer }) => {
    const key      = `peer:${item.dest_hash}`;
    const selected = key === currentKey;
    const name     = peerDisplayName(item);
    const contact  = !!item.is_saved_contact;

    return (
      <TouchableOpacity
        style={[styles.pickerRow, selected && styles.pickerRowSelected]}
        onPress={() => onSelectPeer(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.pickerAvatar, contact ? styles.avatarContact : styles.avatarUnknown]}>
          <Text style={styles.pickerAvatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={styles.pickerInfo}>
          <View style={styles.pickerNameRow}>
            <View style={[styles.onlineDot, item.online ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.pickerName} numberOfLines={1}>{name}</Text>
            <View style={contact ? styles.tagContact : styles.tagUnknown}>
              <Text style={styles.tagText}>{contact ? '聯絡人' : '未知'}</Text>
            </View>
          </View>
          <Text style={styles.pickerHash}>{shortHash(item.dest_hash)}</Text>
        </View>
        {selected && <Text style={styles.pickerCheck}>✓</Text>}
      </TouchableOpacity>
    );
  };

  const GroupRow = ({ item }: { item: GroupRoom }) => {
    const key      = `group:${item.group_name}`;
    const selected = key === currentKey;

    return (
      <TouchableOpacity
        style={[styles.pickerRow, selected && styles.pickerRowSelected]}
        onPress={() => onSelectGroup(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.pickerAvatar, styles.avatarGroup]}>
          <Text style={styles.pickerAvatarText}>{item.group_name[0]?.toUpperCase() ?? '#'}</Text>
        </View>
        <View style={styles.pickerInfo}>
          <View style={styles.pickerNameRow}>
            <View style={styles.groupDotSmall} />
            <Text style={styles.pickerName} numberOfLines={1}>{item.group_name}</Text>
            <View style={item.join_confirm ? styles.tagJoined : styles.tagPending}>
              <Text style={styles.tagText}>{item.join_confirm ? '已加入' : '待加入'}</Text>
            </View>
          </View>
          <Text style={styles.pickerHash}>
            {item.self_name ? `你：${item.self_name}` : '尚未設定名稱'}
          </Text>
        </View>
        {selected && <Text style={styles.pickerCheck}>✓</Text>}
      </TouchableOpacity>
    );
  };

  // 組合成單一 FlatList data
  type ListItem =
    | { _type: 'header_peer' }
    | { _type: 'peer';  data: LobbyPeer }
    | { _type: 'header_group' }
    | { _type: 'group'; data: GroupRoom }
    | { _type: 'empty_peer' }
    | { _type: 'empty_group' };

  const listData: ListItem[] = [
    { _type: 'header_peer' },
    ...(lobbyPeers.length > 0
      ? lobbyPeers.map(p => ({ _type: 'peer' as const, data: p }))
      : [{ _type: 'empty_peer' as const }]),
    { _type: 'header_group' },
    ...(groupRooms.length > 0
      ? groupRooms.map(r => ({ _type: 'group' as const, data: r }))
      : [{ _type: 'empty_group' as const }]),
  ];

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item._type) {
      case 'header_peer':
        return <SectionHeader label="👤  節點" count={lobbyPeers.length} />;
      case 'header_group':
        return <SectionHeader label="◈  群組" count={groupRooms.length} />;
      case 'peer':
        return <PeerRow item={item.data} />;
      case 'group':
        return <GroupRow item={item.data} />;
      case 'empty_peer':
        return <View style={styles.pickerEmpty}><Text style={styles.pickerEmptyText}>Lobby 中無活躍節點</Text></View>;
      case 'empty_group':
        return <View style={styles.pickerEmpty}><Text style={styles.pickerEmptyText}>尚無群組，前往「群組」頁建立</Text></View>;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.pickerSheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.pickerHeader}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>選擇對話目標</Text>
          <Text style={styles.pickerCount}>
            {lobbyPeers.length} 節點 · {groupRooms.length} 群組
          </Text>
        </View>
        <FlatList
          data={listData}
          keyExtractor={(item, idx) => {
            if (item._type === 'peer')  return `peer_${item.data.dest_hash}`;
            if (item._type === 'group') return `group_${item.data.group_name}`;
            return `${item._type}_${idx}`;
          }}
          renderItem={renderItem}
          style={styles.pickerList}
          ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
        />
      </Animated.View>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// QuickJoinModal：群組快速加入確認
// ─────────────────────────────────────────────────────────────────────────────

type QuickJoinModalProps = {
  visible: boolean;
  groupName: string;
  onJoin: () => Promise<void>;
  onClose: () => void;
};

const QuickJoinModal: React.FC<QuickJoinModalProps> = ({
  visible, groupName, onJoin, onClose,
}) => {
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
              <Text style={styles.joinConfirmText}>
                {loading ? '加入中…' : '⊕ 快速加入'}
              </Text>
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
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerName: {
    fontSize: 17, fontWeight: '600', color: '#000',
    textAlign: 'center', maxWidth: 200,
  },
  headerChevron: { fontSize: 13, color: '#888', marginTop: 1 },
  headerSub:     { fontSize: 11, color: '#888', marginTop: 1 },

  // ── 在線 / 群組 點 ──
  onlineDot:  { width: 7, height: 7, borderRadius: 4 },
  dotOnline:  { backgroundColor: '#00C853' },
  dotOffline: { backgroundColor: '#BBBBBB' },
  groupDot: {
    width: 8, height: 8, borderRadius: 2,
    backgroundColor: '#0B6EFD',
  },
  groupDotSmall: {
    width: 7, height: 7, borderRadius: 2,
    backgroundColor: '#0B6EFD',
  },

  // ── GiftedChat ──
  inputToolbar: {
    backgroundColor: '#F6F6F6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8D8D8',
    paddingVertical: 6,
  },
  inputToolbarBlocked: {
    backgroundColor: '#F0F0F0',
    opacity: 0.6,
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
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
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

  // ── Picker Modal 遮罩 ──
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },

  // ── Picker Sheet ──
  pickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '72%',
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
  pickerList:  { paddingBottom: 32 },
  pickerSep:   { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F0', marginLeft: 72 },

  // ── Section Header ──
  pickerSection: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
    backgroundColor: '#FAFAFA',
  },
  pickerSectionLabel: { fontSize: 12, fontWeight: '700', color: '#555' },
  pickerSectionBadge: {
    backgroundColor: '#EEEEEE', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  pickerSectionCount: { fontSize: 11, color: '#888' },

  // ── Picker 列 ──
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    backgroundColor: '#FFFFFF',
  },
  pickerRowSelected: { backgroundColor: '#F0F8FF' },
  pickerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarContact: { backgroundColor: '#1A6B3C' },
  avatarUnknown: { backgroundColor: '#555555' },
  avatarGroup:   { backgroundColor: '#0B4FA8', borderRadius: 11 },
  pickerAvatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  pickerInfo:   { flex: 1 },
  pickerNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerName:   { fontSize: 15, fontWeight: '600', color: '#111', flexShrink: 1 },
  pickerHash:   { fontSize: 11, color: '#999', marginTop: 2 },
  pickerCheck:  { fontSize: 18, color: '#00C853', fontWeight: '700' },
  pickerEmpty: { paddingHorizontal: 16, paddingVertical: 12 },
  pickerEmptyText: { fontSize: 13, color: '#AAA' },

  // ── 標籤 ──
  tagContact: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  tagUnknown: { backgroundColor: '#F3F3F3', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  tagJoined:  { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  tagPending: { backgroundColor: '#FFF8E1', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  tagText:    { fontSize: 10, color: '#555', fontWeight: '600' },

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
  joinModalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12 },
  joinModalBody: {
    fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 20,
  },
  joinModalGroupName: {
    color: '#0B6EFD', fontWeight: '700', fontSize: 15,
  },
  joinModalActions: { flexDirection: 'row', gap: 10 },
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