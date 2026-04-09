// filepath: constants/mapbox.ts
// Mapbox configuration constants for the location sharing feature.
// Token is imported from secrets.ts (git-ignored — fill in your tokens there).

import { MAPBOX_ACCESS_TOKEN } from './secrets';
export { MAPBOX_ACCESS_TOKEN };

/** Default Mapbox style for the mini-map in chat bubbles */
export const MAP_STYLE_URL = 'mapbox://styles/mapbox/streets-v12';

/** Zoom level for the location mini-map (14 ≈ neighbourhood level) */
export const LOCATION_MAP_ZOOM = 14;

/** Pixel dimensions for the mini-map rendered inside a chat bubble */
export const LOCATION_MAP_SIZE = { width: 220, height: 150 };

/**
 * Bounding-box offset (in degrees) for offline tile pack downloads.
 * ~0.01° ≈ 1.1 km — downloads a ~2.2 km square around each shared location.
 */
export const OFFLINE_PACK_BOUNDS_OFFSET = 0.01;

/** Min/max zoom levels for offline tile packs */
export const OFFLINE_PACK_MIN_ZOOM = 12;
export const OFFLINE_PACK_MAX_ZOOM = 16;
