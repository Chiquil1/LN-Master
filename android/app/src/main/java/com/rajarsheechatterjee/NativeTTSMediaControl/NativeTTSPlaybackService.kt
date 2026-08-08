package com.rajarsheechatterjee.NativeTTSMediaControl

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.rajarsheechatterjee.LNReader.MainActivity
import com.rajarsheechatterjee.LNReader.R
import java.io.File
import java.net.URL
import java.util.Locale
import org.json.JSONArray

/** Foreground service that owns the real reader TTS lifecycle on Android. */
class NativeTTSPlaybackService : Service(), TextToSpeech.OnInitListener {

    companion object {
        const val ACTION_CONFIGURE =
            "com.rajarsheechatterjee.LNReader.nativeTTS.CONFIGURE"
        const val ACTION_START_PLAYBACK =
            "com.rajarsheechatterjee.LNReader.nativeTTS.START_PLAYBACK"
        const val ACTION_START_CHAPTER_QUEUE =
            "com.rajarsheechatterjee.LNReader.nativeTTS.START_CHAPTER_QUEUE"
        const val ACTION_PAUSE = "com.rajarsheechatterjee.LNReader.nativeTTS.PAUSE"
        const val ACTION_RESUME = "com.rajarsheechatterjee.LNReader.nativeTTS.RESUME"
        const val ACTION_STOP = "com.rajarsheechatterjee.LNReader.nativeTTS.STOP"
        const val ACTION_PREVIOUS =
            "com.rajarsheechatterjee.LNReader.nativeTTS.PREVIOUS"
        const val ACTION_NEXT = "com.rajarsheechatterjee.LNReader.nativeTTS.NEXT"
        const val ACTION_REWIND = "com.rajarsheechatterjee.LNReader.nativeTTS.REWIND"
        const val ACTION_UPDATE_STATE =
            "com.rajarsheechatterjee.LNReader.nativeTTS.UPDATE_STATE"
        const val ACTION_UPDATE_PROGRESS =
            "com.rajarsheechatterjee.LNReader.nativeTTS.UPDATE_PROGRESS"

        const val EVENT_ACTION =
            "com.rajarsheechatterjee.LNReader.nativeTTS.EVENT"
        const val EXTRA_EVENT_NAME = "eventName"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_POSITION = "position"
        const val EXTRA_TOTAL = "total"
        const val EXTRA_TITLE = "title"
        const val EXTRA_SUBTITLE = "subtitle"
        const val EXTRA_COVER_URI = "coverUri"
        const val EXTRA_IS_PLAYING = "isPlaying"
        const val EXTRA_TEXT_SEGMENTS = "textSegments"
        const val EXTRA_CHAPTERS_JSON = "chaptersJson"
        const val EXTRA_CHAPTER_INDEX = "chapterIndex"
        const val EXTRA_CHAPTER_ID = "chapterId"
        const val EXTRA_VOICE_IDENTIFIER = "voiceIdentifier"
        const val EXTRA_LANGUAGE = "language"
        const val EXTRA_RATE = "rate"
        const val EXTRA_PITCH = "pitch"
        const val EXTRA_IS_TEST = "isTest"
        const val EXTRA_ERROR_CODE = "errorCode"
        const val EXTRA_ERROR_KIND = "errorKind"
        const val EXTRA_REQUIRES_NETWORK = "requiresNetwork"

        private const val CHANNEL_ID = "tts-media-controls"
        private const val NOTIFICATION_ID = 1001
        private const val MEDIA_SESSION_TAG = "LNReaderTTS"
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    private var textToSpeech: TextToSpeech? = null
    private var isTtsReady = false
    private var mediaSession: MediaSessionCompat? = null
    private var coverBitmap: Bitmap? = null
    private var currentCoverUri: String? = null
    private var currentTitle = "LNReader"
    private var currentSubtitle = ""
    private var textSegments: List<String> = emptyList()
    private var chapterQueue: List<TTSChapter> = emptyList()
    private var currentChapterIndex = 0
    private var currentIndex = 0
    private var configuredTotal = 0
    private var isPlaying = false
    private var isPaused = false
    private var activeUtteranceId: String? = null
    private var utteranceSequence = 0L
    private var pendingRequest: PlaybackRequest? = null
    private var pendingChapterQueueRequest: ChapterQueueRequest? = null
    private var isTestPlayback = false
    private var activeVoiceRequiresNetwork = false

    private data class PlaybackRequest(
        val segments: List<String>,
        val startIndex: Int,
        val voiceIdentifier: String,
        val language: String,
        val rate: Float,
        val pitch: Float,
        val isTest: Boolean,
    )

    private data class TTSChapter(
        val chapterId: Long,
        val chapterName: String,
        val novelName: String,
        val coverUri: String,
        val segments: List<String>,
    )

    private data class ChapterQueueRequest(
        val chapters: List<TTSChapter>,
        val startChapterIndex: Int,
        val startSegmentIndex: Int,
        val voiceIdentifier: String,
        val language: String,
        val rate: Float,
        val pitch: Float,
    )

    override fun onCreate() {
        super.onCreate()

        createNotificationChannel()
        createMediaSession()
        promoteToForeground()

        textToSpeech = TextToSpeech(applicationContext, this)
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        when (intent?.action) {
            ACTION_CONFIGURE -> configure(intent)
            ACTION_START_PLAYBACK -> startPlayback(intent)
            ACTION_START_CHAPTER_QUEUE -> startChapterQueue(intent)
            ACTION_PAUSE -> pausePlayback()
            ACTION_RESUME -> resumePlayback()
            ACTION_STOP -> stopPlayback(stopService = true)
            ACTION_PREVIOUS -> {
                pausePlayback()
                emitEvent("TTSPrev")
            }
            ACTION_NEXT -> {
                pausePlayback()
                emitEvent("TTSNext")
            }
            ACTION_REWIND -> {
                restartCurrentSegment()
                emitEvent("TTSRewind")
            }
            ACTION_UPDATE_STATE -> updatePlaybackState(
                intent.getBooleanExtra(EXTRA_IS_PLAYING, false),
            )
            ACTION_UPDATE_PROGRESS -> updateProgress(
                intent.getIntExtra(EXTRA_POSITION, currentIndex),
                intent.getIntExtra(EXTRA_TOTAL, configuredTotal),
            )
        }

        return START_NOT_STICKY
    }

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) {
            emitEvent(
                "TTSNativeError",
                message = "No se pudo iniciar el motor TTS",
                errorCode = TextToSpeech.ERROR_SERVICE,
                errorKind = "service",
            )
            stopPlayback(stopService = true)
            return
        }

