import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { MessagingProvider } from '../context/MessagingContext';

export default function TabLayout() {
  return (
    <MessagingProvider>
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
            title: '個別資訊',
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
    </MessagingProvider>
  );
}