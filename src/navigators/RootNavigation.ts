import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate(name: keyof RootStackParamList, params?: any) {
  if (navigationRef.isReady()) {
    // cast to any to allow nested navigation shapes (screen + params)
    // Navigation types are strict for nested NavigatorScreenParams; using any here
    // avoids complex overloads while keeping runtime behavior correct.
    (navigationRef as any).navigate(name, params);
  }
}
