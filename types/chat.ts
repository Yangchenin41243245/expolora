// filepath: types/chat.ts
// Extended message types for location sharing and offline queuing.

import { IMessage } from 'react-native-gifted-chat';

/** Offline sync status for a message */
export type OfflineStatus = 'queued' | 'sending' | 'sent' | 'failed';

/** Delivery confirmation status mirroring backend MessageStatus */
export type DeliveryStatus = 'send_pending' | 'delivered' | 'send_timeout';

/** GPS coordinate payload embedded in a message */
export interface LocationPayload {
  latitude: number;
  longitude: number;
}

/**
 * Extended IMessage that supports location attachments and offline status.
 * Drop-in replacement for IMessage throughout the chat screen.
 */
export interface LocationMessage extends IMessage {
  location?: LocationPayload;
  offlineStatus?: OfflineStatus;
  deliveryStatus?: DeliveryStatus;
}
