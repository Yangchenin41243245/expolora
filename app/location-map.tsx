import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAP_STYLE_URL, MAPBOX_ACCESS_TOKEN } from '../constants/mapbox';
import { ensureOfflineTiles } from '../utils/location';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const FULL_MAP_ZOOM = 16;

const parseCoordinate = (value?: string | string[]): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function LocationMapScreen() {
  const { latitude: latitudeParam, longitude: longitudeParam } = useLocalSearchParams<{
    latitude?: string | string[];
    longitude?: string | string[];
  }>();

  const latitude = parseCoordinate(latitudeParam);
  const longitude = parseCoordinate(longitudeParam);
  const [mapError, setMapError] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);

  const coordinate = useMemo<[number, number] | null>(() => {
    if (latitude === null || longitude === null) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }

    return [longitude, latitude];
  }, [latitude, longitude]);

  useEffect(() => {
    setMapError(false);
    setMapLoading(true);
  }, [coordinate]);

  useEffect(() => {
    if (!coordinate) return;
    ensureOfflineTiles(coordinate[1], coordinate[0], 2);
  }, [coordinate]);

  const formattedCoordinate = coordinate
    ? `${coordinate[1].toFixed(5)}, ${coordinate[0].toFixed(5)}`
    : 'Location unavailable';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back to chat"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={26} color="#222222" />
        </TouchableOpacity>

        <View style={styles.headerCopy}>
          <Text style={styles.title}>Shared location</Text>
          <Text style={styles.subtitle}>{formattedCoordinate}</Text>
        </View>
      </View>

      <View style={styles.mapArea}>
        {!coordinate ? (
          <FallbackPanel
            icon="alert-circle"
            title="Location unavailable"
            body="This message does not include valid coordinates."
          />
        ) : !MAPBOX_ACCESS_TOKEN || mapError ? (
          <FallbackPanel
            icon="location-sharp"
            title="Map unavailable"
            body={formattedCoordinate}
          />
        ) : (
          <>
            <MapboxGL.MapView
              style={styles.map}
              styleURL={MAP_STYLE_URL}
              compassEnabled
              scaleBarEnabled
              onDidFailLoadingMap={() => {
                setMapLoading(false);
                setMapError(true);
              }}
              onDidFinishLoadingMap={() => setMapLoading(false)}
            >
              <MapboxGL.Camera
                centerCoordinate={coordinate}
                zoomLevel={FULL_MAP_ZOOM}
                animationMode="none"
              />
              <MapboxGL.PointAnnotation
                id={`shared_location_${coordinate[1]}_${coordinate[0]}`}
                coordinate={coordinate}
              >
                <View style={styles.pin}>
                  <Ionicons name="location-sharp" size={38} color="#FF5252" />
                </View>
              </MapboxGL.PointAnnotation>
            </MapboxGL.MapView>

            {mapLoading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="rgba(0,0,0,0.2)" />
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Ionicons name="navigate" size={16} color="#555555" />
        <Text style={styles.footerText}>{formattedCoordinate}</Text>
      </View>
    </SafeAreaView>
  );
}

type FallbackPanelProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const FallbackPanel: React.FC<FallbackPanelProps> = ({ icon, title, body }) => (
  <View style={styles.fallbackPanel}>
    <Ionicons name={icon} size={40} color="#FF5252" />
    <Text style={styles.fallbackTitle}>{title}</Text>
    <Text style={styles.fallbackBody}>{body}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDDDDD',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222222',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#777777',
    fontFamily: 'monospace',
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#E7ECEF',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDDDDD',
    backgroundColor: '#FFFFFF',
  },
  footerText: {
    fontSize: 14,
    color: '#333333',
    fontFamily: 'monospace',
  },
  fallbackPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#F2F4F5',
  },
  fallbackTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#222222',
  },
  fallbackBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: '#666666',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
