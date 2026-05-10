import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';

import { ensureInitialOfflineMapTiles } from '../utils/location';

export default function RootLayout() {
  useEffect(() => {
    let active = true;

    ensureInitialOfflineMapTiles({
      onStart: () => {
        if (!active) return;
        Alert.alert('離線地圖下載中', '正在下載虎尾 2 公里範圍地圖，完成後可離線查看。');
      },
      onComplete: () => {
        if (!active) return;
        Alert.alert('離線地圖已完成', '虎尾 2 公里範圍地圖已可離線使用。');
      },
      onError: () => {
        if (!active) return;
        Alert.alert('離線地圖下載失敗', '目前無法下載離線地圖，請確認網路後重新開啟 App。');
      },
    });

    return () => {
      active = false;
    };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
