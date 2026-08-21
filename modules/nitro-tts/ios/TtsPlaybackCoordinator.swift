import AVFAudio
import Foundation
import NitroModules

final class TtsPlaybackCoordinator: NSObject, AVSpeechSynthesizerDelegate {
  static let shared = TtsPlaybackCoordinator()

  private let synthesizer = AVSpeechSynthesizer()
  private let stateListeners = TtsListenerRegistry<TtsPlaybackState>()
  private let progressListeners = TtsListenerRegistry<TtsProgress>()
  private let errorListeners = TtsListenerRegistry<String>()
  private let nowPlaying = TtsNowPlayingController()

  private var paragraphs: [TtsParagraph] = []
  private var currentIndex = 0
  private var metadata: TtsMetadata?
  private var settings = TtsSettings(engineName: nil, voiceIdentifier: nil, rate: 1, pitch: 1)
  private var state: TtsPlaybackState = .idle
  private var activeUtterance: AVSpeechUtterance?

  private lazy var remoteCommands = TtsRemoteCommandController(
    onPlay: { [weak self] in self?.play() },
    onPause: { [weak self] in self?.pause() },
    onStop: { [weak self] in self?.stop() },
    onPrevious: { [weak self] in self?.skipPrevious() },
    onNext: { [weak self] in self?.skipNext() }
  )

  override private init() {
    super.init()
    synthesizer.delegate = self
    _ = remoteCommands
  }

  func load(
    paragraphs nextParagraphs: [TtsParagraph],
    initialIndex: Int,
    metadata nextMetadata: TtsMetadata,
    settings nextSettings: TtsSettings
  ) throws {
    precondition(Thread.isMainThread)
    let readableParagraphs = nextParagraphs.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    guard !readableParagraphs.isEmpty else {
      throw RuntimeError.error(withMessage: "The TTS queue contains no readable paragraphs.")
    }

    if initialIndex < 0 {
      appendQueue(readableParagraphs, metadata: nextMetadata)
      return
    }

    interruptSpeech()
    paragraphs = readableParagraphs
    currentIndex = min(max(initialIndex, 0), readableParagraphs.count - 1)
    metadata = nextMetadata
    settings = nextSettings
    state = .paused
    emitProgress()
    emitState()
  }

  private func appendQueue(
    _ nextParagraphs: [TtsParagraph],
    metadata nextMetadata: TtsMetadata
  ) {
    var existingIds = Set(paragraphs.map(\.id))
    let uniqueParagraphs = nextParagraphs.filter { existingIds.insert($0.id).inserted }
    guard !uniqueParagraphs.isEmpty else { return }

    let previousSize = paragraphs.count
    paragraphs.append(contentsOf: uniqueParagraphs)
    if metadata == nil {
      metadata = nextMetadata
    }

    if state == .completed {
      currentIndex = previousSize
      state = .paused
      emitProgress()
      emitState()
      play()
    } else {
      // Refresh the total while leaving the current utterance untouched.
      emitProgress()
    }
  }

  func play() {
    precondition(Thread.isMainThread)
    guard !paragraphs.isEmpty else {
      fail("Load a paragraph queue before starting TTS.")
      return
    }
    if synthesizer.isPaused {
      synthesizer.continueSpeaking()
      state = .playing
      emitState()
      return
    }
    speakCurrent()
  }

  func pause() {
    precondition(Thread.isMainThread)
    guard state == .playing else { return }
    synthesizer.pauseSpeaking(at: .immediate)
    state = .paused
    emitState()
  }

  func stop() {
    precondition(Thread.isMainThread)
    interruptSpeech()
    paragraphs = []
    currentIndex = 0
    metadata = nil
    state = .idle
    nowPlaying.clear()
    emitState()
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
  }

  func skipPrevious() {
    precondition(Thread.isMainThread)
    guard !paragraphs.isEmpty else { return }
    currentIndex = max(currentIndex - 1, 0)
    speakCurrent()
  }

  func skipNext() {
    precondition(Thread.isMainThread)
    guard !paragraphs.isEmpty else { return }
    guard currentIndex < paragraphs.count - 1 else {
      completeQueue()
      return
    }
    currentIndex += 1
    speakCurrent()
  }

  func replayCurrent() {
    precondition(Thread.isMainThread)
    guard !paragraphs.isEmpty else { return }
    speakCurrent()
  }

