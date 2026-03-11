import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView from 'react-native-webview';

export default function Screen2() {
  const [inputUrl, setInputUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const normalizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return 'https://' + trimmed;
    }
    return trimmed;
  };

  const handleGo = () => {
    const normalized = normalizeUrl(inputUrl);
    setInputUrl(normalized);
    setCurrentUrl(normalized);
  };

  const handleBack = () => webViewRef.current?.goBack();
  const handleForward = () => webViewRef.current?.goForward();
  const handleReload = () => webViewRef.current?.reload();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 網址列 */}
      <View style={styles.toolbar}>
        <TextInput
          style={styles.input}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={handleGo}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          placeholder="輸入網址..."
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.goButton} onPress={handleGo}>
          <Text style={styles.goButtonText}>前往</Text>
        </TouchableOpacity>
      </View>

      {/* 載入進度條 */}
      {loading && (
        <ActivityIndicator
          style={styles.loader}
          size="small"
          color="#007AFF"
        />
      )}

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(navState) => {
          setInputUrl(navState.url);
          setCanGoBack(navState.canGoBack);
          setCanGoForward(navState.canGoForward);
        }}
      />

      {/* 底部導航列 */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={handleBack}
          disabled={!canGoBack}
        >
          <Text style={[styles.navIcon, !canGoBack && styles.navIconDisabled]}>
            ◀
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={handleForward}
          disabled={!canGoForward}
        >
          <Text style={[styles.navIcon, !canGoForward && styles.navIconDisabled]}>
            ▶
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={handleReload}>
          <Text style={styles.navIcon}>↺</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => {
            setInputUrl('https://www.google.com');
            setCurrentUrl('https://www.google.com');
          }}
        >
          <Text style={styles.navIcon}>⌂</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000',
  },
  goButton: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  goButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loader: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  webview: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  navButton: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navIcon: {
    fontSize: 22,
    color: '#007AFF',
  },
  navIconDisabled: {
    color: '#999',
  },
});