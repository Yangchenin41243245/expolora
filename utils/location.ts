// filepath: utils/location.ts
// Utilities for fetching the user's GPS location and managing offline tile packs.

import * as Location from 'expo-location';
import MapboxGL from '@rnmapbox/maps';
import {
  INITIAL_OFFLINE_MAP_CENTER,
  INITIAL_OFFLINE_MAP_RADIUS_KM,
  MAPBOX_ACCESS_TOKEN,
  MAP_STYLE_URL,
  OFFLINE_PACK_BOUNDS_OFFSET,
  OFFLINE_PACK_MIN_ZOOM,
  OFFLINE_PACK_MAX_ZOOM,
} from '../constants/mapbox';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const INITIAL_OFFLINE_PACK_NAME = 'huwei_map_2km';

type InitialOfflineMapTilesOptions = {
  onStart?: () => void;
  onComplete?: () => void;
  onError?: () => void;
};

type OfflineProgressStatus = {
  percentage: number;
  completedResourceCount: number;
  requiredResourceCount: number;
};

const boundsForRadiusKm = (
  latitude: number,
  longitude: number,
  radiusKm: number,
): [[number, number], [number, number]] => {
  const latDelta = radiusKm / 110.574;
  const lonDelta = radiusKm / (111.32 * Math.cos(latitude * Math.PI / 180));

  return [
    [longitude + lonDelta, latitude + latDelta],
    [longitude - lonDelta, latitude - latDelta],
  ];
};

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
  radiusKm?: number,
): Promise<void> {
  const packName = radiusKm
    ? `loc_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${radiusKm}km`
    : `loc_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  const bounds = radiusKm
    ? boundsForRadiusKm(latitude, longitude, radiusKm)
    : [
      [longitude + OFFLINE_PACK_BOUNDS_OFFSET, latitude + OFFLINE_PACK_BOUNDS_OFFSET],
      [longitude - OFFLINE_PACK_BOUNDS_OFFSET, latitude - OFFLINE_PACK_BOUNDS_OFFSET],
    ] as [[number, number], [number, number]];

  try {
    const existing = await MapboxGL.offlineManager.getPack(packName);
    if (existing) return;

    await MapboxGL.offlineManager.createPack(
      {
        name: packName,
        styleURL: MAP_STYLE_URL,
        bounds,
        minZoom: OFFLINE_PACK_MIN_ZOOM,
        maxZoom: OFFLINE_PACK_MAX_ZOOM,
      },
      () => { },  // progressListener (required)
      () => { },  // errorListener (optional)
    );
  } catch {
    // Silently fail — offline tiles are optional.
    // The fallback UI will handle missing tiles.
  }
}

export async function ensureInitialOfflineMapTiles(
  options: InitialOfflineMapTilesOptions = {},
): Promise<'cached' | 'downloaded' | 'failed'> {
  try {
    const existing = await MapboxGL.offlineManager.getPack(INITIAL_OFFLINE_PACK_NAME);
    if (existing) return 'cached';

    options.onStart?.();

    return await new Promise(resolve => {
      let settled = false;

      const finish = (status: 'downloaded' | 'failed') => {
        if (settled) return;
        settled = true;
        if (status === 'downloaded') {
          options.onComplete?.();
        } else {
          options.onError?.();
        }
        resolve(status);
      };

      MapboxGL.offlineManager.createPack(
        {
          name: INITIAL_OFFLINE_PACK_NAME,
          styleURL: MAP_STYLE_URL,
          bounds: boundsForRadiusKm(
            INITIAL_OFFLINE_MAP_CENTER.latitude,
            INITIAL_OFFLINE_MAP_CENTER.longitude,
            INITIAL_OFFLINE_MAP_RADIUS_KM,
          ),
          minZoom: OFFLINE_PACK_MIN_ZOOM,
          maxZoom: OFFLINE_PACK_MAX_ZOOM,
        },
        (_pack, status: OfflineProgressStatus) => {
          if (
            status.percentage >= 100 ||
            (status.requiredResourceCount > 0 && status.completedResourceCount >= status.requiredResourceCount)
          ) {
            finish('downloaded');
          }
        },
        () => finish('failed'),
      ).catch(() => finish('failed'));
    });
  } catch {
    // Offline preload should never block app launch.
    options.onError?.();
    return 'failed';
  }
}
