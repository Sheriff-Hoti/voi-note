import { PermissionsAndroid } from 'react-native';

export type MicPermission = 'granted' | 'denied' | 'blocked';

const RECORD_AUDIO = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

export async function checkMicPermission(): Promise<MicPermission> {
  return (await PermissionsAndroid.check(RECORD_AUDIO)) ? 'granted' : 'denied';
}

/** Shows Android's permission prompt. "blocked" means Android won't prompt again; only Settings can grant it. */
export async function requestMicPermission(): Promise<MicPermission> {
  const result = await PermissionsAndroid.request(RECORD_AUDIO);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}
