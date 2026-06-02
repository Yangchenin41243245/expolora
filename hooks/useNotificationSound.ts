import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef } from 'react';

export const useNotificationSound = () => {
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Audio.Sound.createAsync(require('../assets/audio/sms_received.mp3'))
      .then(({ sound }) => { soundRef.current = sound; })
      .catch(() => {});
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  return useCallback(async () => {
    try {
      await soundRef.current?.replayAsync();
    } catch { /* 靜默失敗 */ }
  }, []);
};
