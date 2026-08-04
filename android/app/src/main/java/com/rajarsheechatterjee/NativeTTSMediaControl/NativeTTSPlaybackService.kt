package com.rajarsheechatterjee.NativeTTSMediaControl

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.rajarsheechatterjee.LNReader.MainActivity
import com.rajarsheechatterjee.LNReader.R

class NativeTTSPlaybackService : Service(), TextToSpeech.OnInitListener {

    companion object {
        const val ACTION_SPEAK_TEST =
            "com.rajarsheechatterjee.LNReader.nativeTTS.SPEAK_TEST"

        const val ACTION_STOP =
            "com.rajarsheechatterjee.LNReader.nativeTTS.STOP"

        const val EXTRA_TEXT = "text"

        private const val CHANNEL_ID = "native-tts-playback"
        private const val NOTIFICATION_ID = 1002
        private const val TEST_UTTERANCE_ID = "native-tts-test"
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    private var textToSpeech: TextToSpeech? = null
    private var isReady = false
    private var pendingText: String? = null

    override fun onCreate() {
        super.onCreate()

        createNotificationChannel()
        promoteToForeground("Preparando el motor de voz…")

        textToSpeech = TextToSpeech(applicationContext, this)
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        when (intent?.action) {
            ACTION_SPEAK_TEST -> {
                val requestedText = intent
                    .getStringExtra(EXTRA_TEXT)
                    ?.trim()

                pendingText = if (requestedText.isNullOrEmpty()) {
                    "Esta es una prueba del lector nativo de LNReader. " +
                        "La voz debe continuar aunque salgas de la aplicación " +
                        "o apagues la pantalla del teléfono."
                } else {
                    requestedText
                }

                speakPendingText()
            }

            ACTION_STOP -> {
                stopPlaybackAndService()
            }
        }

        return START_NOT_STICKY
    }

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) {
            updateNotification("No se pudo iniciar el motor TTS")

            mainHandler.postDelayed(
                { stopPlaybackAndService() },
                1_000,
            )
            return
        }

        isReady = true

        textToSpeech?.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )

        textToSpeech?.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    updateNotification("Reproduciendo prueba nativa…")
                }

                override fun onDone(utteranceId: String?) {
                    if (utteranceId != TEST_UTTERANCE_ID) {
                        return
                    }

                    mainHandler.post {
                        updateNotification("Prueba terminada")

                        mainHandler.postDelayed(
                            { stopPlaybackAndService() },
                            700,
                        )
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    handleSpeechError()
                }

                override fun onError(
                    utteranceId: String?,
                    errorCode: Int,
                ) {
                    handleSpeechError()
                }
            },
        )

        speakPendingText()
    }

    private fun speakPendingText() {
        if (!isReady) {
            return
        }

        val text = pendingText ?: return
        pendingText = null

        val result = textToSpeech?.speak(
            text,
            TextToSpeech.QUEUE_FLUSH,
            null,
            TEST_UTTERANCE_ID,
        )

        if (result == TextToSpeech.ERROR) {
            handleSpeechError()
        }
    }

    private fun handleSpeechError() {
        mainHandler.post {
            updateNotification("Error al reproducir la prueba")

            mainHandler.postDelayed(
                { stopPlaybackAndService() },
                1_000,
            )
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val notificationManager = getSystemService(
            Context.NOTIFICATION_SERVICE,
        ) as NotificationManager

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Reproducción TTS nativa",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Mantiene la lectura TTS activa en segundo plano"
            setShowBadge(false)
        }

        notificationManager.createNotificationChannel(channel)
    }

    private fun promoteToForeground(status: String) {
        val foregroundServiceType =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            } else {
                0
            }

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(status),
            foregroundServiceType,
        )
    }

    private fun updateNotification(status: String) {
        val notificationManager = getSystemService(
            Context.NOTIFICATION_SERVICE,
        ) as NotificationManager

        notificationManager.notify(
            NOTIFICATION_ID,
            buildNotification(status),
        )
    }

    private fun buildNotification(status: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags =
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val openAppPendingIntent = PendingIntent.getActivity(
            this,
            1001,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE,
        )

        val stopIntent = Intent(
            this,
            NativeTTSPlaybackService::class.java,
        ).apply {
            action = ACTION_STOP
        }

        val stopPendingIntent = PendingIntent.getService(
            this,
            1002,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_icon)
            .setContentTitle("LNReader TTS")
            .setContentText(status)
            .setContentIntent(openAppPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Detener",
                stopPendingIntent,
            )
            .build()
    }

    private fun stopPlaybackAndService() {
        pendingText = null
        isReady = false

        textToSpeech?.stop()

        ServiceCompat.stopForeground(
            this,
            ServiceCompat.STOP_FOREGROUND_REMOVE,
        )

        stopSelf()
    }

    override fun onDestroy() {
        pendingText = null
        isReady = false

        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null

        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}