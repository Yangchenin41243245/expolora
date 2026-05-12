// Web stub — replaces LocationMessageBubble.tsx on web.
// Metro resolves this file instead of LocationMessageBubble.tsx when bundling for web.
// Delete this file to restore the native Mapbox map bubble.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LOCATION_MAP_SIZE } from '../constants/mapbox';
import type { LocationMessage } from '../types/chat';

type Props = {
  currentMessage: LocationMessage;
};

const LocationMessageBubble: React.FC<Props> = ({ currentMessage }) => {
  const { location, offlineStatus } = currentMessage;
  if (!location) return null;

  const { latitude, longitude } = location;

  return (
    <View style={styles.container}>
      <View style={styles.fallback}>
        <Ionicons name="location-sharp" size={28} color="#FF5252" />
        <Text style={styles.coordText}>
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Text>
      </View>
      {offlineStatus && offlineStatus !== 'sent' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{offlineStatus}</Text>
        </View>
      )}
    </View>
  );
};

export default LocationMessageBubble;

const styles = StyleSheet.create({
  container:  { marginBottom: 4 },
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
  coordText: {
    fontSize: 12, color: '#666',
    fontFamily: 'monospace', textAlign: 'center',
    paddingHorizontal: 12,
  },
  badge: {
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    marginTop: 4, marginLeft: 4,
    backgroundColor: '#FFA000',
  },
  badgeText: { fontSize: 10, color: '#FFF', fontWeight: '700' },
});
