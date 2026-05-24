// filepath: app/(tabs)/contacts.tsx
import { Tabs, router } from 'expo-router';
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
  AddMembersModal,
  CreateGroupModal,
  GroupDetailModal,
  JoinGroupModal,
} from '../../components/GroupModals';
import { GroupMember, GroupRoom, useMessaging } from '../context/MessagingContext';

// ── 型別 ─────────────────────────────────────────────────────────────────────

type Contact = {
  dest_hash: string;
  announced_name?: string;
  nickname?: string;
  notes?: string;
  is_saved_contact?: boolean;
  online?: boolean;
};

type BlockedContact = {
  dest_hash: string;
  announced_name?: string;
  reason?: string;
  blocked_at?: number;
  is_blocked?: boolean;
  online?: boolean;
};

type LobbyPeer = {
  dest_hash: string;
  announced_name?: string;
  nickname?: string;
  is_saved_contact?: boolean;
  online?: boolean;
};

type Tab = 'contacts' | 'lobby' | 'blocklist' | 'groups';

type ModalScene =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'join' }
  | { type: 'detail'; room: GroupRoom }
  | { type: 'add_members'; room: GroupRoom };

// ── 工具函式 ──────────────────────────────────────────────────────────────────

const shortHash = (h: string) => (h ? `${h.slice(0, 8)}…` : '—');

const formatTime = (ts?: number) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

// ── 主元件 ────────────────────────────────────────────────────────────────────

