import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import { getAvailableVoicesAsync, Voice } from 'expo-speech';
import { getLocales } from 'expo-localization';
import {
  useChapterGeneralSettings,
  useChapterReaderSettings,
  useTheme,
} from '@hooks/persisted';
import { getString } from '@strings/translations';
import { Button, List } from '@components/index';
import { Chip, Modal, Portal } from 'react-native-paper';
import NativeTTSMediaControl from '@specs/NativeTTSMediaControl';
import { ttsMediaEmitter } from '@utils/ttsNotification';
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

type NativeVoiceMetadata = {
  identifier: string;
  name?: string;
  language?: string;
  requiresNetwork: boolean;
  quality?: number;
  latency?: number;
};

type NativeVoiceMetadataEvent = {
  available?: boolean;
  defaultVoiceIdentifier?: string;
  defaultLanguage?: string;
  defaultRequiresNetwork?: boolean;
  voices?: NativeVoiceMetadata[];
  message?: string;
};

type VoiceWithMetadata = Voice & {
  requiresNetwork?: boolean;
  isSystemVoice?: boolean;
};

type NativeBackgroundTTSStatus = {
  sdkInt?: number;
  notificationPermissionRequired?: boolean;
  notificationPermissionGranted?: boolean;
  notificationsEnabled?: boolean;
  batteryOptimizationIgnored?: boolean;
};

interface VoicePickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  voices: VoiceWithMetadata[];
  onSelect: (voice: VoiceWithMetadata) => void;
  currentVoice?: Voice;
}

const isSystemVoice = (voice?: Voice | VoiceWithMetadata) =>
  voice?.name === 'System' || !voice?.identifier;

const isSameVoice = (
  firstVoice?: Voice | VoiceWithMetadata,
  secondVoice?: Voice | VoiceWithMetadata,
) => {
  if (!firstVoice || !secondVoice) {
    return false;
  }

  if (isSystemVoice(firstVoice) && isSystemVoice(secondVoice)) {
    return true;
  }

  return (
    Boolean(firstVoice.identifier) &&
    firstVoice.identifier === secondVoice.identifier
  );
};

const getNetworkLabel = (voice?: VoiceWithMetadata) => {
  if (voice?.requiresNetwork === false) {
    return '✓ Offline';
  }

  if (voice?.requiresNetwork === true) {
    return '☁ Requiere Internet';
  }

  return '? Estado de red desconocido';
};

