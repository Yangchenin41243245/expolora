// filepath: app/(tabs)/contacts.tsx
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
import { useMessaging } from '../context/MessagingContext';

// ── 型別 ─────────────────────────────────────────────────────────────────────

type Contact = {
  dest_hash: string;
  announced_name?: string;
  custom_nickname?: string;
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
  is_saved_contact?: boolean;
  online?: boolean;
};

type Tab = 'contacts' | 'lobby' | 'blocklist';

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
  const { host, port, selfDestHash } = useMessaging();
  const baseUrl = `http://${host}:${port}`;

  const [tab, setTab] = useState<Tab>('contacts');
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
      const all: LobbyPeer[] = json?.data?.lobby ?? [];
      setLobbyPeers(selfDestHash ? all.filter(p => p.dest_hash !== selfDestHash) : all);
    } catch { setLobbyPeers([]); }
  }, [apiFetch, selfDestHash]);

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

  const hideLink = async (dest_hash: string, reason: string) => {
    await apiPost('/hideLink', { dest_hash, reason: reason.trim() || 'ignore' });
    await refreshAll();
  };

  const unblockContact = async (dest_hash: string) => {
    await apiPost('/unblockContact', { dest_hash });
    await refreshAll();
  };

  // ── 渲染輔助 ────────────────────────────────────────────────────────────────

  const displayName = (c: Contact) =>
    c.custom_nickname || c.announced_name || shortHash(c.dest_hash);

  const onlineGlyph = (online?: boolean) =>
    online ? <View style={styles.dotOnline} /> : <View style={styles.dotOffline} />;

  // ── 聯絡人列表項目 ──────────────────────────────────────────────────────────

  const ContactRow = ({ item }: { item: Contact }) => (
    <TouchableOpacity style={styles.row} onPress={() => setDetailContact(item)} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.custom_nickname || item.announced_name || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <View style={styles.rowNameLine}>
            {onlineGlyph(item.online)}
            <Text style={styles.rowName}>{displayName(item)}</Text>
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {item.notes ? `📝 ${item.notes}` : shortHash(item.dest_hash)}
          </Text>
        </View>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );

  // ── Lobby 列表項目 ──────────────────────────────────────────────────────────

  const LobbyRow = ({ item }: { item: LobbyPeer }) => {
    const isSaved = item.is_saved_contact;
    return (
      <TouchableOpacity
        style={[styles.row, isSaved && styles.rowSaved]}
        onPress={() => { setSelectedLobbyPeer(item); setShowAddModal(true); }}
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
        </View>
      </TouchableOpacity>
    );
  };

  // ── 封鎖列表項目 ────────────────────────────────────────────────────────────

  const BlockRow = ({ item }: { item: BlockedContact }) => (
    <TouchableOpacity style={[styles.row, styles.rowBlocked]} onPress={() => setDetailBlocked(item)} activeOpacity={0.7}>
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
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );

  // ── 空白提示 ────────────────────────────────────────────────────────────────

  const EmptyState = ({ icon, msg }: { icon: string; msg: string }) => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyMsg}>{msg}</Text>
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
              {lastRefresh && (
                <Text style={styles.headerTime}>{lastRefresh.toLocaleTimeString('zh-TW')}</Text>
              )}
              <TouchableOpacity style={styles.refreshIconBtn} onPress={refreshAll} disabled={loading}>
                {loading
                  ? <ActivityIndicator size="small" color="#4a90e2" />
                  : <Text style={styles.refreshIcon}>↻</Text>
                }
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* Tab 列 */}
      <View style={styles.tabBar}>
        {([
          { key: 'contacts', label: '聯絡人', count: contacts.length },
          { key: 'lobby',    label: 'Lobby',  count: lobbyPeers.length },
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
  onRefresh: () => Promise<void>;
};

const ContactDetailModal: React.FC<ContactDetailModalProps> = ({
  contact, onClose, onEditNickname, onEditNote, onBlock, onRefresh,
}) => {
  const [nicknameEdit, setNicknameEdit] = useState(contact.custom_nickname ?? contact.announced_name ?? '');
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

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalAvatar}>
              <Text style={styles.modalAvatarText}>
                {(contact.custom_nickname || contact.announced_name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {contact.custom_nickname || contact.announced_name || '未命名'}
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
                  placeholderTextColor="#3a3d4a"
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
                placeholderTextColor="#3a3d4a"
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
                    placeholderTextColor="#3a3d4a"
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
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                      placeholderTextColor="#3a3d4a"
                    />
                  </View>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>備註</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMulti]}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="備忘事項（選填）"
                      placeholderTextColor="#3a3d4a"
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
                    placeholderTextColor="#3a3d4a"
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
  bg:       '#0f1117',
  surface:  '#1a1d27',
  surface2: '#12141e',
  border:   '#1e2130',
  accent:   '#4a90e2',
  accentDim:'#2a5298',
  text:     '#e0e0e0',
  textDim:  '#8a8d9a',
  textMute: '#3a3d4a',
  danger:   '#c0392b',
  dangerBg: '#2a1515',
  green:    '#27ae60',
  greenBg:  '#1a3320',
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
  rowSaved:   { backgroundColor: '#0f1a2a' },
  rowBlocked: { backgroundColor: '#160f0f' },
  rowLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  rowInfo:    { flex: 1 },
  rowNameLine:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName:    { color: C.text, fontSize: 14, fontWeight: '600' },
  rowNameBlocked: { color: '#8a3a3a', fontSize: 14, fontWeight: '600' },
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
    backgroundColor: '#2a1515', alignItems: 'center', justifyContent: 'center',
  },
  avatarBlockedText: { color: '#c0392b', fontSize: 18 },

  // ── 在線狀態點 ──
  dotOnline:  { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  dotOffline: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.textMute },

  // ── 徽章 ──
  badge:     { backgroundColor: '#1a3a2a', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#5acd8a', fontSize: 11 },
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
    flex: 1, backgroundColor: '#12141e', color: C.text,
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
  dangerLabel:    { color: '#7a3a3a', fontSize: 11, fontFamily: 'monospace', marginBottom: 10, letterSpacing: 0.5 },
  dangerBtn:      { backgroundColor: C.dangerBg, borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#5a2020' },
  dangerBtnText:  { color: '#e57373', fontSize: 14, fontWeight: '600' },
  dangerConfirmRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dangerConfirmBtn: { flex: 1, backgroundColor: C.danger, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },

  // ── 解封按鈕 ──
  unblockBtn: { backgroundColor: C.greenBg, borderRadius: 8, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#2a6040' },
  unblockBtnText: { color: '#5acd8a', fontSize: 14, fontWeight: '600' },

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
  modeBtnDanger: { backgroundColor: '#2a1515', borderColor: '#5a2020' },
  modeBtnText:   { color: C.textDim, fontSize: 13 },
  modeBtnTextActive: { color: '#fff' },

  // ── 取消按鈕 ──
  cancelSmallBtn: { backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 10, alignItems: 'center', flex: 1 },
  cancelSmallText: { color: C.textDim, fontSize: 13 },

  // ── 已儲存提示 ──
  alreadySavedBox: { backgroundColor: C.greenBg, borderRadius: 10, padding: 16, marginBottom: 16, alignItems: 'center' },
  alreadySavedText: { color: '#5acd8a', fontSize: 14 },
});