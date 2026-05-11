// Web stub for utils/location.ts
// Offline tile packs are native-only; web gets no-op implementations.

import * as Location from 'expo-location';

export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
}> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('PERMISSION_DENIED');
  }

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
  };
}

export async function ensureOfflineTiles(
  _latitude: number,
  _longitude: number,
  _radiusKm?: number,
): Promise<void> {
  // No-op on web — offline tile packs are native only.
}

export async function ensureInitialOfflineMapTiles(): Promise<'cached' | 'downloaded' | 'failed'> {
  // No-op on web.
  return 'cached';
}
