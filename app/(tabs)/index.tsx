import React, { useCallback, useState } from 'react';
import { Bubble, GiftedChat, IMessage, InputToolbar } from 'react-native-gifted-chat';

export default function Screen1() {
  const [messages, setMessages] = useState<IMessage[]>([
    {
      _id: '1',
      text: '你好！歡迎使用聊天室 👋',
      createdAt: new Date(),
      user: {
        _id: 2,
        name: '好友',
        avatar: 'https://placeimg.com/140/140/any',
      },
    },
  ]);

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    setMessages((previousMessages) =>
      GiftedChat.append(previousMessages, newMessages)
    );

    // 模擬自動回覆
    setTimeout(() => {
      const replyMessage: IMessage = {
        _id: Date.now().toString(),
        text: '這是自動回覆！',
        createdAt: new Date(),
        user: { _id: 2, name: '好友' },
      };
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, [replyMessage])
      );
    }, 1000);
  }, []);

  // === 美化氣泡（顏色、圓角、陰影、比例）===
  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: {
          backgroundColor: '#06C755',   // 您的經典綠色
          borderRadius: 20,
          padding: 12,
          marginVertical: 4,
        },
        left: {
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          padding: 12,
          marginVertical: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 3,
          elevation: 2,
        },
      }}
      textStyle={{
        right: { color: '#000', fontSize: 16 },
        left: { color: '#000', fontSize: 16 },
      }}
      timeTextStyle={{
        right: { color: '#FFFFFF', fontSize: 10 }, // 綠底用白色更清晰
        left: { color: '#666', fontSize: 10 },
      }}
    />
  );

  // === 美化輸入工具列（底部欄位）===
  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={{
        backgroundColor: '#F0F0F0',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        paddingVertical: 6,
        paddingHorizontal: 8,
      }}
    />
  );

  return (
    <GiftedChat
      messages={messages}
      onSend={onSend}
      user={{ _id: 1 }}
      // === 背景與整體比例美化 ===
      messagesContainerStyle={{
        backgroundColor: '#E5DDD5',   // WhatsApp 經典背景
        paddingHorizontal: 10,
      }}
      // === 輸入框 placeholder ===
      textInputProps={{
        placeholder: '輸入訊息...',
        placeholderTextColor: '#999',
      }}
      // === 其他美化設定 ===
      renderBubble={renderBubble}
      renderInputToolbar={renderInputToolbar}
      isSendButtonAlwaysVisible={true}     // 永遠顯示漂亮送出箭頭
      timeFormat="HH:mm"
      dateFormat="YYYY/MM/DD"
      // 如果您用 Expo Router，可取消註解下面這行解決鍵盤問題：
      // keyboardAvoidingViewProps={{ keyboardVerticalOffset: useHeaderHeight() }}
    />
  );
}