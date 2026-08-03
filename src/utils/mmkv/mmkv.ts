import { createMMKV } from 'react-native-mmkv';

export const MMKVStorage = createMMKV();
export function getMMKVObject<T = unknown>(key: string): T | undefined {
  const data = MMKVStorage.getString(key);
  if (!data) return undefined;
  try {
    return JSON.parse(data) as T;
  } catch (err) {
    // If parsing fails, return undefined to avoid throws from corrupted data
    return undefined;
  }
}

export function setMMKVObject<T = unknown>(key: string, obj: T): void {
  MMKVStorage.set(key, JSON.stringify(obj));
}