        isTtsReady = true
        textToSpeech?.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        textToSpeech?.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    if (
                        utteranceId == activeUtteranceId &&
                        isPlaying &&
                        !isTestPlayback
                    ) {
                        val activeChapter = chapterQueue.getOrNull(currentChapterIndex)

                        emitEvent(
                            "TTSNativeSegment",
                            position = currentIndex,
                            total = configuredTotal,
                            chapterIndex =
                                if (activeChapter != null) currentChapterIndex else null,
                            chapterId = activeChapter?.chapterId,
                        )
                    }
                }

                override fun onDone(utteranceId: String?) {
                    if (utteranceId != activeUtteranceId) {
                        return
                    }

                    mainHandler.post {
                        if (utteranceId != activeUtteranceId || isPaused) {
                            return@post
                        }

                        advancePlayback()
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    handleUtteranceError(utteranceId, TextToSpeech.ERROR)
                }

                override fun onError(
                    utteranceId: String?,
                    errorCode: Int,
                ) {
                    handleUtteranceError(utteranceId, errorCode)
                }
            },
        )

        pendingChapterQueueRequest?.let {
            pendingChapterQueueRequest = null
            applyChapterQueueRequest(it)
            return
        }

        pendingRequest?.let {
            pendingRequest = null
            applyPlaybackRequest(it)
        }
    }

    private fun configure(intent: Intent) {
        currentTitle = intent.getStringExtra(EXTRA_TITLE) ?: currentTitle
        currentSubtitle = intent.getStringExtra(EXTRA_SUBTITLE) ?: currentSubtitle
        loadCoverBitmap(intent.getStringExtra(EXTRA_COVER_URI) ?: currentCoverUri.orEmpty())

        if (!intent.getBooleanExtra(EXTRA_IS_PLAYING, isPlaying)) {
            isPlaying = false
        }

        updateNotification()
    }

    private fun startPlayback(intent: Intent) {
        val segments = intent.getStringArrayListExtra(EXTRA_TEXT_SEGMENTS)
            ?.map(String::trim)
            ?: emptyList()

        if (segments.none(String::isNotEmpty)) {
            emitEvent("TTSNativeError", message = "No hay texto para reproducir")
            return
        }

        val request = PlaybackRequest(
            segments = segments,
            startIndex = intent.getIntExtra(EXTRA_POSITION, 0),
            voiceIdentifier = intent.getStringExtra(EXTRA_VOICE_IDENTIFIER).orEmpty(),
            language = intent.getStringExtra(EXTRA_LANGUAGE).orEmpty(),
            rate = intent.getFloatExtra(EXTRA_RATE, 1f),
            pitch = intent.getFloatExtra(EXTRA_PITCH, 1f),
            isTest = intent.getBooleanExtra(EXTRA_IS_TEST, false),
        )

        if (!isTtsReady) {
            pendingRequest = request
            return
        }

        applyPlaybackRequest(request)
    }

    private fun startChapterQueue(intent: Intent) {
        val chaptersJson = intent.getStringExtra(EXTRA_CHAPTERS_JSON).orEmpty()

        val chapters =
            try {
                parseChapterQueue(chaptersJson)
            } catch (_: Exception) {
                emptyList()
            }

        if (chapters.isEmpty()) {
            emitEvent(
                "TTSNativeError",
                message = "No se pudo preparar la cola nativa de capítulos",
            )
            return
        }

        val request =
            ChapterQueueRequest(
                chapters = chapters,
                startChapterIndex = intent.getIntExtra(EXTRA_CHAPTER_INDEX, 0),
                startSegmentIndex = intent.getIntExtra(EXTRA_POSITION, 0),
                voiceIdentifier =
                    intent.getStringExtra(EXTRA_VOICE_IDENTIFIER).orEmpty(),
                language = intent.getStringExtra(EXTRA_LANGUAGE).orEmpty(),
                rate = intent.getFloatExtra(EXTRA_RATE, 1f),
                pitch = intent.getFloatExtra(EXTRA_PITCH, 1f),
            )

        pendingRequest = null

        if (!isTtsReady) {
            pendingChapterQueueRequest = request
            return
        }

        applyChapterQueueRequest(request)
    }

    private fun parseChapterQueue(chaptersJson: String): List<TTSChapter> {
        if (chaptersJson.isBlank()) {
            return emptyList()
        }

        val jsonChapters = JSONArray(chaptersJson)
        val chapters = mutableListOf<TTSChapter>()

        for (chapterIndex in 0 until jsonChapters.length()) {
            val jsonChapter = jsonChapters.optJSONObject(chapterIndex) ?: continue
            val jsonSegments = jsonChapter.optJSONArray("segments") ?: continue
            val segments = mutableListOf<String>()

            for (segmentIndex in 0 until jsonSegments.length()) {
                val segment = jsonSegments.optString(segmentIndex).trim()

                if (segment.isNotEmpty()) {
                    segments.add(segment)
                }
            }

            if (segments.isEmpty()) {
                continue
            }

            chapters.add(
                TTSChapter(
                    chapterId = jsonChapter.optLong("chapterId", -1L),
                    chapterName =
                        jsonChapter.optString("chapterName", "Capítulo"),
                    novelName =
                        jsonChapter.optString("novelName", "LNReader"),
                    coverUri = jsonChapter.optString("coverUri", ""),
                    segments = segments,
                ),
            )
        }

        return chapters
    }

    private fun applyChapterQueueRequest(request: ChapterQueueRequest) {
        textToSpeech?.stop()
        activeUtteranceId = null
        pendingRequest = null
        pendingChapterQueueRequest = null

        chapterQueue = request.chapters
        currentChapterIndex =
            request.startChapterIndex.coerceIn(0, chapterQueue.lastIndex)

        val chapter = chapterQueue[currentChapterIndex]

        currentTitle = chapter.novelName.ifBlank { "LNReader" }
        currentSubtitle = chapter.chapterName
        loadCoverBitmap(chapter.coverUri)

        textSegments = chapter.segments
        configuredTotal = chapter.segments.size
        currentIndex =
            request.startSegmentIndex.coerceIn(
                0,
                chapter.segments.lastIndex,
            )

        isPaused = false
        isPlaying = true
        isTestPlayback = false

        configureVoice(
            PlaybackRequest(
                segments = chapter.segments,
                startIndex = currentIndex,
                voiceIdentifier = request.voiceIdentifier,
                language = request.language,
                rate = request.rate,
                pitch = request.pitch,
                isTest = false,
            ),
        )

        updateNotification()
        speakCurrentSegment()
    }

    private fun applyPlaybackRequest(request: PlaybackRequest) {
        textToSpeech?.stop()
        activeUtteranceId = null
        pendingChapterQueueRequest = null
        chapterQueue = emptyList()
        currentChapterIndex = 0
        textSegments = request.segments
        configuredTotal = request.segments.size
        currentIndex = request.startIndex.coerceIn(0, request.segments.lastIndex)
        isPaused = false
        isPlaying = true
        isTestPlayback = request.isTest

        configureVoice(request)
        speakCurrentSegment()
    }

    private fun configureVoice(request: PlaybackRequest) {
        val tts = textToSpeech ?: return

        tts.setSpeechRate(request.rate.coerceIn(0.1f, 5f))
        tts.setPitch(request.pitch.coerceIn(0.1f, 2f))

        if (request.language.isNotBlank() && request.language != "System") {
            val locale = Locale.forLanguageTag(request.language.replace('_', '-'))

            if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                tts.language = locale
            }
        }

        if (request.voiceIdentifier.isNotBlank() && request.voiceIdentifier != "System") {
            val nativeVoiceName = request.voiceIdentifier.substringAfterLast(':')

            tts.voices
                ?.firstOrNull { voice ->
                    voice.name == request.voiceIdentifier ||
                        voice.name == nativeVoiceName ||
                        request.voiceIdentifier.endsWith(voice.name)
                }
                ?.let { voice -> tts.voice = voice }
        }

        activeVoiceRequiresNetwork = tts.voice?.isNetworkConnectionRequired == true
    }

    private fun speakCurrentSegment() {
        if (!isTtsReady || isPaused || !isPlaying) {
            return
        }

        while (currentIndex < textSegments.size && textSegments[currentIndex].length < 2) {
            currentIndex++
        }

        if (currentIndex >= textSegments.size) {
            finishQueue()
            return
        }

        utteranceSequence++
        val utteranceId = "lnreader-tts-$utteranceSequence-$currentIndex"
        activeUtteranceId = utteranceId

        val result = textToSpeech?.speak(
            textSegments[currentIndex],
            TextToSpeech.QUEUE_FLUSH,
            null,
            utteranceId,
        ) ?: TextToSpeech.ERROR

        if (result == TextToSpeech.ERROR) {
            handleUtteranceError(utteranceId, TextToSpeech.ERROR)
            return
        }

        updateNotification()
    }

    private fun handleUtteranceError(
        utteranceId: String?,
        errorCode: Int,
    ) {
        mainHandler.post {
            if (utteranceId != activeUtteranceId) {
                return@post
            }

            activeUtteranceId = null
            isPlaying = false
            isPaused = true
            textToSpeech?.stop()
            updateNotification()

            val activeChapter = chapterQueue.getOrNull(currentChapterIndex)

            emitEvent(
                "TTSNativeError",
                position = currentIndex,
                total = configuredTotal,
                chapterIndex =
                    if (activeChapter != null) currentChapterIndex else null,
                chapterId = activeChapter?.chapterId,
                message = ttsErrorMessage(errorCode),
                errorCode = errorCode,
                errorKind = ttsErrorKind(errorCode),
                requiresNetwork = activeVoiceRequiresNetwork,
            )
        }
    }

    private fun ttsErrorKind(errorCode: Int): String =
        when (errorCode) {
            TextToSpeech.ERROR_NETWORK -> "network"
            TextToSpeech.ERROR_NETWORK_TIMEOUT -> "network_timeout"
            TextToSpeech.ERROR_NOT_INSTALLED_YET -> "voice_not_installed"
            TextToSpeech.ERROR_SERVICE -> "service"
            TextToSpeech.ERROR_SYNTHESIS -> "synthesis"
            TextToSpeech.ERROR_OUTPUT -> "output"
            TextToSpeech.ERROR_INVALID_REQUEST -> "invalid_request"
            else -> "generic"
        }

    private fun ttsErrorMessage(errorCode: Int): String =
        when (errorCode) {
            TextToSpeech.ERROR_NETWORK ->
                "El motor TTS perdió la conexión de red"
            TextToSpeech.ERROR_NETWORK_TIMEOUT ->
                "El motor TTS agotó el tiempo de espera de red"
            TextToSpeech.ERROR_NOT_INSTALLED_YET ->
                "La voz TTS todavía no está instalada completamente"
            TextToSpeech.ERROR_SERVICE ->
                "El servicio TTS de Android produjo un error"
            TextToSpeech.ERROR_SYNTHESIS ->
                "El motor TTS no pudo sintetizar el fragmento"
            TextToSpeech.ERROR_OUTPUT ->
                "El motor TTS no pudo reproducir el audio generado"
            TextToSpeech.ERROR_INVALID_REQUEST ->
                "El motor TTS rechazó la solicitud de lectura"
            else ->
                "El motor TTS no pudo leer el fragmento"
        }

    private fun advancePlayback() {
        activeUtteranceId = null
        currentIndex++

        if (currentIndex < textSegments.size) {
            speakCurrentSegment()
            return
        }

        finishQueue()
    }

    private fun finishQueue() {
        activeUtteranceId = null
        isPlaying = false
        isPaused = false
        updateNotification()

        if (isTestPlayback) {
            mainHandler.postDelayed(
                {
                    if (isTestPlayback && !isPlaying) {
                        stopPlayback(stopService = true)
                    }
                },
                700,
            )
            return
        }

        val activeChapter = chapterQueue.getOrNull(currentChapterIndex)

        emitEvent(
            "TTSNativeQueueFinished",
            position = configuredTotal,
            total = configuredTotal,
            chapterIndex =
                if (activeChapter != null) currentChapterIndex else null,
            chapterId = activeChapter?.chapterId,
        )
    }

    private fun pausePlayback() {
        if (!isPlaying) {
            return
        }

        isPlaying = false
        isPaused = true
        activeUtteranceId = null
        textToSpeech?.stop()
        updateNotification()
    }

    private fun resumePlayback() {
        if (!isPaused || textSegments.isEmpty()) {
            return
        }

        isPaused = false
        isPlaying = true
        speakCurrentSegment()
    }

    private fun updatePlaybackState(playing: Boolean) {
        if (playing) {
            resumePlayback()
        } else if (isPlaying) {
            pausePlayback()
        } else {
            updateNotification()
        }
    }

    private fun restartCurrentSegment() {
        if (textSegments.isEmpty()) {
            return
        }

        isPaused = false
        isPlaying = true
        textToSpeech?.stop()
        activeUtteranceId = null
        speakCurrentSegment()
    }

    private fun updateProgress(position: Int, total: Int) {
        currentIndex = position.coerceAtLeast(0)
        configuredTotal = total.coerceAtLeast(textSegments.size)
        updateNotification()
    }

    private fun stopPlayback(stopService: Boolean) {
        pendingRequest = null
        pendingChapterQueueRequest = null
        textSegments = emptyList()
        chapterQueue = emptyList()
        currentChapterIndex = 0
        currentIndex = 0
        configuredTotal = 0
        activeUtteranceId = null
        isPlaying = false
        isPaused = false
        isTestPlayback = false
        activeVoiceRequiresNetwork = false
        textToSpeech?.stop()

        if (stopService) {
            mediaSession?.isActive = false
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
        } else {
            updateNotification()
        }
    }

    private fun createMediaSession() {
        mediaSession = MediaSessionCompat(this, MEDIA_SESSION_TAG).apply {
            setCallback(
                object : MediaSessionCompat.Callback() {
                    override fun onPlay() {
                        resumePlayback()
                        emitEvent("TTSPlay")
                    }

                    override fun onPause() {
                        pausePlayback()
                        emitEvent("TTSPause")
                    }

                    override fun onStop() {
                        emitEvent("TTSStop")
                        stopPlayback(stopService = true)
                    }

                    override fun onSkipToPrevious() {
                        pausePlayback()
                        emitEvent("TTSPrev")
                    }

                    override fun onSkipToNext() {
                        pausePlayback()
                        emitEvent("TTSNext")
                    }

                    override fun onSeekTo(pos: Long) {
                        if (textSegments.isEmpty()) {
                            return
                        }

                        currentIndex = (pos / 1000L)
                            .toInt()
                            .coerceIn(0, textSegments.lastIndex)
                        isPaused = false
                        isPlaying = true
                        textToSpeech?.stop()
                        activeUtteranceId = null
                        speakCurrentSegment()
                    }
                },
            )
            isActive = true
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Controles de lectura TTS",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Controles de reproducción de lectura en voz alta"
                setShowBadge(false)
            },
        )
    }

    private fun promoteToForeground() {
        val foregroundServiceType =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            } else {
                0
            }

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(),
            foregroundServiceType,
        )
    }

    private fun updateNotification() {
        val session = mediaSession ?: return
        val position = currentIndex.toLong() * 1000L

        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_STOP or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SEEK_TO,
                )
                .setState(
                    if (isPlaying) {
                        PlaybackStateCompat.STATE_PLAYING
                    } else {
                        PlaybackStateCompat.STATE_PAUSED
                    },
                    position,
                    1f,
                )
                .build(),
        )

        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentSubtitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentTitle)
                .putLong(
                    MediaMetadataCompat.METADATA_KEY_DURATION,
                    configuredTotal.toLong() * 1000L,
                )
                .apply {
                    coverBitmap?.let { bitmap ->
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap)
                    }
                }
                .build(),
        )

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val session = mediaSession
        val previousAction = mediaAction(
            android.R.drawable.ic_media_previous,
            "Anterior",
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
        )
        val rewindAction = mediaAction(
            android.R.drawable.ic_media_rew,
            "Repetir",
            PlaybackStateCompat.ACTION_REWIND,
        )
        val playPauseAction = mediaAction(
            if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (isPlaying) "Pausar" else "Reproducir",
            if (isPlaying) PlaybackStateCompat.ACTION_PAUSE else PlaybackStateCompat.ACTION_PLAY,
        )
        val nextAction = mediaAction(
            android.R.drawable.ic_media_next,
            "Siguiente",
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_icon)
            .setLargeIcon(coverBitmap)
            .setContentTitle(currentSubtitle.ifBlank { currentTitle })
            .setContentText(currentTitle)
            .setContentIntent(openAppPendingIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .addAction(previousAction)
            .addAction(rewindAction)
            .addAction(playPauseAction)
            .addAction(nextAction)
            .setStyle(
                MediaStyle()
                    .setMediaSession(session?.sessionToken)
                    .setShowActionsInCompactView(1, 2, 3),
            )
            .build()
    }

    private fun mediaAction(
        icon: Int,
        label: String,
        action: Long,
    ): NotificationCompat.Action =
        NotificationCompat.Action.Builder(
            icon,
            label,
            MediaButtonReceiverIntent.create(this, action),
        ).build()

    private fun openAppPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun loadCoverBitmap(coverUri: String) {
        if (coverUri == currentCoverUri && coverBitmap != null) {
            return
        }

        currentCoverUri = coverUri
        coverBitmap = null

        when {
            coverUri.isBlank() -> return
            coverUri.startsWith("file://") -> {
                val path = coverUri.removePrefix("file://").substringBefore('?')
                val file = File(path)

                if (file.exists()) {
                    coverBitmap = BitmapFactory.decodeFile(file.absolutePath)
                }
            }
            coverUri.startsWith("http") -> {
                Thread {
                    try {
                        URL(coverUri).openStream().use { stream ->
                            coverBitmap = BitmapFactory.decodeStream(stream)
                        }
                        mainHandler.post(::updateNotification)
                    } catch (_: Exception) {
                        // Failing to load artwork must never interrupt reading.
                    }
                }.start()
            }
        }
    }

    private fun emitEvent(
        eventName: String,
        position: Int? = null,
        total: Int? = null,
        chapterIndex: Int? = null,
        chapterId: Long? = null,
        message: String? = null,
        errorCode: Int? = null,
        errorKind: String? = null,
        requiresNetwork: Boolean? = null,
    ) {
        val intent = Intent(EVENT_ACTION).setPackage(packageName).apply {
            putExtra(EXTRA_EVENT_NAME, eventName)
            position?.let { putExtra(EXTRA_POSITION, it) }
            total?.let { putExtra(EXTRA_TOTAL, it) }
            chapterIndex?.let { putExtra(EXTRA_CHAPTER_INDEX, it) }
            chapterId?.let { putExtra(EXTRA_CHAPTER_ID, it) }
            message?.let { putExtra(EXTRA_MESSAGE, it) }
            errorCode?.let { putExtra(EXTRA_ERROR_CODE, it) }
            errorKind?.let { putExtra(EXTRA_ERROR_KIND, it) }
            requiresNetwork?.let { putExtra(EXTRA_REQUIRES_NETWORK, it) }
        }

        sendBroadcast(intent)
    }

    override fun onDestroy() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

/** Builds MediaSession-compatible PendingIntents without a broadcast receiver. */
private object MediaButtonReceiverIntent {
    fun create(
        context: Context,
        action: Long,
    ): PendingIntent {
        val intent = Intent(context, NativeTTSPlaybackService::class.java).apply {
            this.action = when (action) {
                PlaybackStateCompat.ACTION_PLAY -> NativeTTSPlaybackService.ACTION_RESUME
                PlaybackStateCompat.ACTION_PAUSE -> NativeTTSPlaybackService.ACTION_PAUSE
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS -> NativeTTSPlaybackService.ACTION_PREVIOUS
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT -> NativeTTSPlaybackService.ACTION_NEXT
                PlaybackStateCompat.ACTION_REWIND -> NativeTTSPlaybackService.ACTION_REWIND
                else -> NativeTTSPlaybackService.ACTION_STOP
            }
        }

        return PendingIntent.getService(
            context,
            action.toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
