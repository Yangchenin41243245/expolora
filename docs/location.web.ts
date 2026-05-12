// Web stub — @rnmapbox/maps has no web implementation.
// Metro resolves this file instead of location.ts when bundling for web.
// Delete this file to restore native Mapbox behaviour.

export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('PERMISSION_DENIED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => reject(new Error('PERMISSION_DENIED')),
    );
  });
}

export async function ensureOfflineTiles(): Promise<void> {}

export async function ensureInitialOfflineMapTiles(): Promise<'cached' | 'downloaded' | 'failed'> {
  return 'cached';
}
