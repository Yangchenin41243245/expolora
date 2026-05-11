import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { getCurrentLocation, ensureOfflineTiles } from '../utils/location';

const OFFLINE_RADIUS_KM = 2;

export default function RootLayout() {
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { latitude, longitude } = await getCurrentLocation();
        if (!active) return;
        await ensureOfflineTiles(latitude, longitude, OFFLINE_RADIUS_KM);
      } catch {
        // Location permission denied or GPS unavailable — offline tiles skipped.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
