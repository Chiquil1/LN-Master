# LNReader 2.1.2 Hybrid TTS

This build keeps the LNReader 2.1.2 architecture and its Android/iOS
`nitro-tts` module, while adding the rolling multi-chapter behavior from
LN-Master.

## Behavior

- The visible chapter starts speaking immediately.
- Chapter HTML is prefetched in a ten-chapter window with at most two network
  requests running concurrently.
- When the seventh chapter becomes active (three remain), the next ten are
  fetched and appended.
- Native playback receives appended paragraphs without stopping or repeating
  the active paragraph.
- Paragraph identifiers contain chapter metadata, so Android and iOS update
  their media metadata when playback crosses a chapter boundary.
- If the app is backgrounded, native playback continues through every chapter
  already in the buffer. The visible reader catches up when the app returns.
- The prefetch cache keeps at most thirty TTS-prefetched chapters outside the
  protected active window.

Multi-chapter buffering is only enabled when the existing **Auto page advance**
TTS preference is enabled. With that preference disabled, TTS retains the
official single-chapter behavior.

## Main implementation files

- `src/screens/reader/hooks/useChapter.ts`: 10/7/10 prefetch and prepared queue.
- `src/screens/reader/components/WebViewReader.tsx`: rolling queue orchestration.
- `src/screens/reader/hooks/useTtsSession.ts`: serialized native load/append.
- `src/screens/reader/utils/ttsQueue.ts`: HTML segmentation and chapter IDs.
- `modules/nitro-tts/android/.../TtsPlaybackStore.kt`: interruption-free append.
- `modules/nitro-tts/ios/TtsPlaybackCoordinator.swift`: iOS queue append.

## Verification targets

Run the normal project checks after installing dependencies:

```sh
pnpm run check
pnpm test -- --runInBand
```

Device verification should cover screen-off playback, notification controls,
page boundaries, unavailable source chapters, engine/voice changes, and manual
navigation while TTS is active.