  func seekTo(index: Int) {
    precondition(Thread.isMainThread)
    guard !paragraphs.isEmpty else { return }
    currentIndex = min(max(index, 0), paragraphs.count - 1)
    speakCurrent()
  }

  func updateSettings(_ nextSettings: TtsSettings) {
    precondition(Thread.isMainThread)
    let shouldResume = state == .playing
    settings = nextSettings
    if shouldResume {
      speakCurrent()
    }
  }

  func addStateListener(
    _ listener: @escaping (TtsPlaybackState) -> Void
  ) -> () -> Void {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      listener(self.state)
    }
    return stateListeners.add(listener)
  }

  func addProgressListener(
    _ listener: @escaping (TtsProgress) -> Void
  ) -> () -> Void {
    DispatchQueue.main.async { [weak self] in
      guard let progress = self?.currentProgress() else { return }
      listener(progress)
    }
    return progressListeners.add(listener)
  }

  func addErrorListener(_ listener: @escaping (String) -> Void) -> () -> Void {
    return errorListeners.add(listener)
  }

  func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didFinish utterance: AVSpeechUtterance
  ) {
    guard utterance === activeUtterance else { return }
    activeUtterance = nil
    if currentIndex >= paragraphs.count - 1 {
      completeQueue()
    } else {
      currentIndex += 1
      speakCurrent()
    }
  }

  func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didCancel utterance: AVSpeechUtterance
  ) {
    if utterance === activeUtterance {
      activeUtterance = nil
    }
  }

  private func speakCurrent() {
    interruptSpeech()
    do {
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playback, mode: .spokenAudio)
      try audioSession.setActive(true)
    } catch {
      fail("Unable to activate the audio session: \(error.localizedDescription)")
      return
    }

    let paragraph = paragraphs[currentIndex]
    updateChapterMetadata(for: paragraph)
    let utterance = AVSpeechUtterance(string: paragraph.text)
    utterance.rate = (
      Float(settings.rate) * AVSpeechUtteranceDefaultSpeechRate
    ).clamped(
      to: AVSpeechUtteranceMinimumSpeechRate...AVSpeechUtteranceMaximumSpeechRate
    )
    utterance.pitchMultiplier = Float(settings.pitch).clamped(to: 0.5...2.0)
    if let identifier = settings.voiceIdentifier {
      utterance.voice = AVSpeechSynthesisVoice(identifier: identifier)
    }
    activeUtterance = utterance
    synthesizer.speak(utterance)
    state = .playing
    emitProgress()
    emitState()
  }

  private func updateChapterMetadata(for paragraph: TtsParagraph) {
    guard let currentMetadata = metadata else { return }
    let parts = paragraph.id.split(
      separator: ":",
      maxSplits: 4,
      omittingEmptySubsequences: false
    )
    guard
      (parts.count == 4 || parts.count == 5),
      parts[0] == "lnreader-chapter"
    else { return }

    let encodedChapterName = parts.count == 5 ? parts[4] : parts[3]
    guard
      let chapterName = String(encodedChapterName).removingPercentEncoding,
      !chapterName.isEmpty,
      chapterName != currentMetadata.chapterName
    else { return }

    metadata = TtsMetadata(
      novelName: currentMetadata.novelName,
      chapterName: chapterName,
      coverUri: currentMetadata.coverUri
    )
  }

  private func interruptSpeech() {
    if synthesizer.isSpeaking || synthesizer.isPaused {
      synthesizer.stopSpeaking(at: .immediate)
    }
    activeUtterance = nil
  }

  private func completeQueue() {
    state = .completed
    emitState()
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
  }

  private func fail(_ message: String) {
    state = .error
    errorListeners.emit(message)
    emitState()
  }

  private func emitState() {
    stateListeners.emit(state)
    nowPlaying.update(
      metadata: metadata,
      state: state,
      progress: currentProgress()
    )
  }

  private func emitProgress() {
    guard let progress = currentProgress() else { return }
    progressListeners.emit(progress)
    nowPlaying.update(metadata: metadata, state: state, progress: progress)
  }

  private func currentProgress() -> TtsProgress? {
    guard paragraphs.indices.contains(currentIndex) else { return nil }
    return TtsProgress(
      index: Double(currentIndex),
      total: Double(paragraphs.count),
      paragraphId: paragraphs[currentIndex].id
    )
  }
}
