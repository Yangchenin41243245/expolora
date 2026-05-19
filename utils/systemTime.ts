export const SYSTEM_TIME_SYNC_THRESHOLD_MS = 5000;

type ApiObject = Record<string, unknown>;

export type SystemTimeSyncResult = {
  serverEpochMs: number;
  phoneEpochMs: number;
  offsetMs: number;
  roundTripMs: number;
  thresholdMs: number;
  outOfSync: boolean;
  synced: boolean;
  checkedAtMs: number;
  syncRequestedEpochMs: number | null;
  getResponse: unknown;
  syncResponse: unknown | null;
};

type CheckAndSyncSystemTimeOptions = {
  baseUrl: string;
  thresholdMs?: number;
  force?: boolean;
};

const isApiObject = (value: unknown): value is ApiObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const readJson = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const apiErrorMessage = (res: Response, json: unknown) => {
  const fallback = `HTTP ${res.status}`;
  if (!isApiObject(json)) return fallback;
  const errorMessage = json.error_message ?? json.message ?? json.error;
  return typeof errorMessage === 'string' && errorMessage.trim()
    ? `${fallback}: ${errorMessage}`
    : fallback;
};

const assertApiSuccess = (json: unknown) => {
  if (!isApiObject(json) || typeof json.status !== 'string' || json.status === 'success') {
    return;
  }

  const errorMessage = json.error_message ?? json.message ?? json.error;
  throw new Error(
    typeof errorMessage === 'string' && errorMessage.trim()
      ? errorMessage
      : `API status: ${json.status}`
  );
};

const getServerEpochMs = (json: unknown): number => {
  if (!isApiObject(json) || !isApiObject(json.data)) {
    throw new Error('Missing system time payload');
  }

  const { epoch_ms, epoch_seconds } = json.data;
  if (typeof epoch_ms === 'number' && Number.isFinite(epoch_ms)) {
    return Math.round(epoch_ms);
  }
  if (typeof epoch_seconds === 'number' && Number.isFinite(epoch_seconds)) {
    return Math.round(epoch_seconds * 1000);
  }

  throw new Error('Missing epoch_ms or epoch_seconds in system time payload');
};

export const checkAndSyncSystemTime = async ({
  baseUrl,
  thresholdMs = SYSTEM_TIME_SYNC_THRESHOLD_MS,
  force = false,
}: CheckAndSyncSystemTimeOptions): Promise<SystemTimeSyncResult> => {
  const normalizedBaseUrl = stripTrailingSlash(baseUrl);
  const requestStartedAtMs = Date.now();
  const getRes = await fetch(`${normalizedBaseUrl}/getSystemTime`, {
    headers: { Accept: 'application/json' },
  });
  const responseReceivedAtMs = Date.now();
  const getJson = await readJson(getRes);

  if (!getRes.ok) {
    throw new Error(apiErrorMessage(getRes, getJson));
  }
  assertApiSuccess(getJson);

  const serverEpochMs = getServerEpochMs(getJson);
  const phoneEpochMs = Math.round((requestStartedAtMs + responseReceivedAtMs) / 2);
  const offsetMs = serverEpochMs - phoneEpochMs;
  const outOfSync = Math.abs(offsetMs) > thresholdMs;

  let syncRequestedEpochMs: number | null = null;
  let syncResponse: unknown | null = null;
  let synced = false;

  if (force || outOfSync) {
    syncRequestedEpochMs = Date.now();
    const syncRes = await fetch(`${normalizedBaseUrl}/syncSystemTime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ epoch_ms: syncRequestedEpochMs }),
    });
    const syncJson = await readJson(syncRes);

    if (!syncRes.ok) {
      throw new Error(apiErrorMessage(syncRes, syncJson));
    }
    assertApiSuccess(syncJson);

    synced = true;
    syncResponse = syncJson;
  }

  return {
    serverEpochMs,
    phoneEpochMs,
    offsetMs,
    roundTripMs: responseReceivedAtMs - requestStartedAtMs,
    thresholdMs,
    outOfSync,
    synced,
    checkedAtMs: responseReceivedAtMs,
    syncRequestedEpochMs,
    getResponse: getJson,
    syncResponse,
  };
};
