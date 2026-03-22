import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
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
} from 'react-native-gifted-chat';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const [messages, setMessages] = useState<IMessage[]>([
    {
      _id: '1',
      text: '你好！',
      createdAt: new Date(Date.now() - 60000 * 5),
      user: {
        _id: 2,
        name: 'TESTING_BOT',
      },
    },
  ]);

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    setMessages((prev) => GiftedChat.append(prev, newMessages));

    setTimeout(() => {
      const reply: IMessage = {
        _id: Date.now().toString(),
        text: '收到user的訊息了！',
        createdAt: new Date(),
        user: { _id: 2, name: 'TESTING_BOT' },
      };
      setMessages((prev) => GiftedChat.append(prev, [reply]));
    }, 1000);
  }, []);

  // ── tick 整合進 renderBubble，不再需要 renderMessage ──
  const renderBubble = (props: any) => {
    const isMyMessage = props.currentMessage?.user?._id === 1;

    return (
      <View>
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: '#00C853',
              borderTopRightRadius: 20,
              borderTopLeftRadius: 20,
              borderBottomRightRadius: 4,
              borderBottomLeftRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginVertical: 2,
            },
            left: {
              backgroundColor: '#FFFFFF',
              borderTopRightRadius: 20,
              borderTopLeftRadius: 20,
              borderBottomRightRadius: 20,
              borderBottomLeftRadius: 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginVertical: 2,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.12,
              shadowRadius: 4,
              elevation: 2,
            },
          }}
          textStyle={{
            right: { color: '#000', fontSize: 16, lineHeight: 22 },
            left:  { color: '#000', fontSize: 16, lineHeight: 22 },
          }}
          timeTextStyle={{
            right: { color: 'rgba(0,0,0,0.55)', fontSize: 11 },
            left:  { color: '#888', fontSize: 11 },
          }}
        />
        {isMyMessage && (
          <View style={styles.tickContainer}>
            <Text style={styles.tick}>✓✓</Text>
          </View>
        )}
      </View>
    );
  };

  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={styles.primaryStyle}
    />
  );

  const renderSend = (props: any) => {
    const hasText = props.text?.trim().length > 0;
    return (
      <Send {...props} disabled={!hasText} containerStyle={styles.sendContainer}>
        <Ionicons
          name="send"
          size={24}
          color={hasText ? '#00C853' : '#AAAAAA'}
        />
      </Send>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F6" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerName}>小綠</Text>
        <View style={{ width: 40 }} />
      </View>

      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: 1 }}
        renderBubble={renderBubble}
        // renderMessage 已移除，tick 整合在 renderBubble 內
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        messagesContainerStyle={{ backgroundColor: '#E5DDD5' }}
        textInputProps={{
          placeholder: '輸入訊息',
          placeholderTextColor: '#999',
          style: { fontSize: 16 },
        }}
        isSendButtonAlwaysVisible={true}
        isScrollToBottomEnabled={true}
        scrollToBottomOffset={150}
        timeFormat="HH:mm"
        dateFormat="YYYY年M月D日"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  header: {
    height: 50,
    backgroundColor: '#F6F6F6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  inputToolbar: {
    backgroundColor: '#F6F6F6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8D8D8',
    paddingVertical: 6,
  },
  primaryStyle: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    marginHorizontal: 8,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 8,
  },
  tickContainer: {
    alignItems: 'flex-end',
    marginRight: 8,
    marginTop: -4,
  },
  tick: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.4)',
  },
});