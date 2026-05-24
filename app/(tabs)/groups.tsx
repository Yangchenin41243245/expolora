// filepath: app/(tabs)/groups.tsx
import { Tabs } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import {
  AddMembersModal,
  CreateGroupModal,
  GroupDetailModal,
  JoinGroupModal,
} from '../../components/GroupModals';


// ── 顏色常數（與整體 App 一致）─────────────────────────────────────────────

const C = {
  bg:           '#F6F6F6',
  surface:      '#FFFFFF',
  surface2:     '#FFFFFF',
  surface3:     '#F0F0F0',
  border:       '#E0E0E0',
  accent:       '#0B6EFD',
  accentDim:    '#0B6EFD',
  accentGlow:   '#EAF2FF',
  text:         '#222222',
  textDim:      '#666666',
  textMute:     '#999999',
  danger:       '#c0392b',
  dangerBg:     '#FDECEC',
  dangerBorder: '#F4B7B7',
  green:        '#00A35C',
  greenBg:      '#E8F5E9',
  greenBorder:  '#A8DDB5',
  yellow:       '#C68600',
  yellowBg:     '#FFF8E1',
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

  // 進場動畫
  const listAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(listAnim, {
      toValue: 1, duration: 350, useNativeDriver: true,
    }).start();
  }, []);

  // 手動刷新
  const handleRefresh = useCallback(async () => {
    await refreshGroups();
    setLastRefresh(new Date());
  }, [refreshGroups]);

  useEffect(() => { handleRefresh(); }, []);

  // groupRooms 更新時同步已開啟的 detail modal
  useEffect(() => {
    setScene(prev => {
      if (prev.type !== 'detail') return prev;
      const updated = groupRooms.find(r => r.group_name === prev.room.group_name);
      return updated ? { type: 'detail', room: updated } : prev;
    });
  }, [groupRooms]);


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

  const fetchRoomDetail = useCallback(async (room: GroupRoom): Promise<GroupRoom | null> => {
    const key = room.group_id || room.group_name;
    try {
      const res = await fetch(`${baseUrl}/getGroupChat/${encodeURIComponent(key)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.data?.group_room as GroupRoom) ?? null;
    } catch {
      return null;
    }
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
    // 從回應取得含 group_id 的完整房間物件並立即寫入狀態
    const room: GroupRoom | undefined = json?.data?.group_room;
    if (room) await registerGroup(room);
    return json;
  }, [apiPost, registerGroup]);

  const joinGroup = useCallback(async (group_name: string, self_name: string) => {
    const json = await apiPost('/joinGroup', { group_name, self_name });
    // 從回應取得完整房間物件（含 group_id）並立即寫入狀態
    const room: GroupRoom | undefined = json?.data?.group_room;
    if (room) await registerGroup(room);
    return json;
  }, [apiPost, registerGroup]);

  const addMembers = useCallback(async (
    room: GroupRoom,
    members: GroupMember[],
    invite_message: string,
  ) => {
    const json = await apiPost('/addGroupMembers', {
      group_id: room.group_id,
      group_name: room.group_name,
      members,
      invite_message: invite_message || undefined,
    });
    await refreshGroups();
    return json;
  }, [apiPost, refreshGroups]);

  const setSelfDisplayName = useCallback(async (room: GroupRoom, self_name: string) => {
    const json = await apiPost('/setSelfDisplayName', {
      group_id: room.group_id,
      group_name: room.group_name,
      self_name,
    });
    await refreshGroups();
    return json;
  }, [apiPost, refreshGroups]);

  // ── 渲染輔助 ──────────────────────────────────────────────────────────────

  // ── 群組列表項目 ──────────────────────────────────────────────────────────

  const GroupRow = ({ item, index }: { item: GroupRoom; index: number }) => {
    const memberCount = item.members?.length ?? 0;
    const rowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.timing(rowAnim, {
        toValue: 1,
        duration: 280,
        delay: index * 55,
        useNativeDriver: true,
      }).start();
    }, []);

    return (
      <Animated.View style={{
        opacity: rowAnim,
        transform: [{ translateY: rowAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => {
            setScene({ type: 'detail', room: item });
            fetchRoomDetail(item).then(fresh => {
              if (!fresh) return;
              setScene(s =>
                s.type === 'detail' && s.room.group_name === item.group_name
                  ? { type: 'detail', room: fresh }
                  : s
              );
            });
          }}
          activeOpacity={0.75}
        >
          {/* 左側色塊標識 */}
          <View style={styles.groupColorBar} />

          {/* 群組 Icon */}
          <View style={styles.groupIcon}>
            <Text style={styles.groupIconText}>
              {item.group_name[0]?.toUpperCase() ?? '#'}
            </Text>
          </View>

          {/* 資訊區 */}
          <View style={styles.groupInfo}>
            <View style={styles.groupNameRow}>
              <Text style={styles.groupName} numberOfLines={1}>{item.group_name}</Text>
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
      </Animated.View>
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
      <Animated.View style={{ flex: 1, opacity: listAnim }}>
        <FlatList
          data={groupRooms}
          keyExtractor={r => r.group_name}
          renderItem={({ item, index }) => <GroupRow item={item} index={index} />}
          ListEmptyComponent={!groupsLoading ? <EmptyState /> : null}
          contentContainerStyle={groupRooms.length === 0 && styles.listEmpty}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={groupsLoading}
          onRefresh={handleRefresh}
        />
      </Animated.View>

      {/* ── Modals ── */}

      {scene.type === 'create' && (
        <CreateGroupModal
          lobbyPeers={lobbyPeers}
          onClose={() => setScene({ type: 'none' })}
          onCreate={async (group_name, self_name, members, invite_message) => {
            await createGroup(group_name, self_name, members, invite_message);
            setScene({ type: 'none' });
            await handleRefresh();
          }}
        />
      )}

      {scene.type === 'join' && (
        <JoinGroupModal
          onClose={() => setScene({ type: 'none' })}
          onJoin={async (group_name, self_name) => {
            try {
              await joinGroup(group_name, self_name);
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
          onRename={async (self_name) => {
            try {
              await setSelfDisplayName(scene.room, self_name);
              setScene({ type: 'none' });
            } catch (e: any) {
              Alert.alert('更新失敗', e.message);
            }
          }}
          onAddMembers={() => setScene({ type: 'add_members', room: scene.room })}
          onUnregister={async () => {
            if (scene.room.group_id) {
              await unregisterGroup(scene.room.group_id);
            }
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
              await addMembers(scene.room, members, invite_message);
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
  groupColorBar: { width: 3, alignSelf: 'stretch', marginRight: 12, backgroundColor: C.accentDim },

  groupIcon: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    backgroundColor: C.surface,
  },
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

});