export default function contacts() {
  const {
    baseUrl,
    groupRooms, groupsLoading,
    refreshGroups, registerGroup, unregisterGroup,
  } = useMessaging();

  const [tab, setTab] = useState<Tab>('contacts');
  const [scene, setScene] = useState<ModalScene>({ type: 'none' });
  const [groupsLastRefresh, setGroupsLastRefresh] = useState<Date | null>(null);
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [lobbyPeers, setLobbyPeers] = useState<LobbyPeer[]>([]);
  const [blocklist, setBlocklist]   = useState<BlockedContact[]>([]);
  const [loading, setLoading]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // 詳細 Modal 狀態
  const [detailContact, setDetailContact]   = useState<Contact | null>(null);
  const [detailBlocked, setDetailBlocked]   = useState<BlockedContact | null>(null);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [selectedLobbyPeer, setSelectedLobbyPeer] = useState<LobbyPeer | null>(null);

  // 動畫
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fadeIn = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  // ── API 呼叫 ────────────────────────────────────────────────────────────────

  const apiFetch = useCallback(async (path: string) => {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error_message ?? `HTTP ${res.status}`);
    return json;
  }, [baseUrl]);

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

  // ── 資料載入 ────────────────────────────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    try {
      const json = await apiFetch('/getContactList');
      setContacts(json?.data?.contacts ?? []);
    } catch { setContacts([]); }
  }, [apiFetch]);

  const loadLobby = useCallback(async () => {
    try {
      const json = await apiFetch('/getLobby');
      const peers: LobbyPeer[] = json?.data?.lobby ?? [];
      setLobbyPeers(peers.filter(p => p.announced_name !== 'Unknown'));
    } catch { setLobbyPeers([]); }
  }, [apiFetch]);

  const loadBlocklist = useCallback(async () => {
    try {
      const json = await apiFetch('/getBlocklist');
      setBlocklist(json?.data?.blocklist ?? []);
    } catch { setBlocklist([]); }
  }, [apiFetch]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadContacts(), loadLobby(), loadBlocklist()]);
    setLastRefresh(new Date());
    setLoading(false);
    fadeIn();
  }, [loadContacts, loadLobby, loadBlocklist]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── 聯絡人操作 ──────────────────────────────────────────────────────────────

  const saveContact = async (peer: LobbyPeer, nickname: string, notes: string) => {
    await apiPost('/saveContact', {
      dest_hash: peer.dest_hash,
      announced_name: peer.announced_name ?? '',
      nickname: nickname.trim(),
      notes: notes.trim(),
    });
    await refreshAll();
  };

  const editNickname = async (dest_hash: string, nickname: string) => {
    await apiPost('/editContactName', { dest_hash, nickname: nickname.trim() });
    await loadContacts();
  };

  const editNote = async (dest_hash: string, note_text: string) => {
    await apiPost('/editContactNote', { dest_hash, note_text: note_text.trim() });
    await loadContacts();
  };

  const blockContact = async (dest_hash: string, reason: string) => {
    await apiPost('/blockContact', { dest_hash, reason: reason.trim() || 'spam' });
    await refreshAll();
  };

  const deleteContact = async (dest_hash: string) => {
    await apiPost('/deleteContact', { dest_hash });
    await refreshAll();
  };

  const hideLink = async (dest_hash: string, reason: string) => {
    await apiPost('/hideLink', { dest_hash, reason: reason.trim() || 'ignore' });
    await refreshAll();
  };

  const unblockContact = async (dest_hash: string) => {
    await apiPost('/unblockContact', { dest_hash });
    await refreshAll();
  };

  // ── 群組操作 ────────────────────────────────────────────────────────────────

  const handleGroupRefresh = useCallback(async () => {
    await refreshGroups();
    setGroupsLastRefresh(new Date());
  }, [refreshGroups]);

  const fetchRoomDetail = useCallback(async (group_name: string): Promise<GroupRoom | null> => {
    try {
      const res = await fetch(`${baseUrl}/getGroupChat/${encodeURIComponent(group_name)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.data?.group_room as GroupRoom) ?? null;
    } catch { return null; }
  }, [baseUrl]);

  const createGroup = useCallback(async (
    group_name: string, self_name: string,
    members: GroupMember[], invite_message: string,
  ) => {
    const json = await apiPost('/newGroup', { group_name, self_name, members, invite_message: invite_message || undefined });
    const room: GroupRoom | undefined = json?.data?.group_room;
    if (room) await registerGroup(room);
  }, [apiPost, registerGroup]);

  const joinGroup = useCallback(async (group_name: string, self_name: string) => {
    const json = await apiPost('/joinGroup', { group_name, self_name });
    const room: GroupRoom | undefined = json?.data?.group_room;
    if (room) await registerGroup(room);
  }, [apiPost, registerGroup]);

  const addMembers = useCallback(async (
    room: GroupRoom, members: GroupMember[], invite_message: string,
  ) => {
    await apiPost('/addGroupMembers', { group_id: room.group_id, group_name: room.group_name, members, invite_message: invite_message || undefined });
    await refreshGroups();
  }, [apiPost, refreshGroups]);

  const setSelfDisplayName = useCallback(async (room: GroupRoom, self_name: string) => {
    await apiPost('/setSelfDisplayName', { group_id: room.group_id, group_name: room.group_name, self_name });
    await refreshGroups();
  }, [apiPost, refreshGroups]);

  useEffect(() => {
    setScene(prev => {
      if (prev.type !== 'detail') return prev;
      const updated = groupRooms.find(r => r.group_name === prev.room.group_name);
      return updated ? { type: 'detail', room: updated } : prev;
    });
  }, [groupRooms]);

  // ── 渲染輔助 ────────────────────────────────────────────────────────────────

  const displayName = (c: Contact) =>
    c.nickname || c.announced_name || shortHash(c.dest_hash);

  const onlineGlyph = (online?: boolean) =>
    online ? <View style={styles.dotOnline} /> : <View style={styles.dotOffline} />;

  const navigateToPeer = (dest_hash: string) =>
    router.navigate({ pathname: '/(tabs)/chat' as never, params: { dest_hash } });
  const navigateToGroup = (group_name: string) =>
    router.navigate({ pathname: '/(tabs)/chat' as never, params: { group_name } });

  // ── 聯絡人列表項目 ──────────────────────────────────────────────────────────

  const ContactRow = ({ item }: { item: Contact }) => {
    const isOnline = item.online ?? lobbyPeers.find(p => p.dest_hash === item.dest_hash)?.online;
    return (
    <TouchableOpacity style={styles.row} onPress={() => navigateToPeer(item.dest_hash)} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.nickname || item.announced_name || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowNameLine}>
            {onlineGlyph(isOnline)}
            <Text style={styles.rowName}>{displayName(item)}</Text>
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {item.notes ? `📝 ${item.notes}` : shortHash(item.dest_hash)}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.optionBtn} onPress={() => setDetailContact({ ...item, online: isOnline })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.optionBtnText}>⋯</Text>
      </TouchableOpacity>
    </TouchableOpacity>
    );
  };

  // ── Lobby 列表項目 ──────────────────────────────────────────────────────────

  const LobbyRow = ({ item }: { item: LobbyPeer }) => {
    const isSaved = item.is_saved_contact;
    return (
      <TouchableOpacity
        style={[styles.row, isSaved && styles.rowSaved]}
        onPress={() => navigateToPeer(item.dest_hash)}
        activeOpacity={0.7}
      >
        <View style={styles.rowLeft}>
          <View style={[styles.avatar, isSaved && styles.avatarSaved]}>
            <Text style={styles.avatarText}>
              {(item.announced_name || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.rowInfo}>
            <View style={styles.rowNameLine}>
              {onlineGlyph(item.online)}
              <Text style={styles.rowName}>{item.announced_name || '未命名節點'}</Text>
            </View>
            <Text style={styles.rowSub}>{shortHash(item.dest_hash)}</Text>
          </View>
        </View>
        <View style={styles.rowActions}>
          {isSaved
            ? <View style={styles.badge}><Text style={styles.badgeText}>已儲存</Text></View>
            : <View style={styles.badgeAdd}><Text style={styles.badgeAddText}>＋ 新增</Text></View>
          }
          <TouchableOpacity style={styles.optionBtn} onPress={() => { setSelectedLobbyPeer(item); setShowAddModal(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.optionBtnText}>⋯</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── 封鎖列表項目 ────────────────────────────────────────────────────────────

  const BlockRow = ({ item }: { item: BlockedContact }) => (
    <TouchableOpacity style={[styles.row, styles.rowBlocked]} onPress={() => navigateToPeer(item.dest_hash)} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <View style={styles.avatarBlocked}>
          <Text style={styles.avatarBlockedText}>⊘</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowNameBlocked}>{item.announced_name || shortHash(item.dest_hash)}</Text>
          <Text style={styles.rowSub}>
            {item.reason ? `原因：${item.reason}` : ''}  {formatTime(item.blocked_at)}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.optionBtn} onPress={() => setDetailBlocked(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.optionBtnText}>⋯</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // ── 空白提示 ────────────────────────────────────────────────────────────────

  const EmptyState = ({ icon, msg }: { icon: string; msg: string }) => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyMsg}>{msg}</Text>
    </View>
  );

  const GroupRow = ({ item, index }: { item: GroupRoom; index: number }) => {
    const memberCount = item.members?.length ?? 0;
    const rowAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      Animated.timing(rowAnim, { toValue: 1, duration: 280, delay: index * 55, useNativeDriver: true }).start();
    }, []);
    return (
      <Animated.View style={{
        opacity: rowAnim,
        transform: [{ translateY: rowAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}>
        <TouchableOpacity
          style={styles.groupRow}
          onPress={() => navigateToGroup(item.group_name)}
          activeOpacity={0.75}
        >
          <View style={styles.groupColorBar} />
          <View style={styles.groupIcon}>
            <Text style={styles.groupIconText}>{item.group_name[0]?.toUpperCase() ?? '#'}</Text>
          </View>
          <View style={styles.groupInfo}>
            <View style={styles.groupNameRow}>
              <Text style={styles.groupName} numberOfLines={1}>{item.group_name}</Text>
            </View>
            <View style={styles.groupMeta}>
              {item.self_name ? (
                <Text style={styles.groupMetaText}>
                  <Text style={styles.groupMetaLabel}>你的名稱  </Text>{item.self_name}
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
          <TouchableOpacity
            style={styles.optionBtn}
            onPress={() => {
              setScene({ type: 'detail', room: item });
              fetchRoomDetail(item.group_name).then(fresh => {
                if (!fresh) return;
                setScene(s =>
                  s.type === 'detail' && s.room.group_name === item.group_name
                    ? { type: 'detail', room: fresh } : s
                );
              });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.optionBtnText}>⋯</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const GroupEmptyState = () => (
    <View style={styles.groupEmptyWrap}>
      <View style={styles.groupEmptyIconWrap}>
        <Text style={styles.groupEmptyIcon}>◈</Text>
      </View>
      <Text style={styles.groupEmptyTitle}>尚無群組</Text>
      <Text style={styles.groupEmptyMsg}>建立新群組或輸入群組名稱加入</Text>
      <View style={styles.groupEmptyActions}>
        <TouchableOpacity style={styles.groupEmptyBtn} onPress={() => setScene({ type: 'create' })}>
          <Text style={styles.groupEmptyBtnText}>＋ 建立群組</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.groupEmptyBtnSecondary} onPress={() => setScene({ type: 'join' })}>
          <Text style={styles.groupEmptyBtnSecondaryText}>加入群組</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── 主體 ────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* 原頂部 Bar 已移至 Tabs Header */}
      <Tabs.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15, gap: 10 }}>
              {tab === 'groups' ? (
                <>
                  {groupsLastRefresh && (
                    <Text style={styles.headerTime}>{groupsLastRefresh.toLocaleTimeString('zh-TW')}</Text>
                  )}
                  <TouchableOpacity style={styles.groupHeaderJoinBtn} onPress={() => setScene({ type: 'join' })}>
                    <Text style={styles.groupHeaderJoinText}>加入</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.groupHeaderCreateBtn} onPress={() => setScene({ type: 'create' })}>
                    <Text style={styles.groupHeaderCreateText}>＋ 新建</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.refreshIconBtn} onPress={handleGroupRefresh} disabled={groupsLoading}>
                    {groupsLoading
                      ? <ActivityIndicator size="small" color="#0B6EFD" />
                      : <Text style={styles.refreshIcon}>↻</Text>
                    }
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {lastRefresh && (
                    <Text style={styles.headerTime}>{lastRefresh.toLocaleTimeString('zh-TW')}</Text>
                  )}
                  <TouchableOpacity style={styles.refreshIconBtn} onPress={refreshAll} disabled={loading}>
                    {loading
                      ? <ActivityIndicator size="small" color="#0B6EFD" />
                      : <Text style={styles.refreshIcon}>↻</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </View>
          ),
        }}
      />

      {/* Tab 列 */}
      <View style={styles.tabBar}>
        {([
          { key: 'contacts', label: '聯絡人', count: contacts.length },
          { key: 'groups',   label: '群組',   count: groupRooms.length },
          { key: 'lobby',    label: '區域搜索', count: lobbyPeers.length },
          { key: 'blocklist',label: '封鎖',   count: blocklist.length },
        ] as { key: Tab; label: string; count: number }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            <View style={[styles.tabBadge, tab === t.key && styles.tabBadgeActive]}>
              <Text style={styles.tabBadgeText}>{t.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* 內容區 */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {tab === 'contacts' && (
          <FlatList
            data={contacts}
            keyExtractor={i => i.dest_hash}
            renderItem={({ item }) => <ContactRow item={item} />}
            ListEmptyComponent={<EmptyState icon="🤝" msg={"尚無已儲存聯絡人\n從 Lobby 新增節點"} />}
            contentContainerStyle={contacts.length === 0 && styles.listEmpty}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
        {tab === 'lobby' && (
          <FlatList
            data={lobbyPeers}
            keyExtractor={i => i.dest_hash}
            renderItem={({ item }) => <LobbyRow item={item} />}
            ListEmptyComponent={<EmptyState icon="📡" msg="Lobby 中尚無活躍節點" />}
            contentContainerStyle={lobbyPeers.length === 0 && styles.listEmpty}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
        {tab === 'blocklist' && (
          <FlatList
            data={blocklist}
            keyExtractor={i => i.dest_hash}
            renderItem={({ item }) => <BlockRow item={item} />}
            ListEmptyComponent={<EmptyState icon="🔓" msg="封鎖名單為空" />}
            contentContainerStyle={blocklist.length === 0 && styles.listEmpty}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
        {tab === 'groups' && (
          <FlatList
            data={groupRooms}
            keyExtractor={r => r.group_name}
            renderItem={({ item, index }) => <GroupRow item={item} index={index} />}
            ListEmptyComponent={!groupsLoading ? <GroupEmptyState /> : null}
            contentContainerStyle={groupRooms.length === 0 ? styles.listEmpty : undefined}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshing={groupsLoading}
            onRefresh={handleGroupRefresh}
          />
        )}
      </Animated.View>

      {/* ── Modal：聯絡人詳細 / 編輯 ── */}
      {detailContact && (
        <ContactDetailModal
          contact={detailContact}
          onClose={() => setDetailContact(null)}
          onEditNickname={editNickname}
          onEditNote={editNote}
          onBlock={async (reason) => {
            try {
              await blockContact(detailContact.dest_hash, reason);
              setDetailContact(null);
            } catch (e: any) {
              Alert.alert('封鎖失敗', e.message);
            }
          }}
          onDelete={async () => {
            try {
              await deleteContact(detailContact.dest_hash);
              setDetailContact(null);
            } catch (e: any) {
              Alert.alert('刪除失敗', e.message);
            }
          }}
          onRefresh={async () => {
            await loadContacts();
            // 更新 modal 內的資料
            const json = await apiFetch(`/getContact/${detailContact.dest_hash}`).catch(() => null);
            if (json?.data?.contact) setDetailContact(json.data.contact);
          }}
        />
      )}

      {/* ── Modal：封鎖詳細 ── */}
      {detailBlocked && (
        <BlockDetailModal
          blocked={detailBlocked}
          onClose={() => setDetailBlocked(null)}
          onUnblock={async () => {
            try {
              await unblockContact(detailBlocked.dest_hash);
              setDetailBlocked(null);
            } catch (e: any) {
              Alert.alert('解封失敗', e.message);
            }
          }}
        />
      )}

      {/* ── Modal：從 Lobby 新增聯絡人 ── */}
      {showAddModal && selectedLobbyPeer && (
        <AddContactModal
          peer={selectedLobbyPeer}
          isSaved={!!selectedLobbyPeer.is_saved_contact}
          onClose={() => { setShowAddModal(false); setSelectedLobbyPeer(null); }}
          onSave={async (nickname, notes) => {
            try {
              await saveContact(selectedLobbyPeer, nickname, notes);
              setShowAddModal(false);
              setSelectedLobbyPeer(null);
              setTab('contacts');
            } catch (e: any) {
              Alert.alert('儲存失敗', e.message);
            }
          }}
          onHide={async (reason) => {
            try {
              await hideLink(selectedLobbyPeer.dest_hash, reason);
              setShowAddModal(false);
              setSelectedLobbyPeer(null);
            } catch (e: any) {
              Alert.alert('隱藏失敗', e.message);
            }
          }}
        />
      )}

      {/* ── 群組 Modals ── */}
      {scene.type === 'create' && (
        <CreateGroupModal
          lobbyPeers={lobbyPeers}
          onClose={() => setScene({ type: 'none' })}
          onCreate={async (group_name, self_name, members, invite_message) => {
            await createGroup(group_name, self_name, members, invite_message);
            setScene({ type: 'none' });
            await handleGroupRefresh();
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
              await handleGroupRefresh();
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
// Sub-Modals
// ─────────────────────────────────────────────────────────────────────────────

// ── 聯絡人詳細 Modal ─────────────────────────────────────────────────────────

type ContactDetailModalProps = {
  contact: Contact;
  onClose: () => void;
  onEditNickname: (dest_hash: string, nickname: string) => Promise<void>;
  onEditNote: (dest_hash: string, note: string) => Promise<void>;
  onBlock: (reason: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRefresh: () => Promise<void>;
};

const ContactDetailModal: React.FC<ContactDetailModalProps> = ({
  contact, onClose, onEditNickname, onEditNote, onBlock, onDelete, onRefresh,
}) => {
  const [nicknameEdit, setNicknameEdit] = useState(contact.nickname ?? contact.announced_name ?? '');
  const [noteEdit, setNoteEdit]         = useState(contact.notes ?? '');
  const [blockReason, setBlockReason]   = useState('');
  const [showBlock, setShowBlock]       = useState(false);
  const [saving, setSaving]             = useState<string | null>(null);

  const doEditNickname = async () => {
    setSaving('nickname');
    try { await onEditNickname(contact.dest_hash, nicknameEdit); await onRefresh(); }
    catch (e: any) { Alert.alert('編輯失敗', e.message); }
    finally { setSaving(null); }
  };

  const doEditNote = async () => {
    setSaving('note');
    try { await onEditNote(contact.dest_hash, noteEdit); await onRefresh(); }
    catch (e: any) { Alert.alert('編輯失敗', e.message); }
    finally { setSaving(null); }
  };

  const doBlock = async () => {
    setSaving('block');
    try { await onBlock(blockReason); }
    finally { setSaving(null); }
  };

  const doDelete = async () => {
    Alert.alert('刪除聯絡人', `確定要刪除 ${contact.nickname || contact.announced_name || contact.dest_hash.slice(0, 8)} 嗎？\n聊天記錄也將一併清除。`, [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
        setSaving('delete');
        try { await onDelete(); }
        finally { setSaving(null); }
      }},
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalSheet}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalAvatar}>
              <Text style={styles.modalAvatarText}>
                {(contact.nickname || contact.announced_name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {contact.nickname || contact.announced_name || '未命名'}
              </Text>
              <Text style={styles.modalSub}>{contact.dest_hash}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>

            {/* 狀態徽章 */}
            <View style={styles.statRow}>
              <View style={[styles.statChip, contact.online ? styles.chipOnline : styles.chipOffline]}>
                <Text style={styles.chipText}>{contact.online ? '● 線上' : '○ 離線'}</Text>
              </View>
              {contact.announced_name && (
                <View style={styles.statChip}>
                  <Text style={styles.chipText}>📡 {contact.announced_name}</Text>
                </View>
              )}
            </View>

            {/* 暱稱編輯 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>暱稱</Text>
              <View style={styles.fieldRow}>
                <TextInput
                  style={styles.fieldInput}
                  value={nicknameEdit}
                  onChangeText={setNicknameEdit}
                  placeholder="輸入暱稱"
                  placeholderTextColor="#999999"
                />
                <TouchableOpacity
                  style={[styles.fieldBtn, saving === 'nickname' && styles.fieldBtnLoading]}
                  onPress={doEditNickname}
                  disabled={saving !== null}
                >
                  {saving === 'nickname'
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.fieldBtnText}>儲存</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* 備註編輯 */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>備註</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti]}
                value={noteEdit}
                onChangeText={setNoteEdit}
                placeholder="輸入備註內容"
                placeholderTextColor="#999999"
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.fieldBtnFull, saving === 'note' && styles.fieldBtnLoading]}
                onPress={doEditNote}
                disabled={saving !== null}
              >
                {saving === 'note'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.fieldBtnText}>儲存備註</Text>
                }
              </TouchableOpacity>
            </View>

            {/* 封鎖區 */}
            <View style={styles.dangerZone}>
              <Text style={styles.dangerLabel}>危險操作</Text>
              <TouchableOpacity
                style={[styles.dangerBtn, { marginBottom: 8 }, saving === 'delete' && styles.fieldBtnLoading]}
                onPress={doDelete}
                disabled={saving !== null}
              >
                {saving === 'delete'
                  ? <ActivityIndicator size="small" color="#C0392B" />
                  : <Text style={styles.dangerBtnText}>✕ 刪除聯絡人</Text>
                }
              </TouchableOpacity>
              {!showBlock ? (
                <TouchableOpacity style={styles.dangerBtn} onPress={() => setShowBlock(true)}>
                  <Text style={styles.dangerBtnText}>⊘ 封鎖此聯絡人</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <TextInput
                    style={styles.fieldInput}
                    value={blockReason}
                    onChangeText={setBlockReason}
                    placeholder="封鎖原因（選填）"
                    placeholderTextColor="#999999"
                  />
                  <View style={styles.dangerConfirmRow}>
                    <TouchableOpacity style={styles.cancelSmallBtn} onPress={() => setShowBlock(false)}>
                      <Text style={styles.cancelSmallText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dangerConfirmBtn, saving === 'block' && styles.fieldBtnLoading]}
                      onPress={doBlock}
                      disabled={saving !== null}
                    >
                      {saving === 'block'
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.dangerBtnText}>確認封鎖</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── 封鎖詳細 Modal ───────────────────────────────────────────────────────────

type BlockDetailModalProps = {
  blocked: BlockedContact;
  onClose: () => void;
  onUnblock: () => Promise<void>;
};

const BlockDetailModal: React.FC<BlockDetailModalProps> = ({ blocked, onClose, onUnblock }) => {
  const [loading, setLoading] = useState(false);

  const doUnblock = async () => {
    setLoading(true);
    try { await onUnblock(); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.avatarBlocked}>
              <Text style={styles.avatarBlockedText}>⊘</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{blocked.announced_name || '未命名節點'}</Text>
              <Text style={styles.modalSub}>{blocked.dest_hash}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.infoBlock}>
              <InfoRow label="封鎖原因" value={blocked.reason || '—'} />
              <InfoRow label="封鎖時間" value={formatTime(blocked.blocked_at)} />
              <InfoRow label="Hash"     value={blocked.dest_hash} mono />
            </View>

            <TouchableOpacity
              style={[styles.unblockBtn, loading && styles.fieldBtnLoading]}
              onPress={doUnblock}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.unblockBtnText}>🔓 解除封鎖</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── 新增聯絡人 Modal ─────────────────────────────────────────────────────────

type AddContactModalProps = {
  peer: LobbyPeer;
  isSaved: boolean;
  onClose: () => void;
  onSave: (nickname: string, notes: string) => Promise<void>;
  onHide: (reason: string) => Promise<void>;
};

const AddContactModal: React.FC<AddContactModalProps> = ({
  peer, isSaved, onClose, onSave, onHide,
}) => {
  const [nickname, setNickname]     = useState('');
  const [notes, setNotes]           = useState('');
  const [hideReason, setHideReason] = useState('');
  const [mode, setMode]             = useState<'save' | 'hide'>('save');
  const [loading, setLoading]       = useState(false);

  const doAction = async () => {
    setLoading(true);
    try {
      if (mode === 'save') await onSave(nickname, notes);
      else await onHide(hideReason);
    } finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(peer.announced_name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{peer.announced_name || '未命名節點'}</Text>
              <Text style={styles.modalSub}>{peer.dest_hash}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isSaved ? (
            <View style={styles.modalBody}>
              <View style={styles.alreadySavedBox}>
                <Text style={styles.alreadySavedText}>✓ 此節點已儲存為聯絡人</Text>
              </View>
              <TouchableOpacity style={styles.cancelSmallBtn} onPress={onClose}>
                <Text style={styles.cancelSmallText}>關閉</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.modalBody}>
              {/* 模式切換 */}
              <View style={styles.modeSwitch}>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'save' && styles.modeBtnActive]}
                  onPress={() => setMode('save')}
                >
                  <Text style={[styles.modeBtnText, mode === 'save' && styles.modeBtnTextActive]}>＋ 儲存聯絡人</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'hide' && styles.modeBtnDanger]}
                  onPress={() => setMode('hide')}
                >
                  <Text style={[styles.modeBtnText, mode === 'hide' && styles.modeBtnTextActive]}>⊘ 隱藏節點</Text>
                </TouchableOpacity>
              </View>

              {mode === 'save' ? (
                <>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>暱稱</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={nickname}
                      onChangeText={setNickname}
                      placeholder="自定義暱稱（選填）"
                      placeholderTextColor="#999999"
                    />
                  </View>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>備註</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMulti]}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="備忘事項（選填）"
                      placeholderTextColor="#999999"
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>隱藏原因</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={hideReason}
                    onChangeText={setHideReason}
                    placeholder="原因（選填）"
                    placeholderTextColor="#999999"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.fieldBtnFull,
                  mode === 'hide' && styles.dangerConfirmBtn,
                  loading && styles.fieldBtnLoading,
                ]}
                onPress={doAction}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.fieldBtnText}>
                      {mode === 'save' ? '✓ 確認儲存' : '確認隱藏'}
                    </Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── InfoRow 輔助元件 ─────────────────────────────────────────────────────────

const InfoRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, mono && styles.infoValueMono]} numberOfLines={2}>{value}</Text>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// 樣式
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:       '#F6F6F6',
  surface:  '#FFFFFF',
  surface2: '#FFFFFF',
  border:   '#E0E0E0',
  accent:   '#0B6EFD',
  accentDim:'#0B6EFD',
  text:     '#222222',
  textDim:  '#666666',
  textMute: '#999999',
  danger:   '#c0392b',
  dangerBg: '#FDECEC',
  green:    '#00A35C',
  greenBg:  '#E8F5E9',
};

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
    backgroundColor: C.surface2,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle:    { color: C.text, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTime:     { color: C.textMute, fontSize: 11, fontFamily: 'monospace' },
  refreshIconBtn: { padding: 6 },
  refreshIcon:    { color: C.accent, fontSize: 20 },

  // ── Tab Bar ──
  tabBar: {
    flexDirection: 'row', backgroundColor: C.surface2,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: C.accent },
  tabLabel:       { color: C.textDim, fontSize: 13, fontFamily: 'monospace' },
  tabLabelActive: { color: C.accent },
  tabBadge:       { backgroundColor: C.border, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: C.accentDim },
  tabBadgeText:   { color: C.textDim, fontSize: 10 },

  // ── 列表行 ──
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bg,
  },
  rowSaved:   { backgroundColor: '#F0F8FF' },
  rowBlocked: { backgroundColor: '#FFF5F5' },
  rowLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  rowInfo:    { flex: 1 },
  rowNameLine:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName:    { color: C.text, fontSize: 14, fontWeight: '600' },
  rowNameBlocked: { color: '#C0392B', fontSize: 14, fontWeight: '600' },
  rowSub:     { color: C.textDim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  rowChevron: { color: C.textMute, fontSize: 20 },
  rowActions: { flexDirection: 'row', gap: 8 },

  separator:  { height: 1, backgroundColor: C.border, marginLeft: 72 },
  listEmpty:  { flex: 1 },

  // ── Avatar ──
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  avatarSaved: { backgroundColor: '#1a5a3a' },
  avatarText:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  avatarBlocked: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarBlockedText: { color: '#c0392b', fontSize: 18 },

  // ── 在線狀態點 ──
  dotOnline:  { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  dotOffline: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.textMute },

  // ── 徽章 ──
  badge:     { backgroundColor: C.greenBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#1A6B3C', fontSize: 11 },
  badgeAdd:  { backgroundColor: C.accentDim, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeAddText: { color: '#fff', fontSize: 11 },

  // ── 空白提示 ──
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyMsg:  { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // ── Modal 基底 ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 28,
    borderTopWidth: 1, borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  modalAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  modalTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  modalSub:   { color: C.textDim, fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  closeBtn:   { padding: 8 },
  closeBtnText: { color: C.textDim, fontSize: 18 },
  modalBody:  { padding: 16 },

  // ── 狀態列 ──
  statRow:   { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  statChip:  { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  chipOnline: { borderColor: C.green },
  chipOffline: { borderColor: C.border },
  chipText:  { color: C.textDim, fontSize: 12 },

  // ── 表單欄位 ──
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { color: C.textDim, fontSize: 11, fontFamily: 'monospace', marginBottom: 6, letterSpacing: 0.5 },
  fieldRow:   { flexDirection: 'row', gap: 8 },
  fieldInput: {
    flex: 1, backgroundColor: C.surface, color: C.text,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, borderWidth: 1, borderColor: C.border,
  },
  fieldInputMulti: { height: 80, textAlignVertical: 'top' },
  fieldBtn: {
    backgroundColor: C.accentDim, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center',
  },
  fieldBtnFull: {
    backgroundColor: C.accentDim, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  fieldBtnLoading: { opacity: 0.6 },
  fieldBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── 危險區 ──
  dangerZone:     { marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  dangerLabel:    { color: '#C0392B', fontSize: 11, fontFamily: 'monospace', marginBottom: 10, letterSpacing: 0.5 },
  dangerBtn:      { backgroundColor: C.dangerBg, borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F4B7B7' },
  dangerBtnText:  { color: '#C0392B', fontSize: 14, fontWeight: '600' },
  dangerConfirmRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dangerConfirmBtn: { flex: 1, backgroundColor: C.danger, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },

  // ── 解封按鈕 ──
  unblockBtn: { backgroundColor: C.greenBg, borderRadius: 8, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#A8DDB5' },
  unblockBtnText: { color: '#1A6B3C', fontSize: 14, fontWeight: '600' },

  // ── 資訊區 ──
  infoBlock: { backgroundColor: C.surface2, borderRadius: 10, padding: 14, marginBottom: 16, gap: 10 },
  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  infoLabel: { color: C.textDim, fontSize: 12, width: 72 },
  infoValue: { color: C.text, fontSize: 13, flex: 1, textAlign: 'right' },
  infoValueMono: { fontFamily: 'monospace', fontSize: 11 },

  // ── 模式切換 ──
  modeSwitch: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modeBtn:    { flex: 1, backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  modeBtnActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  modeBtnDanger: { backgroundColor: C.dangerBg, borderColor: '#F4B7B7' },
  modeBtnText:   { color: C.textDim, fontSize: 13 },
  modeBtnTextActive: { color: '#fff' },

  // ── 取消按鈕 ──
  cancelSmallBtn: { backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 10, alignItems: 'center', flex: 1 },
  cancelSmallText: { color: C.textDim, fontSize: 13 },

  // ── 已儲存提示 ──
  alreadySavedBox: { backgroundColor: C.greenBg, borderRadius: 10, padding: 16, marginBottom: 16, alignItems: 'center' },
  alreadySavedText: { color: '#1A6B3C', fontSize: 14 },

  // ── 群組 Tab ──
  groupEmptyWrap:    { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  groupEmptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: C.border,
  },
  groupEmptyIcon:            { fontSize: 32, color: C.accentDim, fontFamily: 'monospace' },
  groupEmptyTitle:           { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: 'monospace', marginBottom: 8 },
  groupEmptyMsg:             { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  groupEmptyActions:         { flexDirection: 'row', gap: 10 },
  groupEmptyBtn:             { backgroundColor: C.accentDim, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  groupEmptyBtnText:         { color: '#fff', fontSize: 13, fontWeight: '700' },
  groupEmptyBtnSecondary:    { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  groupEmptyBtnSecondaryText:{ color: C.textDim, fontSize: 13 },

  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingRight: 16,
    backgroundColor: C.bg, overflow: 'hidden',
  },
  groupColorBar:    { width: 3, alignSelf: 'stretch', marginRight: 12, backgroundColor: '#0B6EFD' },
  groupIcon: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    backgroundColor: '#EEF2FF',
  },
  groupIconText:    { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: 'monospace' },
  groupInfo:        { flex: 1 },
  groupNameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  groupName:        { color: C.text, fontSize: 15, fontWeight: '600', fontFamily: 'monospace', flex: 1 },
  groupMeta:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupMetaText:    { color: C.textDim, fontSize: 11, fontFamily: 'monospace' },
  groupMetaLabel:   { color: C.textMute },
  memberCountChip:  { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: C.border },
  memberCountText:  { color: C.textDim, fontSize: 10 },
  groupRowChevron:  { color: C.textMute, fontSize: 20, marginLeft: 4 },

  groupHeaderJoinBtn:    { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  groupHeaderJoinText:   { color: '#000', fontSize: 12, fontFamily: 'monospace' },
  groupHeaderCreateBtn:  { backgroundColor: C.accentDim, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  groupHeaderCreateText: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  // ── 選項按鈕 ──
  optionBtn:     { padding: 8, alignItems: 'center', justifyContent: 'center' },
  optionBtnText: { color: C.textMute, fontSize: 18, letterSpacing: 1 },
});
