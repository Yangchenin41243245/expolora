import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMessaging } from '../context/MessagingContext';

// ── 型別 ──────────────────────────────────────────────
type IdentityInfo = {
  identity: {
    hash: string;
    path: string;
    loaded: boolean;
  };
  destination_in: {
    hash: string;
    path: string;
    loaded: boolean;
  };
};

// ── 工具元件 ──────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  );
}

// ── 主元件 ────────────────────────────────────────────
export default function Screen2() {
  const { baseUrl } = useMessaging();

  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const fetchIdentity = useCallback(async () => {
    setIdentityLoading(true);
    setIdentityError(null);
    try {
      const res = await fetch(`${baseUrl}/identity`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 503) {
        setIdentityError('RNS 節點尚未初始化，請稍後再試。');
        return;
      }
      if (!res.ok) {
        setIdentityError(`伺服器錯誤：HTTP ${res.status}`);
        return;
      }
      const json: IdentityInfo = await res.json();
      setIdentity(json);
    } catch {
      setIdentityError('無法連線至伺服器，請確認設定是否正確。');
    } finally {
      setIdentityLoading(false);
    }
  }, [baseUrl]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>個人資訊</Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={fetchIdentity}
          disabled={identityLoading}
        >
          {identityLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>取得身份資訊</Text>
          )}
        </TouchableOpacity>

        {identityError && (
          <Text style={styles.errorText}>{identityError}</Text>
        )}

        {identity && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Identity</Text>
            <InfoRow label="Hash" value={identity.identity.hash} />
            <InfoRow label="Path" value={identity.identity.path} />
            <InfoRow
              label="已載入"
              value={identity.identity.loaded ? '✓ 是' : '✗ 否'}
            />

            <View style={styles.divider} />

            <Text style={styles.cardTitle}>Destination (IN)</Text>
            <InfoRow label="Hash" value={identity.destination_in.hash} />
            <InfoRow label="Path" value={identity.destination_in.path} />
            <InfoRow
              label="已載入"
              value={identity.destination_in.loaded ? '✓ 是' : '✗ 否'}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ── 樣式 ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1c1e',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  infoRow: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#8e8e93',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    color: '#1c1c1e',
    fontFamily: 'Courier',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ccc',
    marginVertical: 10,
  },
});