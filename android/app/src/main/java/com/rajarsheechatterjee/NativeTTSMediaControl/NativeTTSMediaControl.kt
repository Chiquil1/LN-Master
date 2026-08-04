package com.rajarsheechatterjee.NativeTTSMediaControl

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.lnreader.spec.NativeTTSMediaControlSpec
import java.io.File
import java.net.URL

class NativeTTSMediaControl(
    private val appContext: ReactApplicationContext,
) : NativeTTSMediaControlSpec(appContext) {

    companion object {
        private const val CHANNEL_ID = "tts-media-controls"
        private const val NOTIFICATION_ID = 1001

        private const val ACTION_PLAY = "com.lnreader.TTS_PLAY"
        private const val ACTION_PAUSE = "com.lnreader.TTS_PAUSE"
        private const val ACTION_STOP = "com.lnreader.TTS_STOP"
        private const val ACTION_PREV = "com.lnreader.TTS_PREV"
        private const val ACTION_NEXT = "com.lnreader.TTS_NEXT"
        private const val ACTION_REWIND = "com.lnreader.TTS_REWIND"
    }

    private var mediaSession: MediaSessionCompat? = null
    private var isPlaying = false
    private var listenerCount = 0
    private var coverBitmap: Bitmap? = null
    private var currentCoverUri: String? = null
    private var currentTitle: String? = null
    private var currentSubtitle: String? = null
    private var receiverRegistered = false
    private var currentPosition: Long = 0L
    private var totalDuration: Long = 0L

    private val mediaReceiver = object : BroadcastReceiver() {
        override fun onReceive(
            context: Context,
            intent: Intent,
        ) {
            when (intent.action) {
                ACTION_PLAY -> {
                    isPlaying = true
                    updateNotification()
                    sendEvent("TTSPlay")
                }

                ACTION_PAUSE -> {
                    isPlaying = false
                    updateNotification()
                    sendEvent("TTSPause")
                }

                ACTION_STOP -> {
                    sendEvent("TTSStop")
                    updateNotification()
                }

                ACTION_PREV -> {
                    isPlaying = false
                    updateNotification()
                    sendEvent("TTSPrev")
                }

                ACTION_NEXT -> {
                    isPlaying = false
                    updateNotification()
                    sendEvent("TTSNext")
                }

                ACTION_REWIND -> {
                    updateNotification()
                    sendEvent("TTSRewind")
                }
            }
        }
    }

    private fun sendEvent(eventName: String) {
        if (listenerCount <= 0) {
            return
        }

        try {
            appContext
                .getJSModule(
                    DeviceEventManagerModule.RCTDeviceEventEmitter::class.java,
                )
                .emit(eventName, null)
        } catch (_: Exception) {
            // JavaScript puede no estar disponible cuando la aplicación
            // está suspendida o en segundo plano profundo.
        }
    }

    private fun sendSeekEvent(elementIndex: Long) {
        if (listenerCount <= 0) {
            return
        }

        val params =
            com.facebook.react.bridge.Arguments
                .createMap()
                .apply {
                    putInt(
                        "position",
                        elementIndex.toInt(),
                    )
                }

        try {
            appContext
                .getJSModule(
                    DeviceEventManagerModule.RCTDeviceEventEmitter::class.java,
                )
                .emit(
                    "TTSSeekTo",
                    params,
                )
        } catch (_: Exception) {
            // JavaScript puede no estar disponible.
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val manager =
            appContext.getSystemService(
                Context.NOTIFICATION_SERVICE,
            ) as NotificationManager

        val channel =
            NotificationChannel(
                CHANNEL_ID,
                "TTS Media Controls",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Text-to-speech playback controls"
                setShowBadge(false)
            }

        manager.createNotificationChannel(channel)
    }

    private fun ensureMediaSession() {
        if (mediaSession != null) {
            return
        }

        mediaSession =
            MediaSessionCompat(
                appContext,
                "LNReaderTTS",
            ).apply {
                setCallback(
                    object : MediaSessionCompat.Callback() {
                        override fun onPlay() {
                            isPlaying = true
                            sendEvent("TTSPlay")
                            updateNotification()
                        }

                        override fun onPause() {
                            isPlaying = false
                            sendEvent("TTSPause")
                            updateNotification()
                        }

                        override fun onStop() {
                            sendEvent("TTSStop")
                        }

                        override fun onSkipToPrevious() {
                            isPlaying = false
                            updateNotification()
                            sendEvent("TTSPrev")
                        }

                        override fun onSkipToNext() {
                            isPlaying = false
                            updateNotification()
                            sendEvent("TTSNext")
                        }

                        override fun onSeekTo(pos: Long) {
                            val elementIndex = pos / 1000L
                            currentPosition = elementIndex

                            updateNotification()
                            sendSeekEvent(elementIndex)
                        }
                    },
                )

                isActive = true
            }
    }

    private fun registerReceiver() {
        if (receiverRegistered) {
            return
        }

        val filter =
            IntentFilter().apply {
                addAction(ACTION_PLAY)
                addAction(ACTION_PAUSE)
                addAction(ACTION_STOP)
                addAction(ACTION_PREV)
                addAction(ACTION_NEXT)
                addAction(ACTION_REWIND)
            }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(
                mediaReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED,
            )
        } else {
            appContext.registerReceiver(
                mediaReceiver,
                filter,
            )
        }

        receiverRegistered = true
    }

    private fun buildPendingIntent(action: String): PendingIntent {
        val intent =
            Intent(action).setPackage(
                appContext.packageName,
            )

        return PendingIntent.getBroadcast(
            appContext,
            action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun getContentIntent(): PendingIntent {
        val intent =
            appContext.packageManager
                .getLaunchIntentForPackage(
                    appContext.packageName,
                )
                ?: Intent()

        return PendingIntent.getActivity(
            appContext,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun updateNotification() {
        val session = mediaSession ?: return

        val stateBuilder =
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
                    currentPosition * 1000L,
                    1f,
                )

        session.setPlaybackState(
            stateBuilder.build(),
        )

        val metadataBuilder =
            MediaMetadataCompat.Builder()
                .putString(
                    MediaMetadataCompat.METADATA_KEY_TITLE,
                    currentSubtitle ?: "",
                )
                .putString(
                    MediaMetadataCompat.METADATA_KEY_ARTIST,
                    currentTitle ?: "",
                )
                .putLong(
                    MediaMetadataCompat.METADATA_KEY_DURATION,
                    totalDuration * 1000L,
                )

        coverBitmap?.let { bitmap ->
            metadataBuilder.putBitmap(
                MediaMetadataCompat.METADATA_KEY_ALBUM_ART,
                bitmap,
            )
        }

        session.setMetadata(
            metadataBuilder.build(),
        )

        val playPauseAction =
            if (isPlaying) {
                NotificationCompat.Action.Builder(
                    android.R.drawable.ic_media_pause,
                    "Pausar",
                    buildPendingIntent(ACTION_PAUSE),
                ).build()
            } else {
                NotificationCompat.Action.Builder(
                    android.R.drawable.ic_media_play,
                    "Reproducir",
                    buildPendingIntent(ACTION_PLAY),
                ).build()
            }

        val prevAction =
            NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_previous,
                "Anterior",
                buildPendingIntent(ACTION_PREV),
            ).build()

        val rewindAction =
            NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_rew,
                "Repetir",
                buildPendingIntent(ACTION_REWIND),
            ).build()

        val nextAction =
            NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_next,
                "Siguiente",
                buildPendingIntent(ACTION_NEXT),
            ).build()

        val notification =
            NotificationCompat.Builder(
                appContext,
                CHANNEL_ID,
            )
                .setContentTitle(currentSubtitle)
                .setContentText(currentTitle)
                .setSmallIcon(appContext.applicationInfo.icon)
                .setLargeIcon(coverBitmap)
                .setContentIntent(getContentIntent())
                .setDeleteIntent(
                    buildPendingIntent(ACTION_STOP),
                )
                .setVisibility(
                    NotificationCompat.VISIBILITY_PUBLIC,
                )
                .setOngoing(true)
                .setAutoCancel(false)
                .addAction(prevAction)
                .addAction(rewindAction)
                .addAction(playPauseAction)
                .addAction(nextAction)
                .setStyle(
                    MediaStyle()
                        .setMediaSession(
                            session.sessionToken,
                        )
                        .setShowActionsInCompactView(
                            1,
                            2,
                            3,
                        ),
                )
                .build()

        val manager =
            appContext.getSystemService(
                Context.NOTIFICATION_SERVICE,
            ) as NotificationManager

        manager.notify(
            NOTIFICATION_ID,
            notification,
        )
    }

    private fun loadCoverBitmap(coverUri: String) {
        if (
            coverUri == currentCoverUri &&
            coverBitmap != null
        ) {
            return
        }

        currentCoverUri = coverUri

        if (coverUri.isBlank()) {
            coverBitmap = null
            return
        }

        if (coverUri.startsWith("file://")) {
            val path =
                coverUri
                    .removePrefix("file://")
                    .split("?")[0]

            val file = File(path)

            if (file.exists()) {
                coverBitmap =
                    BitmapFactory.decodeFile(
                        file.absolutePath,
                    )
            }

            return
        }

        if (coverUri.startsWith("http")) {
            coverBitmap = null

            Thread {
                try {
                    val stream =
                        URL(coverUri).openStream()

                    val bitmap =
                        BitmapFactory.decodeStream(
                            stream,
                        )

                    stream.close()

                    coverBitmap = bitmap
                    updateNotification()
                } catch (_: Exception) {
                    // No interrumpimos el TTS si falla la portada.
                }
            }.start()
        }
    }

    override fun showMediaNotification(
        title: String,
        subtitle: String,
        coverUri: String,
        isPlaying: Boolean,
    ) {
        this.isPlaying = isPlaying
        currentTitle = title
        currentSubtitle = subtitle

        ensureChannel()
        ensureMediaSession()
        registerReceiver()
        loadCoverBitmap(coverUri)
        updateNotification()
    }

    override fun updatePlaybackState(isPlaying: Boolean) {
        this.isPlaying = isPlaying
        updateNotification()
    }

    override fun updateProgress(
        current: Double,
        total: Double,
    ) {
        currentPosition = current.toLong()
        totalDuration = total.toLong()

        updateNotification()
    }

    override fun speakTest(text: String) {
        val serviceIntent =
            Intent(
                appContext,
                NativeTTSPlaybackService::class.java,
            ).apply {
                action =
                    NativeTTSPlaybackService.ACTION_SPEAK_TEST

                putExtra(
                    NativeTTSPlaybackService.EXTRA_TEXT,
                    text,
                )
            }

        ContextCompat.startForegroundService(
            appContext,
            serviceIntent,
        )
    }

    override fun stopNativePlayback() {
        val serviceIntent =
            Intent(
                appContext,
                NativeTTSPlaybackService::class.java,
            )

        appContext.stopService(serviceIntent)
    }

    override fun dismiss() {
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null

        val manager =
            appContext.getSystemService(
                Context.NOTIFICATION_SERVICE,
            ) as NotificationManager

        manager.cancel(NOTIFICATION_ID)

        if (receiverRegistered) {
            try {
                appContext.unregisterReceiver(
                    mediaReceiver,
                )
            } catch (_: Exception) {
                // El receptor ya podía haber sido eliminado.
            }

            receiverRegistered = false
        }

        coverBitmap = null
        currentCoverUri = null
        currentTitle = null
        currentSubtitle = null
        currentPosition = 0L
        totalDuration = 0L
        isPlaying = false
    }

    override fun addListener(eventName: String?) {
        listenerCount++
    }

    override fun removeListeners(count: Double) {
        listenerCount =
            (
                listenerCount -
                    count.toInt()
            ).coerceAtLeast(0)
    }
}