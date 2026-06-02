import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
} from '../app/context/MessagingContext';

// ── 共用常數 ─────────────────────────────────────────────────────────────────

const C = {
  bg:           '#F6F6F6',
  surface:      '#FFFFFF',
  surface2:     '#FFFFFF',
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

const shortHash = (h: string) => (h ? `${h.slice(0, 8)}…` : '—');

// Mirror backend guardrails so errors surface before the API call.
const MAX_MEMBERS_PER_OP  = 5;
const MAX_GROUP_NAME_BYTES = 64;
const MAX_USER_NAME_BYTES  = 32;

const utf8ByteLen = (s: string): number => {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0xD800 || code >= 0xE000) bytes += 3;
    else { i++; bytes += 4; }
  }
  return bytes;
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal：建立群組
// ─────────────────────────────────────────────────────────────────────────────

export type CreateGroupModalProps = {
  onClose: () => void;
  onCreate: (group_name: string, self_name: string) => Promise<void>;
};

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  onClose, onCreate,
}) => {
  const [groupName, setGroupName] = useState('');
  const [selfName, setSelfName]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');

  const handleCreate = async () => {
    setErrorMsg('');
    if (!groupName.trim()) { setErrorMsg('群組名稱不能空白'); return; }
    if (utf8ByteLen(groupName.trim()) > MAX_GROUP_NAME_BYTES) {
      setErrorMsg(`群組名稱不能超過 ${MAX_GROUP_NAME_BYTES} bytes`); return;
    }
    if (!selfName.trim()) { setErrorMsg('請輸入你在群組中的顯示名稱'); return; }
    if (utf8ByteLen(selfName.trim()) > MAX_USER_NAME_BYTES) {
      setErrorMsg(`顯示名稱不能超過 ${MAX_USER_NAME_BYTES} bytes`); return;
    }
    setLoading(true);
    try {
      await onCreate(groupName.trim(), selfName.trim());
    } catch (e: any) {
      setErrorMsg(e?.message ?? '建立失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>

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
              onPress={handleCreate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.primaryBtnText}>◈ 建立群組</Text>
              }
            </TouchableOpacity>

            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

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

export type JoinGroupModalProps = {
  onClose: () => void;
  onJoin: (group_name: string, self_name: string) => Promise<void>;
};

export const JoinGroupModal: React.FC<JoinGroupModalProps> = ({ onClose, onJoin }) => {
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                輸入已知的群組名稱與你的顯示名稱以加入群組。
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

export type GroupDetailModalProps = {
  room: GroupRoom;
  localDestHash?: string | null;
  onClose: () => void;
  onRename: (self_name: string) => Promise<void>;
  onAddMembers: () => void;
  onUnregister: () => Promise<void>;
};

export const GroupDetailModal: React.FC<GroupDetailModalProps> = ({
  room, localDestHash, onClose, onRename, onAddMembers, onUnregister,
}) => {
  const [newSelfName, setNewSelfName] = useState(room.self_name ?? '');
  const [saving, setSaving]           = useState<string | null>(null);

  const doRename = async () => {
    if (!newSelfName.trim()) { Alert.alert('請填寫', '顯示名稱不能空白'); return; }
    setSaving('rename');
    try { await onRename(newSelfName.trim()); }
    catch (e: any) { Alert.alert('更新失敗', e.message); }
    finally { setSaving(null); }
  };

  const allMembers   = room.members ?? [];
  const localPrefix  = localDestHash?.slice(0, 8) ?? '';
  const otherMembers = localPrefix
    ? allMembers.filter(m => m.dest_hash.slice(0, 8) !== localPrefix)
    : allMembers;
  const memberCount  = allMembers.length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalSheet}>

          <View style={styles.modalHeader}>
            <View style={[styles.groupIcon, { width: 44, height: 44, borderRadius: 12 }]}>
              <Text style={styles.groupIconText}>{room.group_name[0]?.toUpperCase() ?? '#'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{room.group_name}</Text>
              <Text style={styles.modalSub}>
                {memberCount > 0 ? `${memberCount} 位成員` : '尚無成員'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>


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

            {memberCount > 0 && (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>成員列表</Text>
                <View style={styles.memberListBox}>
                  {otherMembers.map((m, i) => (
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

            <TouchableOpacity style={styles.secondaryBtn} onPress={onAddMembers}>
              <Text style={styles.secondaryBtnText}>＋ 新增成員</Text>
            </TouchableOpacity>

            <View style={styles.dangerZone}>
              <Text style={styles.dangerLabel}>本地操作</Text>
              <TouchableOpacity style={styles.dangerBtn} onPress={onUnregister}>
                <Text style={styles.dangerBtnText}>⊗ 離開此群組</Text>
              </TouchableOpacity>
              <Text style={styles.dangerHint}>將通知其他成員並清除本地聊天記錄</Text>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal：新增成員
// ─────────────────────────────────────────────────────────────────────────────

export type AddMembersModalProps = {
  room: GroupRoom;
  lobbyPeers: ReturnType<typeof useMessaging>['lobbyPeers'];
  onClose: () => void;
  onAdd: (members: GroupMember[], invite_message: string) => Promise<void>;
};

export const AddMembersModal: React.FC<AddMembersModalProps> = ({
  room, lobbyPeers: lobbyPeersProp, onClose, onAdd,
}) => {
  const lobbyPeers = lobbyPeersProp ?? [];
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [displayNames, setDisplayNames]     = useState<Record<string, string>>({});
  const [inviteMsg, setInviteMsg]           = useState('');
  const [loading, setLoading]               = useState(false);

  const existingHashes = new Set(room.members?.map(m => m.dest_hash) ?? []);
  const available = lobbyPeers.filter(p => !existingHashes.has(p.dest_hash));

  const togglePeer = (dest_hash: string) => {
    setSelectedHashes(prev => {
      const next = new Set(prev);
      if (next.has(dest_hash)) {
        next.delete(dest_hash);
      } else if (next.size < MAX_MEMBERS_PER_OP) {
        next.add(dest_hash);
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedHashes.size === 0) { Alert.alert('請選擇', '至少選擇一位成員'); return; }
    if (selectedHashes.size > MAX_MEMBERS_PER_OP) {
      Alert.alert('人數超限', `每次最多新增 ${MAX_MEMBERS_PER_OP} 位成員`); return;
    }
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                  <Text style={styles.emptyPeerText}>Lobby 中無新的可邀請節點</Text>
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
  // ── Modal 基底 ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 28,
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
  modalIcon:    { color: '#fff', fontSize: 20, fontFamily: 'monospace' },
  modalTitle:   { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: 'monospace', flex: 1 },
  modalSub:     { color: C.textDim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  closeBtn:     { padding: 8 },
  closeBtnText: { color: C.textDim, fontSize: 18 },
  modalBody:    { padding: 16 },

  // ── 群組 Icon（GroupDetailModal header 用）──
  groupIcon: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  groupIconText:    { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: 'monospace' },

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
  peerPickRowSelected: { borderColor: C.accent, backgroundColor: '#EAF2FF' },
  peerPickCheck: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1, borderColor: C.textMute,
    alignItems: 'center', justifyContent: 'center',
  },
  peerPickCheckActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  checkMark:           { color: '#fff', fontSize: 12, fontWeight: '700' },
  peerPickAvatar: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  peerPickAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  peerPickName:       { color: C.text, fontSize: 13, fontWeight: '600' },
  peerPickHash:       { color: C.textDim, fontSize: 10, fontFamily: 'monospace', marginTop: 1 },
  displayNameRow:     { paddingLeft: 42, paddingBottom: 6 },
  displayNameInput: {
    backgroundColor: C.surface, color: C.text,
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

  // ── 成員列表 ──
  memberListBox: {
    backgroundColor: C.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  memberRowBorder:  { borderTopWidth: 1, borderTopColor: C.border },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  memberAvatarText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
  memberName:       { color: C.text, fontSize: 13 },
  memberHash:       { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 1 },

  // ── 資訊框 ──
  infoBox: {
    backgroundColor: '#EAF2FF', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 18,
  },
  infoBoxText: { color: C.textDim, fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },

  // ── 按鈕 ──
  primaryBtn: {
    backgroundColor: C.accentDim, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText:   { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
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
  btnLoading:    { opacity: 0.5 },

  // ── 危險區 ──
  dangerZone: {
    marginTop: 8, borderTopWidth: 1,
    borderTopColor: C.border, paddingTop: 16,
  },
  dangerLabel: {
    color: '#C0392B', fontSize: 10, fontFamily: 'monospace',
    letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase',
  },
  dangerBtn: {
    backgroundColor: '#FDECEC', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#F4B7B7',
  },
  dangerBtnText: { color: '#C0392B', fontSize: 13, fontFamily: 'monospace' },
  dangerHint:    { color: C.textMute, fontSize: 10, fontFamily: 'monospace', marginTop: 6, textAlign: 'center' },

  errorText: {
    color: '#C0392B', fontSize: 12, fontFamily: 'monospace',
    marginTop: 10, textAlign: 'center',
  },
});
