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
          name="contacts"
          options={{
            title: '聯絡介面',
            tabBarLabel: 'CONTACTS',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>🏠</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="identity"
          options={{
            title: '個別資訊',
            href: null,
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: '通訊頁面',
            tabBarLabel: 'CHAT',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>💬</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="j_settings"
          options={{
            title: '設定',
            tabBarLabel: 'SETTINGS',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 24, color }}>⚙️</Text>
            ),
          }}
        />
      </Tabs>
    </MessagingProvider>
  );
}
