// filepath: utils/location.ts
// Utilities for fetching the user's GPS location and managing offline tile packs.

import * as Location from 'expo-location';
import MapboxGL from '@rnmapbox/maps';
import {
  MAP_STYLE_URL,
  OFFLINE_PACK_BOUNDS_OFFSET,
  OFFLINE_PACK_MIN_ZOOM,
  OFFLINE_PACK_MAX_ZOOM,
} from '../constants/mapbox';

/**
 * Request foreground location permission and return the current GPS coordinates.
 * Throws an error with message 'PERMISSION_DENIED' if the user declines.
 */
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

/**
 * Proactively download a small offline tile pack around the given coordinates.
 * This ensures the mini-map can render even if the user goes offline later.
 *
 * Safe to call multiple times for the same location — packs are keyed by name
 * and Mapbox will skip already-downloaded packs.
 */
export async function ensureOfflineTiles(
  latitude: number,
  longitude: number,
): Promise<void> {
  const packName = `loc_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;

  try {
    await MapboxGL.offlineManager.createPack(
      {
        name: packName,
        styleURL: MAP_STYLE_URL,
        bounds: [
          [longitude - OFFLINE_PACK_BOUNDS_OFFSET, latitude - OFFLINE_PACK_BOUNDS_OFFSET],
          [longitude + OFFLINE_PACK_BOUNDS_OFFSET, latitude + OFFLINE_PACK_BOUNDS_OFFSET],
        ],
        minZoom: OFFLINE_PACK_MIN_ZOOM,
        maxZoom: OFFLINE_PACK_MAX_ZOOM,
      },
      () => {},  // progressListener (required)
      () => {},  // errorListener (optional)
    );
  } catch {
    // Silently fail — offline tiles are optional.
    // The fallback UI will handle missing tiles.
  }
}
