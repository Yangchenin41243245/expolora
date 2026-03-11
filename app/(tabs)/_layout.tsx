import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'SNS對話',
          tabBarLabel: 'CHAT',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>💬</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="screen2"
        options={{
          title: '聊天室',
          tabBarLabel: 'ROOM',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="screen3"
        options={{
          title: '設定',
          tabBarLabel: 'NEW',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>⚙️</Text>
          ),
        }}
      />
    </Tabs>
  );
}