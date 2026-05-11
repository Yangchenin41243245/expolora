// filepath: app/(tabs)/groups.tsx
import { Tabs } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  GroupMember,
  GroupRoom,
  useMessaging,
} from '../context/MessagingContext';

// ── 顏色常數（與整體 App 一致）─────────────────────────────────────────────

const C = {
  bg:           '#0f1117',
  surface:      '#1a1d27',
  surface2:     '#12141e',
  surface3:     '#0d0f18',
  border:       '#1e2130',
  accent:       '#4a90e2',
  accentDim:    '#2a5298',
  accentGlow:   'rgba(74,144,226,0.12)',
  text:         '#e0e0e0',
  textDim:      '#8a8d9a',
  textMute:     '#3a3d4a',
  danger:       '#c0392b',
  dangerBg:     '#2a1515',
  dangerBorder: '#5a2020',
  green:        '#27ae60',
  greenBg:      '#1a3320',
  greenBorder:  '#2a6040',
  yellow:       '#e2a84a',
  yellowBg:     '#2a2010',
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 8)}…` : '—');

// ── 型別 ─────────────────────────────────────────────────────────────────────

type ModalScene =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'join' }
  | { type: 'detail'; room: GroupRoom }
  | { type: 'add_members'; room: GroupRoom };

// ─────────────────────────────────────────────────────────────────────────────
// 主元件
// ─────────────────────────────────────────────────────────────────────────────

export default function GroupsScreen() {
  const {
    baseUrl,
    lobbyPeers:      lobbyPeersRaw,
    groupRooms:      groupRoomsRaw,
    groupsLoading:   groupsLoadingRaw,
    refreshGroups:   refreshGroupsRaw,
    registerGroup:   registerGroupRaw,
    unregisterGroup: unregisterGroupRaw,
  } = useMessaging();

  // Context 可能在初始化前尚未提供值，全部加防禦預設值
  const lobbyPeers      = lobbyPeersRaw       ?? [];
  const groupRooms      = groupRoomsRaw       ?? [];
  const groupsLoading   = groupsLoadingRaw    ?? false;
  const refreshGroups   = refreshGroupsRaw    ?? (async () => {});
  const registerGroup   = registerGroupRaw    ?? (async () => {});
  const unregisterGroup = unregisterGroupRaw  ?? (async () => {});

  const [scene, setScene] = useState<ModalScene>({ type: 'none' });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // 手動刷新
  const handleRefresh = useCallback(async () => {
    await refreshGroups();
    setLastRefresh(new Date());
  }, [refreshGroups]);

  useEffect(() => {
    handleRefresh();
    const t = setInterval(handleRefresh, 25000);
    return () => clearInterval(t);
  }, [handleRefresh]);


  // ── API helpers ───────────────────────────────────────────────────────────

  const apiPost = useCallback(async (path: string, body: object) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error_message ?? `HTTP ${res.status}`);
    return json;
  }, [baseUrl]);

  // ── 群組操作 ──────────────────────────────────────────────────────────────

  const createGroup = useCallback(async (
    group_name: string,
    self_name: string,
    members: GroupMember[],
    invite_message: string,
  ) => {
    const json = await apiPost('/newGroup', {
      group_name,
      self_name,
      members,
      invite_message: invite_message || undefined,
    });
    await registerGroup(group_name);
    return json;
  }, [apiPost, registerGroup]);

  const joinGroup = useCallback(async (group_name: string, self_name: string) => {
    const json = await apiPost('/joinGroup', { group_name, self_name });
    await refreshGroups();
    return json;
  }, [apiPost, refreshGroups]);

  const addMembers = useCallback(async (
    group_name: string,
    members: GroupMember[],
    invite_message: string,
  ) => {
    const json = await apiPost('/addGroupMembers', {
      group_name,
      members,
      invite_message: invite_message || undefined,
    });
    await refreshGroups();
    return json;
  }, [apiPost, refreshGroups]);

  const setSelfDisplayName = useCallback(async (group_name: string, self_name: string) => {
    const json = await apiPost('/setSelfDisplayName', { group_name, self_name });
    await refreshGroups();
    return json;
  }, [apiPost, refreshGroups]);

  // ── 渲染輔助 ──────────────────────────────────────────────────────────────

  const JoinBadge = ({ confirmed }: { confirmed?: boolean }) =>
    confirmed ? (
      <View style={styles.badgeJoined}>
        <Text style={styles.badgeJoinedText}>✓ 已加入</Text>
      </View>
    ) : (
      <View style={styles.badgePending}>
        <Text style={styles.badgePendingText}>◌ 待加入</Text>
      </View>
    );

  // ── 群組列表項目 ──────────────────────────────────────────────────────────

  const GroupRow = ({ item }: { item: GroupRoom }) => {
    const memberCount = item.members?.length ?? 0;

    return (
      <View style={{
      }}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => setScene({ type: 'detail', room: item })}
          activeOpacity={0.75}
        >
          {/* 左側色塊標識 */}
          <View style={[styles.groupColorBar, item.join_confirm ? styles.colorBarJoined : styles.colorBarPending]} />

          {/* 群組 Icon */}
          <View style={[styles.groupIcon, item.join_confirm ? styles.groupIconJoined : styles.groupIconPending]}>
            <Text style={styles.groupIconText}>
              {item.group_name[0]?.toUpperCase() ?? '#'}
            </Text>
          </View>

          {/* 資訊區 */}
          <View style={styles.groupInfo}>
            <View style={styles.groupNameRow}>
              <Text style={styles.groupName} numberOfLines={1}>{item.group_name}</Text>
              <JoinBadge confirmed={item.join_confirm} />
            </View>
            <View style={styles.groupMeta}>
              {item.self_name ? (
                <Text style={styles.groupMetaText}>
                  <Text style={styles.groupMetaLabel}>你的名稱  </Text>
                  {item.self_name}
                </Text>
              ) : (
                <Text style={[styles.groupMetaText, { color: C.textMute }]}>尚未設定顯示名稱</Text>
              )}
              {memberCount > 0 && (
                <View style={styles.memberCountChip}>
                  <Text style={styles.memberCountText}>{memberCount} 人</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── 空白狀態 ──────────────────────────────────────────────────────────────

  const EmptyState = () => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Text style={styles.emptyIcon}>◈</Text>
      </View>
      <Text style={styles.emptyTitle}>尚無群組</Text>
      <Text style={styles.emptyMsg}>建立新群組或輸入群組名稱加入</Text>
      <View style={styles.emptyActions}>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => setScene({ type: 'create' })}>
          <Text style={styles.emptyBtnText}>＋ 建立群組</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.emptyBtnSecondary} onPress={() => setScene({ type: 'join' })}>
          <Text style={styles.emptyBtnSecondaryText}>加入群組</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── 主體 ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* 原頂部 Bar 已移至 Tabs Header */}
      <Tabs.Screen
        options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>群組</Text>
              <View style={styles.headerCountChip}>
                <Text style={styles.headerCountText}>{groupRooms.length}</Text>
              </View>
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15, gap: 10 }}>
              {lastRefresh && (
                <Text style={styles.headerTime}>{lastRefresh.toLocaleTimeString('zh-TW')}</Text>
              )}
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleRefresh}
                disabled={groupsLoading}
              >
                {groupsLoading
                  ? <ActivityIndicator size="small" color={C.accent} />
                  : <Text style={styles.headerIcon}>↻</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerJoinBtn}
                onPress={() => setScene({ type: 'join' })}
              >
                <Text style={styles.headerJoinText}>加入</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerCreateBtn}
                onPress={() => setScene({ type: 'create' })}
              >
                <Text style={styles.headerCreateText}>＋ 新建</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* 群組清單 */}
      <View style={{ flex: 1 }}>
        <FlatList
          data={groupRooms}
          keyExtractor={r => r.group_name}
          renderItem={({ item }) => <GroupRow item={item} />}
          ListEmptyComponent={!groupsLoading ? <EmptyState /> : null}
          contentContainerStyle={groupRooms.length === 0 && styles.listEmpty}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={groupsLoading}
          onRefresh={handleRefresh}
        />
      </View>

      {/* ── Modals ── */}

      {scene.type === 'create' && (
        <CreateGroupModal
          lobbyPeers={lobbyPeers}
          onClose={() => setScene({ type: 'none' })}
          onCreate={async (group_name, self_name, members, invite_message) => {
            try {
              await createGroup(group_name, self_name, members, invite_message);
              setScene({ type: 'none' });
              await handleRefresh();
            } catch (e: any) {
              Alert.alert('建立失敗', e.message);
            }
          }}
        />
      )}

      {scene.type === 'join' && (
        <JoinGroupModal
          onClose={() => setScene({ type: 'none' })}
          onJoin={async (group_name, self_name) => {
            try {
              await joinGroup(group_name, self_name);
              // 加入後也要把 group_name 加入 Context 清單
              await registerGroup(group_name);
              setScene({ type: 'none' });
              await handleRefresh();
            } catch (e: any) {
              Alert.alert('加入失敗', e.message);
            }
          }}
        />
      )}

      {scene.type === 'detail' && (
        <GroupDetailModal
          room={scene.room}
          onClose={() => setScene({ type: 'none' })}
          onJoin={async (self_name) => {
            try {
              await joinGroup(scene.room.group_name, self_name);
              setScene({ type: 'none' });
            } catch (e: any) {
              Alert.alert('加入失敗', e.message);
            }
          }}
          onRename={async (self_name) => {
            try {
              await setSelfDisplayName(scene.room.group_name, self_name);
              setScene({ type: 'none' });
            } catch (e: any) {
              Alert.alert('更新失敗', e.message);
            }
          }}
          onAddMembers={() => setScene({ type: 'add_members', room: scene.room })}
          onUnregister={async () => {
            await unregisterGroup(scene.room.group_name);
            setScene({ type: 'none' });
          }}
        />
      )}

      {scene.type === 'add_members' && (
        <AddMembersModal
          room={scene.room}
          lobbyPeers={lobbyPeers}
          onClose={() => setScene({ type: 'none' })}
          onAdd={async (members, invite_message) => {
            try {
              await addMembers(scene.room.group_name, members, invite_message);
              setScene({ type: 'none' });
            } catch (e: any) {
              Alert.alert('新增失敗', e.message);
            }
          }}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal：建立群組
// ─────────────────────────────────────────────────────────────────────────────

type CreateGroupModalProps = {
  lobbyPeers: ReturnType<typeof useMessaging>['lobbyPeers'];
  onClose: () => void;
  onCreate: (
    group_name: string,
    self_name: string,
    members: GroupMember[],
    invite_message: string,
  ) => Promise<void>;
};

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  lobbyPeers: lobbyPeersProp, onClose, onCreate,
}) => {
  // props 可能因 Context 初始化時序問題傳入 undefined
  const lobbyPeers = lobbyPeersProp ?? [];
  const [groupName, setGroupName]         = useState('');
  const [selfName, setSelfName]           = useState('');
  const [inviteMsg, setInviteMsg]         = useState('');
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [displayNames, setDisplayNames]   = useState<Record<string, string>>({});
  const [loading, setLoading]             = useState(false);

  const togglePeer = (dest_hash: string) => {
    setSelectedHashes(prev => {
      const next = new Set(prev);
      next.has(dest_hash) ? next.delete(dest_hash) : next.add(dest_hash);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { Alert.alert('請填寫', '群組名稱不能空白'); return; }
    if (!selfName.trim())  { Alert.alert('請填寫', '請輸入你在群組中的顯示名稱'); return; }
    const members: GroupMember[] = [...selectedHashes].map(h => ({
      dest_hash: h,
      display_name: displayNames[h]?.trim() || undefined,
    }));
    setLoading(true);
    try { await onCreate(groupName.trim(), selfName.trim(), members, inviteMsg.trim()); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>◈</Text>
            </View>
            <Text style={styles.modalTitle}>建立新群組</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">

            {/* 群組名稱 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>群組名稱 <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.fieldInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="英文、數字、連字符（唯一識別碼）"
                placeholderTextColor={C.textMute}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>群組名稱建立後無法修改，建議使用 kebab-case</Text>
            </View>

            {/* 自己的顯示名稱 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>你的顯示名稱 <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.fieldInput}
                value={selfName}
                onChangeText={setSelfName}
                placeholder="其他成員看到的你的名稱"
                placeholderTextColor={C.textMute}
              />
            </View>

            {/* 邀請訊息 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>邀請訊息（選填）</Text>
              <TextInput
                style={styles.fieldInput}
                value={inviteMsg}
                onChangeText={setInviteMsg}
                placeholder="附在邀請封包中的訊息"
                placeholderTextColor={C.textMute}
              />
            </View>

            {/* 邀請成員 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                邀請 Lobby 節點（選填） · 已選 {selectedHashes.size} 人
              </Text>
              {lobbyPeers.length === 0 ? (
                <View style={styles.emptyPeerBox}>
                  <Text style={styles.emptyPeerText}>Lobby 中目前無可邀請的節點</Text>
                </View>
              ) : (
                lobbyPeers.map(peer => {
                  const selected = selectedHashes.has(peer.dest_hash);
                  const name = peer.nickname || peer.announced_name || shortHash(peer.dest_hash);
                  return (
                    <View key={peer.dest_hash}>
                      <TouchableOpacity
                        style={[styles.peerPickRow, selected && styles.peerPickRowSelected]}
                        onPress={() => togglePeer(peer.dest_hash)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.peerPickCheck, selected && styles.peerPickCheckActive]}>
                          {selected && <Text style={styles.checkMark}>✓</Text>}
                        </View>
                        <View style={styles.peerPickAvatar}>
                          <Text style={styles.peerPickAvatarText}>{name[0].toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.peerPickName}>{name}</Text>
                          <Text style={styles.peerPickHash}>{shortHash(peer.dest_hash)}</Text>
                        </View>
                        <View style={[styles.onlineDot, peer.online ? styles.dotOn : styles.dotOff]} />
                      </TouchableOpacity>
                      {selected && (
                        <View style={styles.displayNameRow}>
                          <TextInput
                            style={styles.displayNameInput}
                            value={displayNames[peer.dest_hash] ?? ''}
                            onChangeText={v => setDisplayNames(prev => ({ ...prev, [peer.dest_hash]: v }))}
                            placeholder={`${name} 的群組顯示名稱（選填）`}
                            placeholderTextColor={C.textMute}
                          />
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnLoading]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.primaryBtnText}>◈ 建立群組並發送邀請</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal：加入群組
// ─────────────────────────────────────────────────────────────────────────────

type JoinGroupModalProps = {
  onClose: () => void;
  onJoin: (group_name: string, self_name: string) => Promise<void>;
};

const JoinGroupModal: React.FC<JoinGroupModalProps> = ({ onClose, onJoin }) => {
  const [groupName, setGroupName] = useState('');
  const [selfName, setSelfName]   = useState('');
  const [loading, setLoading]     = useState(false);

  const handleJoin = async () => {
    if (!groupName.trim()) { Alert.alert('請填寫', '群組名稱不能空白'); return; }
    if (!selfName.trim())  { Alert.alert('請填寫', '請輸入你的顯示名稱'); return; }
    setLoading(true);
    try { await onJoin(groupName.trim(), selfName.trim()); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalSheet, styles.modalSheetSmall]}>

          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>⊕</Text>
            </View>
            <Text style={styles.modalTitle}>加入群組</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                輸入已知的群組名稱與你的顯示名稱。{'\n'}
                後端將設定本地 join_confirm = true。
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>群組名稱 <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.fieldInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="對方告知的群組名稱"
                placeholderTextColor={C.textMute}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>你的顯示名稱 <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.fieldInput}
                value={selfName}
                onChangeText={setSelfName}
                placeholder="其他成員看到的你的名稱"
                placeholderTextColor={C.textMute}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnLoading]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.primaryBtnText}>⊕ 確認加入</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal：群組詳細
// ─────────────────────────────────────────────────────────────────────────────

type GroupDetailModalProps = {
  room: GroupRoom;
  onClose: () => void;
  onJoin: (self_name: string) => Promise<void>;
  onRename: (self_name: string) => Promise<void>;
  onAddMembers: () => void;
  onUnregister: () => Promise<void>;
};

const GroupDetailModal: React.FC<GroupDetailModalProps> = ({
  room, onClose, onJoin, onRename, onAddMembers, onUnregister,
}) => {
  const [newSelfName, setNewSelfName] = useState(room.self_name ?? '');
  const [saving, setSaving]           = useState<string | null>(null);
  const [showJoin, setShowJoin]       = useState(false);
  const [joinName, setJoinName]       = useState(room.self_name ?? '');

  const doRename = async () => {
    if (!newSelfName.trim()) { Alert.alert('請填寫', '顯示名稱不能空白'); return; }
    setSaving('rename');
    try { await onRename(newSelfName.trim()); }
    catch (e: any) { Alert.alert('更新失敗', e.message); }
    finally { setSaving(null); }
  };

  const doJoin = async () => {
    if (!joinName.trim()) { Alert.alert('請填寫', '請輸入顯示名稱'); return; }
    setSaving('join');
    try { await onJoin(joinName.trim()); }
    catch (e: any) { Alert.alert('加入失敗', e.message); }
    finally { setSaving(null); }
  };

  const memberCount = room.members?.length ?? 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={[
              styles.groupIcon,
              room.join_confirm ? styles.groupIconJoined : styles.groupIconPending,
              { width: 44, height: 44, borderRadius: 12 },
            ]}>
              <Text style={styles.groupIconText}>{room.group_name[0]?.toUpperCase() ?? '#'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{room.group_name}</Text>
              <Text style={styles.modalSub}>
                {room.join_confirm ? '✓ 已加入' : '◌ 尚未加入'}{memberCount > 0 ? `  ·  ${memberCount} 位成員` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>

            {/* 加入狀態橫幅 */}
            {!room.join_confirm && (
              <View style={styles.joinBanner}>
                <Text style={styles.joinBannerText}>◌ 尚未確認加入此群組</Text>
                {!showJoin ? (
                  <TouchableOpacity onPress={() => setShowJoin(true)}>
                    <Text style={styles.joinBannerBtn}>立即加入 →</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <TextInput
                      style={styles.fieldInput}
                      value={joinName}
                      onChangeText={setJoinName}
                      placeholder="輸入你的顯示名稱"
                      placeholderTextColor={C.textMute}
                    />
                    <TouchableOpacity
                      style={[styles.primaryBtn, saving === 'join' && styles.btnLoading]}
                      onPress={doJoin}
                      disabled={saving !== null}
                    >
                      {saving === 'join'
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.primaryBtnText}>確認加入</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* 顯示名稱編輯 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>你的顯示名稱</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }]}
                  value={newSelfName}
                  onChangeText={setNewSelfName}
                  placeholder="未設定"
                  placeholderTextColor={C.textMute}
                />
                <TouchableOpacity
                  style={[styles.inlineBtn, saving === 'rename' && styles.btnLoading]}
                  onPress={doRename}
                  disabled={saving !== null}
                >
                  {saving === 'rename'
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.inlineBtnText}>更新</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* 成員列表 */}
            {memberCount > 0 && (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>成員列表</Text>
                <View style={styles.memberListBox}>
                  {room.members!.map((m, i) => (
                    <View key={m.dest_hash} style={[styles.memberRow, i > 0 && styles.memberRowBorder]}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {(m.display_name || m.dest_hash)[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.display_name || '—'}</Text>
                        <Text style={styles.memberHash}>{shortHash(m.dest_hash)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 操作按鈕群 */}
            <TouchableOpacity style={styles.secondaryBtn} onPress={onAddMembers}>
              <Text style={styles.secondaryBtnText}>＋ 新增成員</Text>
            </TouchableOpacity>

            {/* 危險區 */}
            <View style={styles.dangerZone}>
              <Text style={styles.dangerLabel}>本地操作</Text>
              <TouchableOpacity style={styles.dangerBtn} onPress={onUnregister}>
                <Text style={styles.dangerBtnText}>⊗ 從本地清單移除此群組</Text>
              </TouchableOpacity>
              <Text style={styles.dangerHint}>僅移除本地記錄，不通知其他成員</Text>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal：新增成員
// ─────────────────────────────────────────────────────────────────────────────

type AddMembersModalProps = {
  room: GroupRoom;
  lobbyPeers: ReturnType<typeof useMessaging>['lobbyPeers'];
  onClose: () => void;
  onAdd: (members: GroupMember[], invite_message: string) => Promise<void>;
};

const AddMembersModal: React.FC<AddMembersModalProps> = ({
  room, lobbyPeers: lobbyPeersProp, onClose, onAdd,
}) => {
  // props 可能因 Context 初始化時序問題傳入 undefined
  const lobbyPeers = lobbyPeersProp ?? [];
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [displayNames, setDisplayNames]     = useState<Record<string, string>>({});
  const [inviteMsg, setInviteMsg]           = useState('');
  const [loading, setLoading]               = useState(false);

  // 過濾掉已在群組的成員
  const existingHashes = new Set(room.members?.map(m => m.dest_hash) ?? []);
  const available = lobbyPeers.filter(p => !existingHashes.has(p.dest_hash));

  const togglePeer = (dest_hash: string) => {
    setSelectedHashes(prev => {
      const next = new Set(prev);
      next.has(dest_hash) ? next.delete(dest_hash) : next.add(dest_hash);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedHashes.size === 0) { Alert.alert('請選擇', '至少選擇一位成員'); return; }
    const members: GroupMember[] = [...selectedHashes].map(h => ({
      dest_hash: h,
      display_name: displayNames[h]?.trim() || undefined,
    }));
    setLoading(true);
    try { await onAdd(members, inviteMsg.trim()); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrap}>
              <Text style={styles.modalIcon}>＋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>新增成員</Text>
              <Text style={styles.modalSub}>{room.group_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>邀請訊息（選填）</Text>
              <TextInput
                style={styles.fieldInput}
                value={inviteMsg}
                onChangeText={setInviteMsg}
                placeholder="附在邀請封包中的訊息"
                placeholderTextColor={C.textMute}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>
                選擇 Lobby 節點 · 已選 {selectedHashes.size} 人
              </Text>
              {available.length === 0 ? (
                <View style={styles.emptyPeerBox}>
                  <Text style={styles.emptyPeerText}>
                    Lobby 中無新的可邀請節點
                  </Text>
                </View>
              ) : (
                available.map(peer => {
                  const selected = selectedHashes.has(peer.dest_hash);
                  const name = peer.nickname || peer.announced_name || shortHash(peer.dest_hash);
                  return (
                    <View key={peer.dest_hash}>
                      <TouchableOpacity
                        style={[styles.peerPickRow, selected && styles.peerPickRowSelected]}
                        onPress={() => togglePeer(peer.dest_hash)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.peerPickCheck, selected && styles.peerPickCheckActive]}>
                          {selected && <Text style={styles.checkMark}>✓</Text>}
                        </View>
                        <View style={styles.peerPickAvatar}>
                          <Text style={styles.peerPickAvatarText}>{name[0].toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.peerPickName}>{name}</Text>
                          <Text style={styles.peerPickHash}>{shortHash(peer.dest_hash)}</Text>
                        </View>
                        <View style={[styles.onlineDot, peer.online ? styles.dotOn : styles.dotOff]} />
                      </TouchableOpacity>
                      {selected && (
                        <View style={styles.displayNameRow}>
                          <TextInput
                            style={styles.displayNameInput}
                            value={displayNames[peer.dest_hash] ?? ''}
                            onChangeText={v => setDisplayNames(prev => ({ ...prev, [peer.dest_hash]: v }))}
                            placeholder={`${name} 的群組顯示名稱（選填）`}
                            placeholderTextColor={C.textMute}
                          />
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (loading || selectedHashes.size === 0) && styles.btnLoading]}
              onPress={handleAdd}
              disabled={loading || selectedHashes.size === 0}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.primaryBtnText}>發送邀請給 {selectedHashes.size} 位成員</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 樣式
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    backgroundColor: C.surface2,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'monospace' },
  headerCountChip: {
    backgroundColor: C.accentDim, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  headerCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTime:  { color: C.textMute, fontSize: 11, fontFamily: 'monospace' },
  headerIconBtn: { padding: 6 },
  headerIcon: { color: C.accent, fontSize: 20 },
  headerJoinBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  headerJoinText: { color: '#000', fontSize: 12, fontFamily: 'monospace' },
  headerCreateBtn: {
    backgroundColor: C.accentDim, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  headerCreateText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  // ── 群組列表行 ──
  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingRight: 16,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  groupColorBar: { width: 3, alignSelf: 'stretch', marginRight: 12 },
  colorBarJoined:  { backgroundColor: C.green },
  colorBarPending: { backgroundColor: C.yellow },

  groupIcon: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  groupIconJoined:  { backgroundColor: '#1a3a2a' },
  groupIconPending: { backgroundColor: '#2a2010' },
  groupIconText: { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: 'monospace' },

  groupInfo: { flex: 1 },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  groupName: { color: C.text, fontSize: 15, fontWeight: '600', fontFamily: 'monospace', flex: 1 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupMetaText:  { color: C.textDim, fontSize: 11, fontFamily: 'monospace' },
  groupMetaLabel: { color: C.textMute },
  memberCountChip: {
    backgroundColor: C.surface, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1, borderColor: C.border,
  },
  memberCountText: { color: C.textDim, fontSize: 10 },
  rowChevron: { color: C.textMute, fontSize: 20, marginLeft: 4 },

  // ── 徽章 ──
  badgeJoined: {
    backgroundColor: C.greenBg, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.greenBorder,
  },
  badgeJoinedText: { color: '#5acd8a', fontSize: 10, fontFamily: 'monospace' },
  badgePending: {
    backgroundColor: C.yellowBg, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#4a3a10',
  },
  badgePendingText: { color: C.yellow, fontSize: 10, fontFamily: 'monospace' },

  separator: { height: 1, backgroundColor: C.border, marginLeft: 73 },
  listEmpty:  { flex: 1 },

  // ── 空白狀態 ──
  emptyWrap: { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: C.border,
  },
  emptyIcon:    { fontSize: 32, color: C.accentDim, fontFamily: 'monospace' },
  emptyTitle:   { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: 'monospace', marginBottom: 8 },
  emptyMsg:     { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  emptyActions: { flexDirection: 'row', gap: 10 },
  emptyBtn: {
    backgroundColor: C.accentDim, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyBtnSecondary: {
    backgroundColor: C.surface, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: C.border,
  },
  emptyBtnSecondaryText: { color: C.textDim, fontSize: 13 },

  // ── Modal 基底 ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%',
    borderTopWidth: 1, borderColor: C.border,
  },
  modalSheetSmall: { maxHeight: '65%' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  modalIcon:  { color: '#fff', fontSize: 20, fontFamily: 'monospace' },
  modalTitle: { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: 'monospace', flex: 1 },
  modalSub:   { color: C.textDim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  closeBtn:   { padding: 8 },
  closeBtnText: { color: C.textDim, fontSize: 18 },
  modalBody:  { padding: 16 },

  // ── 表單 ──
  fieldBlock: { marginBottom: 18 },
  fieldLabel: {
    color: C.textDim, fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase',
  },
  fieldRow:   { flexDirection: 'row', gap: 8 },
  fieldInput: {
    backgroundColor: C.surface2, color: C.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 13, fontFamily: 'monospace',
    borderWidth: 1, borderColor: C.border,
  },
  fieldHint: { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 5 },
  required:   { color: C.danger },

  // ── 節點選取列 ──
  peerPickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface2, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    marginBottom: 4,
    borderWidth: 1, borderColor: C.border,
  },
  peerPickRowSelected: { borderColor: C.accent, backgroundColor: '#0f1a2e' },
  peerPickCheck: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1, borderColor: C.textMute,
    alignItems: 'center', justifyContent: 'center',
  },
  peerPickCheckActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  peerPickAvatar: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  peerPickAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  peerPickName: { color: C.text, fontSize: 13, fontWeight: '600' },
  peerPickHash: { color: C.textDim, fontSize: 10, fontFamily: 'monospace', marginTop: 1 },
  displayNameRow: {
    paddingLeft: 42, paddingBottom: 6,
  },
  displayNameInput: {
    backgroundColor: '#0a0c14', color: C.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 12, fontFamily: 'monospace',
    borderWidth: 1, borderColor: C.border,
  },

  // ── 在線狀態 ──
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  dotOn:     { backgroundColor: C.green },
  dotOff:    { backgroundColor: C.textMute },

  // ── 空節點提示 ──
  emptyPeerBox: {
    backgroundColor: C.surface2, borderRadius: 8, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  emptyPeerText: { color: C.textDim, fontSize: 12, fontFamily: 'monospace' },

  // ── 加入 Banner ──
  joinBanner: {
    backgroundColor: C.yellowBg, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#4a3a10', marginBottom: 16,
  },
  joinBannerText: { color: C.yellow, fontSize: 13, fontFamily: 'monospace' },
  joinBannerBtn:  { color: C.accent, fontSize: 13, marginTop: 8, fontWeight: '700' },

  // ── 成員列表 ──
  memberListBox: {
    backgroundColor: C.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  memberRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  memberAvatarText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
  memberName: { color: C.text, fontSize: 13 },
  memberHash: { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 1 },

  // ── 資訊框 ──
  infoBox: {
    backgroundColor: C.accentGlow, borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 18,
  },
  infoBoxText: { color: C.textDim, fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },

  // ── 按鈕 ──
  primaryBtn: {
    backgroundColor: C.accentDim, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  secondaryBtn: {
    backgroundColor: C.surface2, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, marginBottom: 12,
  },
  secondaryBtnText: { color: C.textDim, fontSize: 13, fontFamily: 'monospace' },
  inlineBtn: {
    backgroundColor: C.accentDim, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center',
  },
  inlineBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnLoading: { opacity: 0.5 },

  // ── 危險區 ──
  dangerZone: {
    marginTop: 8, borderTopWidth: 1,
    borderTopColor: C.border, paddingTop: 16,
  },
  dangerLabel: {
    color: '#7a3a3a', fontSize: 10, fontFamily: 'monospace',
    letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase',
  },
  dangerBtn: {
    backgroundColor: C.dangerBg, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: C.dangerBorder,
  },
  dangerBtnText: { color: '#e57373', fontSize: 13, fontFamily: 'monospace' },
  dangerHint:    { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 6, textAlign: 'center' },
});