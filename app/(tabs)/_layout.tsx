import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { MessagingProvider } from '../context/MessagingContext';

export default function TabLayout() {
  return (
    <MessagingProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#666666',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#222222',
          headerTitleStyle: { color: '#222222' },
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E0E0E0',
          },
          sceneStyle: { backgroundColor: '#F6F6F6' },
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
          name="contacts"
          options={{
            title: '聯絡人',
            tabBarLabel: 'CONTACTS',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>🏠</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: '群組',
            tabBarLabel: 'GROUPS',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>👥</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="identity"
          options={{
            title: '個別資訊',
            tabBarLabel: 'IDENTITY',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>🧑‍🔧</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="j_settings"
          options={{
            title: '設定',
            tabBarLabel: 'JSON',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>⚙️</Text>
            ),
          }}
        />
      </Tabs>
    </MessagingProvider>
  );
}
