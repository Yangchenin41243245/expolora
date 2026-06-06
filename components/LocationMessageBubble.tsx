// filepath: components/LocationMessageBubble.tsx
// Custom chat bubble that renders a static Mapbox mini-map for location messages.
// Falls back to a text-based coordinate display if the map fails to render.

import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  LOCATION_MAP_SIZE,
  LOCATION_MAP_ZOOM,
  MAP_STYLE_URL,
  MAPBOX_ACCESS_TOKEN,
} from '../constants/mapbox';
import type { LocationMessage, LocationPayload, OfflineStatus } from '../types/chat';
import { ensureOfflineTiles } from '../utils/location';

// ── Mapbox init ─────────────────────────────────────────────────────────────
// Needs to happen once at module level before any MapView renders.
MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

// ── Props ───────────────────────────────────────────────────────────────────

type Props = {
  currentMessage: LocationMessage;
  onPress?: (location: LocationPayload) => void;
};

// ── Fallback UI ─────────────────────────────────────────────────────────────

const FallbackView: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => (
  <View style={styles.fallback}>
    <Ionicons name="location-sharp" size={28} color="#FF5252" />
    <Text style={styles.fallbackText}>
      Location: {lat.toFixed(5)}, {lng.toFixed(5)}
    </Text>
  </View>
);

// ── Offline status badge ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  OfflineStatus,
  { label: string; color: string } | null
> = {
  queued:  { label: '⏳ Queued',  color: '#FFA000' },
  sending: { label: '↑ Sending', color: '#2196F3' },
  sent:    null, // no badge for sent
  failed:  { label: '✕ Failed',  color: '#F44336' },
};

const StatusBadge: React.FC<{ status?: OfflineStatus }> = ({ status }) => {
  if (!status) return null;
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.color }]}>
      <Text style={styles.badgeText}>{cfg.label}</Text>
    </View>
  );
};

// ── Main component ──────────────────────────────────────────────────────────

const LocationMessageBubble: React.FC<Props> = ({ currentMessage, onPress }) => {
  const { location, offlineStatus } = currentMessage;
  const [mapError, setMapError] = useState(false);

  // Proactively download tiles for this location so they're available offline
  useEffect(() => {
    if (location) {
      ensureOfflineTiles(location.latitude, location.longitude);
    }
  }, [location]);

  if (!location) return null;

  const { latitude, longitude } = location;
  const canOpenMap = !!onPress;
  const openMapLabel = `Open map at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  const handleOpenMap = () => {
    onPress?.({ latitude, longitude });
  };

  // If the Mapbox token is empty or the map has errored, show fallback
  if (!MAPBOX_ACCESS_TOKEN || mapError) {
    return (
      <View style={styles.container}>
        <Pressable
          accessibilityLabel={openMapLabel}
          accessibilityRole={canOpenMap ? 'button' : undefined}
          disabled={!canOpenMap}
          onPress={handleOpenMap}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <FallbackView lat={latitude} lng={longitude} />
        </Pressable>
        <StatusBadge status={offlineStatus} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapWrapper}>
        <MapboxGL.MapView
          style={styles.map}
          styleURL={MAP_STYLE_URL}
          scrollEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          zoomEnabled={false}
          attributionEnabled={false}
          logoEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          onDidFailLoadingMap={() => setMapError(true)}
        >
          <MapboxGL.Camera
            centerCoordinate={[longitude, latitude]}
            zoomLevel={LOCATION_MAP_ZOOM}
            animationMode="none"
          />
          <MapboxGL.PointAnnotation
            id={`pin_${currentMessage._id}`}
            coordinate={[longitude, latitude]}
          >
            <View style={styles.pin}>
              <Ionicons name="location-sharp" size={28} color="#FF5252" />
            </View>
          </MapboxGL.PointAnnotation>
        </MapboxGL.MapView>

        {/* Loading overlay — shows briefly while tiles are being rendered */}
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="rgba(0,0,0,0.15)" />
        </View>
        {canOpenMap && (
          <Pressable
            accessibilityLabel={openMapLabel}
            accessibilityRole="button"
            onPress={handleOpenMap}
            style={({ pressed }) => [
              styles.mapTapTarget,
              pressed && styles.mapTapTargetPressed,
            ]}
          />
        )}
      </View>

      {/* Coordinate text below the map */}
      <Pressable
        accessibilityLabel={openMapLabel}
        accessibilityRole={canOpenMap ? 'button' : undefined}
        disabled={!canOpenMap}
        onPress={handleOpenMap}
        style={({ pressed }) => [styles.coordRow, pressed && styles.pressed]}
      >
        <Ionicons name="navigate" size={12} color="#888" />
        <Text style={styles.coordText}>
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Text>
      </Pressable>

      <StatusBadge status={offlineStatus} />
    </View>
  );
};

export default LocationMessageBubble;

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
    overflow: 'hidden',
  },
  mapWrapper: {
    width: LOCATION_MAP_SIZE.width,
    height: LOCATION_MAP_SIZE.height,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8E8E8',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTapTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  mapTapTargetPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  pressed: {
    opacity: 0.78,
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  coordText: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
  },

  // ── Fallback ──
  fallback: {
    width: LOCATION_MAP_SIZE.width,
    height: LOCATION_MAP_SIZE.height,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDD',
  },
  fallbackText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    textAlign: 'center',
    paddingHorizontal: 12,
  },

  // ── Badge ──
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    marginLeft: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },
});