const VoicePickerModal: React.FC<VoicePickerModalProps> = ({
  visible,
  onDismiss,
  voices,
  onSelect,
  currentVoice,
}) => {
  const theme = useTheme();
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [offlineOnly, setOfflineOnly] = useState(false);

  const systemLocale = getLocales()[0]?.languageCode || 'en';

  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();

    voices.forEach(voice => {
      if (voice.isSystemVoice || voice.name === 'System') {
        return;
      }

      if (voice.language) {
        const language = voice.language.split('-')[0];
        languages.add(language);
      }
    });

    return Array.from(languages).sort((firstLanguage, secondLanguage) => {
      if (firstLanguage === systemLocale) {
        return -1;
      }

      if (secondLanguage === systemLocale) {
        return 1;
      }

      return firstLanguage.localeCompare(secondLanguage);
    });
  }, [voices, systemLocale]);

  const filteredVoices = useMemo(() => {
    return voices.filter(voice => {
      const systemVoice = voice.isSystemVoice || voice.name === 'System';

      const matchesLanguage =
        systemVoice ||
        (selectedLanguages.length === 0
          ? voice.language?.split('-')[0] === systemLocale
          : Boolean(
              voice.language &&
                selectedLanguages.includes(voice.language.split('-')[0]),
            ));

      const matchesNetwork = !offlineOnly || voice.requiresNetwork === false;

      return matchesLanguage && matchesNetwork;
    });
  }, [voices, selectedLanguages, offlineOnly, systemLocale]);

  const toggleLanguage = (language: string) => {
    setSelectedLanguages(previousLanguages => {
      if (previousLanguages.includes(language)) {
        return previousLanguages.filter(item => item !== language);
      }

      return [...previousLanguages, language];
    });
  };

  useEffect(() => {
    if (visible) {
      setSelectedLanguages([]);
      setOfflineOnly(false);
    }
  }, [visible]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContent,
          {
            backgroundColor: theme.surface,
          },
        ]}
      >
        <Text
          style={[
            styles.modalTitle,
            {
              color: theme.onSurface,
            },
          ]}
        >
          Select Voice
        </Text>

        <View style={styles.languageFilterContainer}>
          <Text
            style={[
              styles.filterLabel,
              {
                color: theme.onSurfaceVariant,
              },
            ]}
          >
            Filter by language:
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.languageChipsScroll}
          >
            <Chip
              selected={offlineOnly}
              onPress={() => setOfflineOnly(previousValue => !previousValue)}
              style={[
                styles.languageChip,
                offlineOnly && {
                  backgroundColor: theme.primary,
                },
              ]}
              textStyle={[
                styles.languageChipText,
                {
                  color: offlineOnly ? theme.onPrimary : theme.onSurface,
                },
              ]}
            >
              Solo offline
            </Chip>

            {availableLanguages.map(language => {
              const isSelected = selectedLanguages.includes(language);
              const isSystemLanguage = language === systemLocale;
              const showingSystemOnly = selectedLanguages.length === 0;
              const isActive =
                isSelected || (showingSystemOnly && isSystemLanguage);

              return (
                <Chip
                  key={language}
                  selected={isActive}
                  onPress={() => toggleLanguage(language)}
                  style={[
                    styles.languageChip,
                    isActive && {
                      backgroundColor: theme.primary,
                    },
                  ]}
                  textStyle={[
                    styles.languageChipText,
                    {
                      color: isActive ? theme.onPrimary : theme.onSurface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isActive ? theme.onPrimary : theme.onSurface,
                    }}
                  >
                    {language.toUpperCase()}
                    {isSystemLanguage ? ' (System)' : ''}
                  </Text>
                </Chip>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView style={styles.voiceList}>
          {filteredVoices.length === 0 ? (
            <Text
              style={[
                styles.noVoicesText,
                {
                  color: theme.onSurfaceVariant,
                },
              ]}
            >
              {offlineOnly
                ? 'No hay voces offline disponibles para este idioma'
                : 'No voices available for selected languages'}
            </Text>
          ) : (
            filteredVoices.map((voice, index) => (
              <TouchableOpacity
                key={`${voice.identifier ?? voice.name}-${index}`}
                style={[
                  styles.voiceItem,
                  isSameVoice(currentVoice, voice) && {
                    backgroundColor: theme.surfaceVariant,
                  },
                ]}
                onPress={() => {
                  onSelect(voice);
                  onDismiss();
                }}
              >
                <View style={styles.voiceItemContent}>
                  <Text
                    style={[
                      styles.voiceItemText,
                      {
                        color: theme.onSurface,
                      },
                    ]}
                  >
                    {voice.name}
                  </Text>

                  <Text
                    style={[
                      styles.voiceItemLanguage,
                      {
                        color: theme.onSurfaceVariant,
                      },
                    ]}
                  >
                    {voice.isSystemVoice
                      ? 'Voz predeterminada de Android'
                      : voice.language || 'Idioma desconocido'}
                  </Text>

                  <Text
                    style={[
                      styles.voiceNetworkStatus,
                      {
                        color:
                          voice.requiresNetwork === false
                            ? theme.primary
                            : theme.onSurfaceVariant,
                      },
                    ]}
                  >
                    {getNetworkLabel(voice)}
                  </Text>
                </View>

                {isSameVoice(currentVoice, voice) && (
                  <Text
                    style={[
                      styles.checkIcon,
                      {
                        color: theme.primary,
                      },
                    ]}
                  >
                    ✓
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        <Button
          title="Cancel"
          mode="outlined"
          onPress={onDismiss}
          style={styles.cancelButton}
        />
      </Modal>
    </Portal>
  );
};

const TTSTab: React.FC = () => {
  const theme = useTheme();

  const { TTSEnable = true, setChapterGeneralSettings } =
    useChapterGeneralSettings();

  const { tts, setChapterReaderSettings } = useChapterReaderSettings();

  const [voices, setVoices] = useState<VoiceWithMetadata[]>([]);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [nativeTTSEngineAvailable, setNativeTTSEngineAvailable] = useState<
    boolean | undefined
  >(undefined);
  const [backgroundStatus, setBackgroundStatus] =
    useState<NativeBackgroundTTSStatus>();

  useEffect(() => {
    let mounted = true;
    let availableVoices: Voice[] = [];
    let nativeMetadata: NativeVoiceMetadataEvent | undefined;

    const mergeVoiceData = () => {
      if (!mounted) {
        return;
      }

      const metadataByIdentifier = new Map<string, NativeVoiceMetadata>();

      nativeMetadata?.voices?.forEach(metadata => {
        if (metadata.identifier) {
          metadataByIdentifier.set(metadata.identifier, metadata);
        }

        if (metadata.name) {
          metadataByIdentifier.set(metadata.name, metadata);
        }
      });

      const enrichedVoices: VoiceWithMetadata[] = availableVoices.map(voice => {
        const metadata =
          metadataByIdentifier.get(voice.identifier || '') ||
          metadataByIdentifier.get(voice.name);

        return {
          ...voice,
          requiresNetwork: metadata?.requiresNetwork,
          isSystemVoice: false,
        };
      });

      enrichedVoices.sort((firstVoice, secondVoice) => {
        const getNetworkRank = (voice: VoiceWithMetadata) => {
          if (voice.requiresNetwork === false) {
            return 0;
          }

          if (voice.requiresNetwork === true) {
            return 1;
          }

          return 2;
        };

        const networkDifference =
          getNetworkRank(firstVoice) - getNetworkRank(secondVoice);

        if (networkDifference !== 0) {
          return networkDifference;
        }

        return firstVoice.name.localeCompare(secondVoice.name);
      });

      const systemVoice = {
        name: 'System',
        language: nativeMetadata?.defaultLanguage || 'System',
        requiresNetwork:
          typeof nativeMetadata?.defaultRequiresNetwork === 'boolean'
            ? nativeMetadata.defaultRequiresNetwork
            : undefined,
        isSystemVoice: true,
      } as VoiceWithMetadata;

      setVoices([systemVoice, ...enrichedVoices]);
    };

    const metadataSubscription = ttsMediaEmitter.addListener(
      'TTSVoiceMetadata',
      (event: NativeVoiceMetadataEvent) => {
        nativeMetadata = event;
        setNativeTTSEngineAvailable(event.available === true);
        mergeVoiceData();
      },
    );

    getAvailableVoicesAsync()
      .then(result => {
        availableVoices = result;
        mergeVoiceData();
      })
      .catch(() => {
        availableVoices = [];
        mergeVoiceData();
      });

    return () => {
      mounted = false;
      metadataSubscription.remove();
    };
  }, []);

  const handleVoiceSelect = useCallback(
    (voice: VoiceWithMetadata) => {
      const voiceToPersist = { ...voice };
      delete voiceToPersist.requiresNetwork;
      delete voiceToPersist.isSystemVoice;

      setChapterReaderSettings({
        tts: {
          ...tts,
          voice: voiceToPersist as Voice,
        },
      });
    },
    [tts, setChapterReaderSettings],
  );

  const refreshBackgroundStatus = useCallback(() => {
    NativeTTSMediaControl.requestBackgroundTTSStatus();
  }, []);

  useEffect(() => {
    const statusSubscription = ttsMediaEmitter.addListener(
      'TTSBackgroundStatus',
      (event: NativeBackgroundTTSStatus) => {
        setBackgroundStatus(event);
      },
    );

    refreshBackgroundStatus();

    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshBackgroundStatus();
      }
    });

    return () => {
      statusSubscription.remove();
      appStateSubscription.remove();
    };
  }, [refreshBackgroundStatus]);

  const handleNotificationSettings = useCallback(async () => {
    const requiresRuntimePermission =
      Platform.OS === 'android' &&
      Number(Platform.Version) >= 33 &&
      backgroundStatus?.notificationPermissionGranted !== true;

    if (requiresRuntimePermission) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );

      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        refreshBackgroundStatus();
        return;
      }
    }

    NativeTTSMediaControl.openNotificationSettings();
  }, [
    backgroundStatus?.notificationPermissionGranted,
    refreshBackgroundStatus,
  ]);

  const currentVoiceWithMetadata = useMemo(() => {
    const configuredVoice = tts?.voice;

    return (
      voices.find(voice => isSameVoice(configuredVoice, voice)) ||
      voices.find(voice => voice.isSystemVoice)
    );
  }, [tts?.voice, voices]);

  const notificationReady =
    backgroundStatus?.notificationsEnabled === true &&
    backgroundStatus?.notificationPermissionGranted !== false;
  const batteryOptimized =
    backgroundStatus?.batteryOptimizationIgnored === false;
  const selectedVoiceOffline =
    currentVoiceWithMetadata?.requiresNetwork === false;
  const selectedVoiceRequiresNetwork =
    currentVoiceWithMetadata?.requiresNetwork === true;

  return (
    <>
      <BottomSheetScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.section}>
          <List.SubHeader theme={theme}>
            <Text
              style={{
                color: theme.onSurface,
              }}
            >
              Text to Speech
            </Text>
          </List.SubHeader>

          <ReaderSheetPreferenceItem
            label="Enable TTS"
            value={TTSEnable}
            onPress={() =>
              setChapterGeneralSettings({
                TTSEnable: !TTSEnable,
              })
            }
            theme={theme}
          />

          {TTSEnable && (
            <>
              <TouchableOpacity
                style={styles.settingItem}
                onPress={() => setVoiceModalVisible(true)}
              >
                <Text
                  style={[
                    styles.label,
                    {
                      color: theme.onSurface,
                    },
                  ]}
                >
                  Voice
                </Text>

                <View style={styles.valueContainer}>
                  <Text
                    style={[
                      styles.value,
                      {
                        color: theme.onSurfaceVariant,
                      },
                    ]}
                  >
                    {tts?.voice?.name || 'System'}
                  </Text>
                  <Text
                    style={[
                      styles.valueStatus,
                      {
                        color:
                          currentVoiceWithMetadata?.requiresNetwork === false
                            ? theme.primary
                            : theme.onSurfaceVariant,
                      },
                    ]}
                  >
                    {getNetworkLabel(currentVoiceWithMetadata)}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.sliderSection}>
                <Text
                  style={[
                    styles.sliderLabel,
                    {
                      color: theme.onSurface,
                    },
                  ]}
                >
                  Speed: {tts?.rate?.toFixed(1) || '1.0'}x
                </Text>

                <Slider
                  style={styles.slider}
                  value={tts?.rate || 1}
                  minimumValue={0.1}
                  maximumValue={5}
                  step={0.1}
                  minimumTrackTintColor={theme.primary}
                  maximumTrackTintColor={theme.surfaceVariant}
                  thumbTintColor={theme.primary}
                  onSlidingComplete={value =>
                    setChapterReaderSettings({
                      tts: {
                        ...tts,
                        rate: value,
                      },
                    })
                  }
                />
              </View>

              <View style={styles.sliderSection}>
                <Text
                  style={[
                    styles.sliderLabel,
                    {
                      color: theme.onSurface,
                    },
                  ]}
                >
                  Pitch: {tts?.pitch?.toFixed(1) || '1.0'}
                </Text>

                <Slider
                  style={styles.slider}
                  value={tts?.pitch || 1}
                  minimumValue={0.1}
                  maximumValue={5}
                  step={0.1}
                  minimumTrackTintColor={theme.primary}
                  maximumTrackTintColor={theme.surfaceVariant}
                  thumbTintColor={theme.primary}
                  onSlidingComplete={value =>
                    setChapterReaderSettings({
                      tts: {
                        ...tts,
                        pitch: value,
                      },
                    })
                  }
                />
              </View>

              <ReaderSheetPreferenceItem
                label="Auto Page Advance"
                value={tts?.autoPageAdvance === true}
                onPress={() =>
                  setChapterReaderSettings({
                    tts: {
                      ...tts,
                      autoPageAdvance: !(tts?.autoPageAdvance === true),
                    },
                  })
                }
                theme={theme}
              />

              <ReaderSheetPreferenceItem
                label="Scroll to Top"
                value={tts?.scrollToTop !== false}
                onPress={() =>
                  setChapterReaderSettings({
                    tts: {
                      ...tts,
                      scrollToTop: !(tts?.scrollToTop !== false),
                    },
                  })
                }
                theme={theme}
              />

              <View
                style={[
                  styles.backgroundTTSContainer,
                  { borderColor: theme.outline },
                ]}
              >
                <Text
                  style={[
                    styles.nativeTTSSectionTitle,
                    { color: theme.onSurface },
                  ]}
                >
                  TTS en segundo plano
                </Text>

                <Text
                  style={[
                    styles.backgroundTTSDescription,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  Android mantiene la lectura con un servicio multimedia. Estos
                  ajustes ayudan a que los controles y la reproducción sean más
                  fiables con la pantalla apagada.
                </Text>

                <View style={styles.statusList}>
                  <View style={styles.statusRow}>
                    <Text
                      style={[styles.statusLabel, { color: theme.onSurface }]}
                    >
                      Motor TTS nativo
                    </Text>
                    <Text
                      style={[
                        styles.statusValue,
                        {
                          color:
                            nativeTTSEngineAvailable === false
                              ? theme.onSurfaceVariant
                              : theme.primary,
                        },
                      ]}
                    >
                      {nativeTTSEngineAvailable === undefined
                        ? '… Comprobando'
                        : nativeTTSEngineAvailable
                        ? '✓ Disponible'
                        : '⚠ No disponible'}
                    </Text>
                  </View>

                  <View style={styles.statusRow}>
                    <Text
                      style={[styles.statusLabel, { color: theme.onSurface }]}
                    >
                      Voz seleccionada
                    </Text>
                    <Text
                      style={[
                        styles.statusValue,
                        {
                          color: selectedVoiceOffline
                            ? theme.primary
                            : theme.onSurfaceVariant,
                        },
                      ]}
                    >
                      {selectedVoiceOffline
                        ? '✓ Offline'
                        : selectedVoiceRequiresNetwork
                        ? '☁ Requiere Internet'
                        : '? Sin confirmar'}
                    </Text>
                  </View>

                  <View style={styles.statusRow}>
                    <Text
                      style={[styles.statusLabel, { color: theme.onSurface }]}
                    >
                      Servicio multimedia
                    </Text>
                    <Text
                      style={[styles.statusValue, { color: theme.primary }]}
                    >
                      ✓ Disponible
                    </Text>
                  </View>

                  <View style={styles.statusRow}>
                    <Text
                      style={[styles.statusLabel, { color: theme.onSurface }]}
                    >
                      Notificaciones
                    </Text>
                    <Text
                      style={[
                        styles.statusValue,
                        {
                          color: notificationReady
                            ? theme.primary
                            : theme.onSurfaceVariant,
                        },
                      ]}
                    >
                      {backgroundStatus === undefined
                        ? '… Comprobando'
                        : notificationReady
                        ? '✓ Activadas'
                        : '⚠ Desactivadas'}
                    </Text>
                  </View>

                  <View style={styles.statusRow}>
                    <Text
                      style={[styles.statusLabel, { color: theme.onSurface }]}
                    >
                      Optimización Doze
                    </Text>
                    <Text
                      style={[
                        styles.statusValue,
                        {
                          color: batteryOptimized
                            ? theme.onSurfaceVariant
                            : theme.primary,
                        },
                      ]}
                    >
                      {backgroundStatus === undefined
                        ? '… Comprobando'
                        : batteryOptimized
                        ? '⚠ Activa (opcional)'
                        : '✓ Sin restricción'}
                    </Text>
                  </View>
                </View>

                {!notificationReady && (
                  <Text
                    style={[
                      styles.backgroundTTSHint,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    Los controles de una sesión multimedia pueden seguir
                    apareciendo en Android 13+, pero activar las notificaciones
                    generales mejora la visibilidad y evita configuraciones
                    ambiguas del sistema.
                  </Text>
                )}

                {batteryOptimized && (
                  <Text
                    style={[
                      styles.backgroundTTSHint,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    Quitar la optimización de batería es opcional. Úsalo solo si
                    tu teléfono detiene la lectura al bloquear la pantalla.
                  </Text>
                )}

                <Button
                  title={
                    backgroundStatus?.notificationPermissionGranted === false
                      ? 'Activar notificaciones'
                      : 'Ajustes de notificaciones'
                  }
                  mode="outlined"
                  onPress={handleNotificationSettings}
                  style={styles.nativeTTSButton}
                />

                <Button
                  title="Configurar batería"
                  mode="outlined"
                  onPress={() => {
                    NativeTTSMediaControl.openBatteryOptimizationSettings();
                  }}
                  style={styles.nativeTTSButton}
                />

                <Button
                  title="Instalar o administrar voces TTS"
                  mode="outlined"
                  onPress={() => {
                    NativeTTSMediaControl.openTTSVoiceDataInstaller();
                  }}
                  style={styles.nativeTTSButton}
                />

                <Button
                  title="Actualizar estado"
                  mode="outlined"
                  onPress={refreshBackgroundStatus}
                  style={styles.nativeTTSButton}
                />
              </View>

              <View style={styles.nativeTTSButtonContainer}>
                <Text
                  style={[
                    styles.nativeTTSSectionTitle,
                    {
                      color: theme.onSurface,
                    },
                  ]}
                >
                  Prueba de reproducción nativa
                </Text>

                <Text
                  style={[
                    styles.nativeTTSDescription,
                    {
                      color: theme.onSurfaceVariant,
                    },
                  ]}
                >
                  Esta prueba utiliza el motor TTS predeterminado de tu
                  teléfono. La voz debe continuar al salir de la aplicación o
                  apagar la pantalla.
                </Text>

                <Button
                  title="Probar TTS nativo"
                  mode="outlined"
                  onPress={() => {
                    NativeTTSMediaControl.speakTest(
                      'Esta es una prueba del lector nativo de LNReader. ' +
                        'La voz debe continuar aunque salgas de la aplicación ' +
                        'o apagues la pantalla del teléfono.',
                    );
                  }}
                  style={styles.nativeTTSButton}
                />

                <Button
                  title="Detener TTS nativo"
                  mode="outlined"
                  onPress={() => {
                    NativeTTSMediaControl.stopNativePlayback();
                  }}
                  style={styles.nativeTTSButton}
                />
              </View>

              <View style={styles.resetButtonContainer}>
                <Button
                  title={getString('common.reset')}
                  mode="outlined"
                  onPress={() => {
                    setChapterReaderSettings({
                      tts: {
                        pitch: 1,
                        rate: 1,
                        voice: {
                          name: 'System',
                          language: 'System',
                        } as Voice,
                        autoPageAdvance: false,
                        scrollToTop: true,
                      },
                    });
                  }}
                  style={styles.resetButton}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.bottomSpacing} />
      </BottomSheetScrollView>

      <VoicePickerModal
        visible={voiceModalVisible}
        onDismiss={() => setVoiceModalVisible(false)}
        voices={voices}
        onSelect={handleVoiceSelect}
        currentVoice={tts?.voice}
      />
    </>
  );
};

export default React.memo(TTSTab);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  section: {
    marginVertical: 8,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 14,
    textAlign: 'right',
  },
  valueContainer: {
    alignItems: 'flex-end',
    flexShrink: 1,
    marginStart: 12,
  },
  valueStatus: {
    fontSize: 11,
    marginTop: 3,
    textAlign: 'right',
  },
  sliderSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sliderLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  slider: {
    height: 40,
  },
  backgroundTTSContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  backgroundTTSDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  backgroundTTSHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  statusList: {
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusLabel: {
    flex: 1,
    fontSize: 13,
  },
  statusValue: {
    flexShrink: 1,
    fontSize: 12,
    textAlign: 'right',
  },
  nativeTTSButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  nativeTTSSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  nativeTTSDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  nativeTTSButton: {
    marginTop: 8,
  },
  resetButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resetButton: {
    alignSelf: 'flex-start',
  },
  bottomSpacing: {
    height: 24,
  },
  modalContent: {
    margin: 20,
    borderRadius: 8,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  languageFilterContainer: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  languageChipsScroll: {
    flexGrow: 0,
  },
  languageChip: {
    marginEnd: 8,
    marginBottom: 8,
  },
  languageChipText: {
    fontSize: 12,
  },
  voiceList: {
    maxHeight: 350,
    marginTop: 8,
  },
  voiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 4,
    marginBottom: 4,
  },
  voiceItemContent: {
    flex: 1,
  },
  voiceItemText: {
    fontSize: 16,
    marginBottom: 4,
  },
  voiceItemLanguage: {
    fontSize: 12,
  },
  voiceNetworkStatus: {
    fontSize: 12,
    marginTop: 3,
  },
  noVoicesText: {
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
  cancelButton: {
    marginTop: 16,
  },
  checkIcon: {
    fontSize: 16,
  },
});
