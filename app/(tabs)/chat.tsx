// filepath: app/(tabs)/chat.tsx
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { Tabs, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  MessageText,
  Send,
  SystemMessage,
} from 'react-native-gifted-chat';

import LocationMessageBubble from '../../components/LocationMessageBubble';
import type { DeliveryStatus, LocationMessage, LocationPayload } from '../../types/chat';
import { getCurrentLocation } from '../../utils/location';
import { useMessaging } from '../context/MessagingContext';

// ── 常數 ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS       = 4000;
const GROUP_POLL_INTERVAL_MS = 5000;
const MY_USER_ID  = 1;
const BOT_USER_ID = 2;

// ── 型別 ──────────────────────────────────────────────────────────────────────

type ChatMode = 'peer' | 'group' | null;

type ChatState = {
  messages: LocationMessage[];
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
  message_id?: string;
  from_hash?: string;
  to_hash?: string;
  content?: string;
  status?: string;       // 'delivered' = 自己發的, 'received' = 別人發的
  timestamp?: number;
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 8)}…` : '—');

// 群組封包（invite / message / joined）會透過 RNS 點對點通道傳送，
// 後端會將它們存入直接訊息記錄。此函式偵測這些封包以便在 P2P 聊天介面過濾掉。
const isGroupPacket = (content?: string): boolean => {
  if (!content) return false;
  try {
    const p = JSON.parse(content);
    if (typeof p !== 'object' || p === null) return false;
    // Support compact key (pkt_type) and legacy key (packet_type).
    // PacketType enum was shortened: group→g, group_system→gs, broadcast→b.
    // Subtypes use colon notation e.g. "gs:f" — compare base only.
    const pt: string = p.pkt_type || p.packet_type || '';
    const base = pt.split(':')[0];
    return base === 'g' || base === 'gs' || base === 'b'
        || base === 'group' || base === 'group_system' || base === 'broadcast';
  } catch {
    return false;
  }
};

// 解析訊息文字中的位置資訊（涵蓋有無 📍 前綴的格式）
const LOCATION_MESSAGE_RE =
  /(?:📍\s*)?Location:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;

const parseLocationMessage = (text: string): LocationPayload | undefined => {
  const match = text.match(LOCATION_MESSAGE_RE);
  if (!match) return undefined;
  const latitude  = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
};

const withLocationPayload = <T extends LocationMessage>(message: T): T => {
  const location = parseLocationMessage(message.text);
  return location ? { ...message, location } : message;
};

const rawPeerMsgToIMessage = (m: RawPeerMsg, _idx: number): LocationMessage => {
  const isSelf = m.status !== 'received';
  return withLocationPayload({
    _id:            m.message_id ?? [m.timestamp, m.from_hash?.slice(0, 8), (m.content ?? '').slice(0, 16)].join('_'),
    text:           m.content ?? '',
    createdAt:      m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
    user:           { _id: isSelf ? MY_USER_ID : BOT_USER_ID },
    deliveryStatus: isSelf ? (m.status as DeliveryStatus) : undefined,
  });
};

const rawGroupMsgToIMessage = (
  m: RawGroupMsg,
  _idx: number,
  selfName?: string,
  localDestHash?: string | null,
): LocationMessage => {
  const isSystem = m.message_type === 'GROUP_SYSTEM' || m.message_type === 'GROUP_INVITE' || m.message_type === 'GROUP_JOIN';
  const isSelf =
    (!!localDestHash && m.from_hash === localDestHash) ||
    m.status === 'delivered' ||
    (!!selfName && !!m.from_name && m.from_name === selfName);
  const senderName = isSelf
    ? (selfName ?? m.from_name ?? '我')
    : (m.from_name ?? (m.from_hash ? shortHash(m.from_hash) : '成員'));

  return withLocationPayload({
    _id:       m.message_id ?? [m.timestamp, m.from_hash?.slice(0, 8), (m.content ?? '').slice(0, 16)].join('_'),
    text:      m.content ?? '',
    createdAt: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
    system:    isSystem,
    user: isSystem
      ? { _id: 0 }
      : {
          _id:  isSelf ? MY_USER_ID : (m.from_hash ?? m.from_name ?? BOT_USER_ID),
          name: senderName,
        },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 主元件
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const {
    baseUrl,
    localDestHash,
    lobbyPeers:    lobbyPeersRaw,
    groupRooms:    groupRoomsRaw,
  } = useMessaging();

  const lobbyPeers   = lobbyPeersRaw ?? [];
  const groupRooms   = groupRoomsRaw ?? [];
  const headerHeight = useHeaderHeight();

  // ── 選擇狀態：純字串，不存物件，從根本避免無限迴圈 ──────────────────────
  const [chatMode, setChatMode]                   = useState<ChatMode>(null);
  const [selectedPeerHash, setSelectedPeerHash]   = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  // 從 contacts 頁導航時帶入的顯示名稱（用於 peer 不在 lobby 時的 fallback）
  const [selectedPeerDisplayName, setSelectedPeerDisplayName] = useState<string | null>(null);

  // ── 訊息快取 ──────────────────────────────────────────────────────────────
  const chatStatesRef = useRef<Record<string, ChatState>>({});
  const [messages, setMessages] = useState<LocationMessage[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);

  // ── 群組成員選單 ──────────────────────────────────────────────────────────
  const [showMemberMenu, setShowMemberMenu] = useState(false);

  // ── ref：供非同步回調讀取最新狀態，不觸發 effect ─────────────────────────
  const chatModeRef      = useRef<ChatMode>(null);
  const selectedPeerRef  = useRef<string | null>(null);
  const selectedGroupRef = useRef<string | null>(null);
  const lobbyPeersRef      = useRef(lobbyPeers);
  const groupRoomsRef      = useRef(groupRooms);
  const localDestHashRef   = useRef(localDestHash);

  useEffect(() => { chatModeRef.current = chatMode; },             [chatMode]);
  useEffect(() => { selectedPeerRef.current = selectedPeerHash; }, [selectedPeerHash]);
  useEffect(() => { selectedGroupRef.current = selectedGroupName; },[selectedGroupName]);
  useEffect(() => { lobbyPeersRef.current = lobbyPeers; },          [lobbyPeers]);
  useEffect(() => { groupRoomsRef.current = groupRooms; },          [groupRooms]);
  useEffect(() => { localDestHashRef.current = localDestHash; },    [localDestHash]);

  // ── 衍生：當前 peer / room 物件（純渲染用，不用於 effect 依賴）───────────
  const currentPeer  = lobbyPeers.find(p => p.dest_hash === selectedPeerHash) ?? null;
  const currentGroup = groupRooms.find(r => r.group_name === selectedGroupName) ?? null;
  const isGroupMode  = chatMode === 'group';

  // ── 快取更新：透過 ref 讀取當前狀態，避免 setState 觸發 effect ───────────
  const applyMessages = useCallback((key: string, msgs: LocationMessage[], knownCount?: number) => {
    const prev = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
    chatStatesRef.current[key] = { messages: msgs, knownCount: knownCount ?? prev.knownCount };
    const mode  = chatModeRef.current;
    const pHash = selectedPeerRef.current;
    const gName = selectedGroupRef.current;
    const curKey = mode === 'peer' ? `peer:${pHash}` : mode === 'group' ? `group:${gName}` : '';
    if (curKey === key) setMessages(msgs);
  }, []);

  // ── 輪詢函式（抽出為 useCallback 供 select* 切換後立即觸發）─────────────
  const pollPeer = useCallback(async () => {
    const hash = selectedPeerRef.current;
    if (!hash) return;
    const key = `peer:${hash}`;
    try {
      // Try /getChat first (saved contacts + blocked peers).
      // Fall back to /getDirectChat on 404 (unsaved peers).
      // This avoids relying on is_saved_contact from the lobby snapshot,
      // which can be stale or incorrect due to link-registration timing.
      let res = await fetch(`${baseUrl}/getChat/${encodeURIComponent(hash)}`, { headers: { Accept: 'application/json' } });
      if (res.status === 404) {
        res = await fetch(`${baseUrl}/getDirectChat/${encodeURIComponent(hash)}`, { headers: { Accept: 'application/json' } });
      }
      if (!res.ok) return;
      const json = await res.json();
      const rawMsgs: RawPeerMsg[] = json?.messages ?? json?.data?.messages ?? [];
      const converted = rawMsgs
        .filter(m => !isGroupPacket(m.content))
        .map((m, i) => rawPeerMsgToIMessage(m, i))
        .reverse();
      applyMessages(key, converted);
    } catch { /* 靜默 */ }
  }, [baseUrl, applyMessages]);

  const pollGroup = useCallback(async () => {
    const groupName = selectedGroupRef.current;
    if (!groupName) return;
    const key = `group:${groupName}`;
    const room = groupRoomsRef.current.find(r => r.group_name === groupName);
    const groupKey = room?.group_id || groupName;
    try {
      const res = await fetch(`${baseUrl}/getGroupChat/${encodeURIComponent(groupKey)}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const json = await res.json();
      const rawMsgs: RawGroupMsg[] = json?.data?.messages ?? [];
      const selfName: string | undefined = json?.data?.group_room?.self_name;
      const converted = rawMsgs.map((m, i) => rawGroupMsgToIMessage(m, i, selfName, localDestHashRef.current)).reverse();
      applyMessages(key, converted);
    } catch { /* 靜默 */ }
  }, [baseUrl, applyMessages]);

  // ── 切換對話目標 ──────────────────────────────────────────────────────────

  const selectPeer = useCallback((hash: string, displayName?: string) => {
    chatModeRef.current = 'peer';
    selectedPeerRef.current = hash;
    setChatMode('peer');
    setSelectedPeerHash(hash);
    if (displayName) setSelectedPeerDisplayName(displayName);
    const key = `peer:${hash}`;
    setMessages(chatStatesRef.current[key]?.messages ?? []);
    void pollPeer();
  }, [pollPeer]);

  const selectGroup = useCallback((name: string) => {
    chatModeRef.current = 'group';
    selectedGroupRef.current = name;
    setChatMode('group');
    setSelectedGroupName(name);
    const key = `group:${name}`;
    setMessages(chatStatesRef.current[key]?.messages ?? []);
    void pollGroup();
  }, [pollGroup]);

  // ── 從 contacts tab 導航過來時自動選取目標 ───────────────────────────────
  const { dest_hash: navDestHash, group_name: navGroupName, peer_name: navPeerName } =
    useLocalSearchParams<{ dest_hash?: string; group_name?: string; peer_name?: string }>();

  useEffect(() => {
    if (!navDestHash) return;
    selectPeer(String(navDestHash), navPeerName ? String(navPeerName) : undefined);
    router.setParams({ dest_hash: '', peer_name: '' });
  }, [navDestHash, selectPeer]);

  useEffect(() => {
    if (!navGroupName) return;
    selectGroup(String(navGroupName));
    router.setParams({ group_name: '' });
  }, [navGroupName, selectGroup]);

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
    setSelectedPeerDisplayName(null);
  }, [baseUrl]);

  // ── 一對一輪詢 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (chatModeRef.current === 'peer') void pollPeer();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pollPeer]);

  // ── 群組輪詢 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (chatModeRef.current === 'group') void pollGroup();
    }, GROUP_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pollGroup]);

  // ── 發送 ──────────────────────────────────────────────────────────────────
  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    const mode  = chatModeRef.current;
    const hash  = selectedPeerRef.current;
    const gname = selectedGroupRef.current;
    if (!mode) return;

    const key   = mode === 'peer' ? `peer:${hash}` : `group:${gname}`;
    const state = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
    const grp = mode === 'group' ? groupRoomsRef.current.find(r => r.group_name === gname) : null;
    const outgoingMessages = mode === 'group'
      ? newMessages.map(message => ({
          ...message,
          user: { ...message.user, name: grp?.self_name ?? '我' },
        }))
      : newMessages;
    applyMessages(key, GiftedChat.append(state.messages, outgoingMessages) as LocationMessage[]);

    for (const msg of outgoingMessages) {
      try {
        if (mode === 'group') {
          await fetch(`${baseUrl}/msgGroup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ group_id: grp?.group_id, group_name: gname, message: msg.text }),
          });
        } else {
          // Try /msgContact first; fall back to /msgDirect on 404 (unsaved peer).
          const sendRes = await fetch(`${baseUrl}/msgContact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ dest_hash: hash, message: msg.text }),
          });
          if (sendRes.status === 404) {
            await fetch(`${baseUrl}/msgDirect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ dest_hash: hash, message: msg.text }),
            });
          }
        }
      } catch { /* 靜默 */ }
    }
  }, [baseUrl, applyMessages, lobbyPeersRaw, groupRoomsRaw]);

  // ── 分享位置 ──────────────────────────────────────────────────────────────
  const sendLocation = useCallback(async () => {
    const mode  = chatModeRef.current;
    const hash  = selectedPeerRef.current;
    const gname = selectedGroupRef.current;
    if (!mode) return;

    setLocationLoading(true);
    try {
      const { latitude, longitude } = await getCurrentLocation();
      const grp = mode === 'group' ? groupRoomsRef.current.find(r => r.group_name === gname) : null;

      const locationMsg: LocationMessage = {
        _id: `loc_${Date.now()}`,
        text: `📍 Location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        createdAt: new Date(),
        user: {
          _id: MY_USER_ID,
          name: mode === 'group' ? (grp?.self_name ?? '我') : undefined,
        },
        location: { latitude, longitude },
        offlineStatus: 'queued',
      };

      // Append to local chat state
      const key   = mode === 'peer' ? `peer:${hash}` : `group:${gname}`;
      const state = chatStatesRef.current[key] ?? { messages: [], knownCount: 0 };
      applyMessages(key, GiftedChat.append(state.messages, [locationMsg]) as LocationMessage[]);

      // Send as plain text over the wire
      try {
        if (mode === 'group') {
          await fetch(`${baseUrl}/msgGroup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ group_id: grp?.group_id, group_name: gname, message: locationMsg.text }),
          });
        } else {
          const locSendRes = await fetch(`${baseUrl}/msgContact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ dest_hash: hash, message: locationMsg.text }),
          });
          if (locSendRes.status === 404) {
            await fetch(`${baseUrl}/msgDirect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ dest_hash: hash, message: locationMsg.text }),
            });
          }
        }
        // Mark as sent
        locationMsg.offlineStatus = 'sent';
      } catch {
        locationMsg.offlineStatus = 'failed';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'PERMISSION_DENIED') {
        Alert.alert('需要定位權限', '請前往設定開啟定位權限以分享位置。');
      } else {
        Alert.alert('定位失敗', '無法取得目前位置，請稍後再試。');
      }
    } finally {
      setLocationLoading(false);
    }
  }, [baseUrl, applyMessages, lobbyPeersRaw, groupRoomsRaw]);

  // ── GiftedChat 渲染函式 ───────────────────────────────────────────────────

  const renderCustomView = (props: any) => {
    const msg = props.currentMessage as LocationMessage;
    if (!msg?.location) return null;
    return <LocationMessageBubble currentMessage={msg} />;
  };

  const renderMessageText = (props: any) => {
    const msg = props.currentMessage as LocationMessage;
    if (msg?.location) return null;
    return <MessageText {...props} />;
  };

  const renderActions = (props: any) => {
    const canAct = !!chatMode;
    return (
      <TouchableOpacity
        style={styles.locationBtn}
        onPress={sendLocation}
        disabled={!canAct || locationLoading}
        activeOpacity={0.6}
      >
        {locationLoading ? (
          <ActivityIndicator size={20} color={isGroupMode ? '#0B6EFD' : '#00C853'} />
        ) : (
          <Ionicons
            name="location-sharp"
            size={24}
            color={canAct ? (isGroupMode ? '#0B6EFD' : '#00C853') : '#AAAAAA'}
          />
        )}
      </TouchableOpacity>
    );
  };

  const renderBubble = (props: any) => {
    const currentMessage = props.currentMessage as LocationMessage | undefined;
    const isMe = currentMessage?.user?._id === MY_USER_ID;
    const showSenderName = isGroupMode && !!currentMessage && !currentMessage.system;
    const senderName = isMe ? '我' : (currentMessage?.user?.name ?? '成員');

    return (
      <View>
        {showSenderName && (
          <Text
            style={[styles.senderName, isMe ? styles.senderNameRight : styles.senderNameLeft]}
            numberOfLines={1}
          >
            {senderName}
          </Text>
        )}
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
          isUsernameVisible={false}
        />
        {isMe && !isGroupMode && (() => {
          const ds = currentMessage?.deliveryStatus;
          if (ds === 'send_timeout') {
            return <View style={styles.tickContainer}><Text style={[styles.tick, styles.tickTimeout]}>✕</Text></View>;
          }
          if (ds === 'delivered') {
            return <View style={styles.tickContainer}><Text style={styles.tick}>✓✓</Text></View>;
          }
          return <View style={styles.tickContainer}><Text style={[styles.tick, styles.tickPending]}>✓</Text></View>;
        })()}
      </View>
    );
  };

  const renderPeerAvatar = useCallback((_props: any) => {
    const name = currentPeer?.nickname || currentPeer?.announced_name
      || selectedPeerDisplayName
      || (selectedPeerHash ? shortHash(selectedPeerHash) : '?');
    return (
      <View style={styles.peerAvatarCircle}>
        <Text style={styles.peerAvatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>
      </View>
    );
  }, [currentPeer, selectedPeerDisplayName, selectedPeerHash]);

  const renderSystemMessage = (props: any) => (
    <SystemMessage {...props} containerStyle={styles.sysContainer} textStyle={styles.sysText} />
  );

  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={styles.primaryStyle}
    />
  );

  const renderSend = (props: any) => {
    const hasText = props.text?.trim().length > 0;
    const canSend = hasText && !!chatMode;
    return (
      <Send {...props} disabled={!canSend} containerStyle={styles.sendContainer}>
        <Ionicons name="send" size={24} color={canSend ? (isGroupMode ? '#0B6EFD' : '#00C853') : '#AAAAAA'} />
      </Send>
    );
  };

  const inputPlaceholder = () => {
    if (!chatMode)   return '請先選擇使用者/群組';
    if (isGroupMode) return `傳送至 ${selectedGroupName}`;
    return '輸入訊息';
  };

  useEffect(() => { if (chatMode !== 'group') setShowMemberMenu(false); }, [chatMode]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Tabs.Screen
        options={{
          headerRight: chatMode === 'group' ? () => (
            <TouchableOpacity
              style={{ marginRight: 14, padding: 4 }}
              onPress={() => setShowMemberMenu(v => !v)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="people"
                size={22}
                color={showMemberMenu ? '#0B6EFD' : '#555'}
              />
            </TouchableOpacity>
          ) : undefined,
          headerTitle: () => {
            const isOnline = chatMode === 'peer' && !!currentPeer?.online;
            const dotColor = chatMode === 'peer'
              ? (isOnline ? '#00C853' : '#BBBBBB')
              : chatMode === 'group' ? '#0B6EFD' : 'transparent';
            const dotRadius = chatMode === 'group' ? 2 : 4;
            const peerLabel = currentPeer
              ? (currentPeer.nickname || currentPeer.announced_name || shortHash(currentPeer.dest_hash))
              : selectedPeerDisplayName || (selectedPeerHash ? shortHash(selectedPeerHash) : 'SNS對話');
            const label = chatMode === 'peer'
              ? peerLabel
              : chatMode === 'group' && currentGroup
              ? currentGroup.group_name
              : 'SNS對話';
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 8, height: 8, borderRadius: dotRadius, backgroundColor: dotColor }} />
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#222222' }}>{label}</Text>
              </View>
            );
          },
        }}
      />
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F6" />

      {/* ── 群組成員選單 ── */}
      {showMemberMenu && chatMode === 'group' && currentGroup && (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={0}
            onPress={() => setShowMemberMenu(false)}
          />
          <View style={styles.memberMenu}>
            {(() => {
              const allMembers   = currentGroup.members ?? [];
              const otherMembers = allMembers.filter(m => m.dest_hash !== localDestHash);
              return (
                <>
                  <Text style={styles.memberMenuTitle}>
                    {currentGroup.group_name}  ·  {allMembers.length} 人
                  </Text>
                  {otherMembers.length === 0 ? (
                    <Text style={styles.memberMenuEmpty}>尚無其他成員</Text>
                  ) : (
                    otherMembers.map(member => {
                      const isOnline = lobbyPeers.find(p => p.dest_hash === member.dest_hash)?.online;
                      const name = member.display_name || shortHash(member.dest_hash);
                      return (
                        <View key={member.dest_hash} style={styles.memberRow}>
                          <View style={[styles.memberDot, isOnline ? styles.memberDotOnline : styles.memberDotOffline]} />
                          <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                        </View>
                      );
                    })
                  )}
                </>
              );
            })()}
          </View>
        </>
      )}

      {/* ── 對話區 ── */}
      <View style={{ flex: 1 }}>
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={{ _id: MY_USER_ID }}
          renderBubble={renderBubble}
          renderSystemMessage={renderSystemMessage}
          renderMessageText={renderMessageText}
          renderInputToolbar={renderInputToolbar}
          renderSend={renderSend}
          renderCustomView={renderCustomView}
          renderActions={renderActions}
          renderAvatar={isGroupMode ? undefined : renderPeerAvatar}
          messagesContainerStyle={{ backgroundColor: isGroupMode ? '#E8EFF8' : '#E5DDD5' }}
          keyboardAvoidingViewProps={{
            keyboardVerticalOffset: headerHeight,
          }}
          textInputProps={{
            placeholder: inputPlaceholder(),
            placeholderTextColor: '#999',
            style: { fontSize: 16, color: '#000' },
            editable: !!chatMode,
          }}
          listProps={{ keyboardShouldPersistTaps: 'handled' }}
          isSendButtonAlwaysVisible
          isScrollToBottomEnabled
          scrollToBottomOffset={100}
          timeFormat="HH:mm"
          dateFormat="YYYY年M月D日"
        />
      </View>

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 樣式
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F6' },

  // ── Header ──
  header: {
    height: 66,
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

  // ── 模式標題（個人對話 / 群組）──
  modeBtnTitle:      { fontSize: 13, fontWeight: '700', color: '#999', letterSpacing: 0.2 },
  modeBtnTitlePeer:  { color: '#1A6B3C' },
  modeBtnTitleGroup: { color: '#0B4FA8' },
  modeBtnSub:        { fontSize: 12, color: '#555', marginTop: 1 },

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
  primaryStyle: {
    borderRadius: 22, backgroundColor: '#FFFFFF',
    borderWidth: 0.5, borderColor: '#E0E0E0',
    paddingHorizontal: 12, marginHorizontal: 8,
  },
  sendContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 12, marginBottom: 8 },
  locationBtn: {
    justifyContent: 'center', alignItems: 'center',
    width: 40, height: 44,
    marginLeft: 4, marginBottom: 4,
  },
  tickContainer: { alignItems: 'flex-end', marginRight: 8, marginTop: -4 },
  tick:          { fontSize: 12, color: 'rgba(0,0,0,0.4)' },
  tickPending:   { color: 'rgba(0,0,0,0.22)' },
  tickTimeout:   { color: '#FF3B30' },
  senderName: {
    maxWidth: 220,
    marginBottom: 3,
    fontSize: 12,
    fontWeight: '700',
    color: '#5D6878',
  },
  senderNameLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  senderNameRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
    color: '#315F9F',
  },

  // ── 系統訊息 ──
  sysContainer: { marginVertical: 8 },
  sysText: {
    color: '#888', fontSize: 12, textAlign: 'center',
    fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
    overflow: 'hidden',
  },

  // ── 群組成員選單 ──
  memberMenu: {
    position: 'absolute',
    top: 6,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    zIndex: 200,
  },
  memberMenuTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  memberMenuEmpty: { fontSize: 13, color: '#AAA' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  memberDot:        { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  memberDotOnline:  { backgroundColor: '#00C853' },
  memberDotOffline: { backgroundColor: '#BBBBBB' },
  memberName:       { fontSize: 14, color: '#222', flex: 1 },

  // ── P2P 頭像 ──
  peerAvatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#888888',
    alignItems: 'center', justifyContent: 'center',
  },
  peerAvatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
