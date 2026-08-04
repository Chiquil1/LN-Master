import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

interface VoicePickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  voices: Voice[];
  onSelect: (voice: Voice) => void;
  currentVoice?: Voice;
}

const VoicePickerModal: React.FC<VoicePickerModalProps> = ({
  visible,
  onDismiss,
  voices,
  onSelect,
  currentVoice,
}) => {
  const theme = useTheme();
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const systemLocale = getLocales()[0]?.languageCode || 'en';

  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();

    voices.forEach(voice => {
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
    if (selectedLanguages.length === 0) {
      return voices.filter(voice => {
        if (voice.name === 'System') {
          return true;
        }

        const language = voice.language?.split('-')[0];
        return language === systemLocale;
      });
    }

    return voices.filter(voice => {
      if (voice.name === 'System') {
        return true;
      }

      const language = voice.language?.split('-')[0];

      return language && selectedLanguages.includes(language);
    });
  }, [voices, selectedLanguages, systemLocale]);

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
              No voices available for selected languages
            </Text>
          ) : (
            filteredVoices.map((voice, index) => (
              <TouchableOpacity
                key={`${voice.identifier ?? voice.name}-${index}`}
                style={[
                  styles.voiceItem,
                  currentVoice?.identifier === voice.identifier && {
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

                  {voice.language && (
                    <Text
                      style={[
                        styles.voiceItemLanguage,
                        {
                          color: theme.onSurfaceVariant,
                        },
                      ]}
                    >
                      {voice.language}
                    </Text>
                  )}
                </View>

                {currentVoice?.identifier === voice.identifier && (
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

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  useEffect(() => {
    getAvailableVoicesAsync().then(availableVoices => {
      availableVoices.sort((firstVoice, secondVoice) =>
        firstVoice.name.localeCompare(secondVoice.name),
      );

      setVoices([
        {
          name: 'System',
          language: 'System',
        } as Voice,
        ...availableVoices,
      ]);
    });
  }, []);

  const handleVoiceSelect = useCallback(
    (voice: Voice) => {
      setChapterReaderSettings({
        tts: {
          ...tts,
          voice,
        },
      });
    },
    [tts, setChapterReaderSettings],
  );

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
