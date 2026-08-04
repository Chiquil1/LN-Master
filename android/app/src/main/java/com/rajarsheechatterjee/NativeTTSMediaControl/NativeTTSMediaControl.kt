package com.rajarsheechatterjee.NativeTTSMediaControl

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.lnreader.spec.NativeTTSMediaControlSpec
import org.json.JSONArray

/**
 * JavaScript bridge for the foreground TTS service.
 *
 * The service owns both Android's MediaSession and its notification. Keeping
 * them together is important: a foreground service notification must describe
 * the audio that service is actually playing.
 */
class NativeTTSMediaControl(
    private val appContext: ReactApplicationContext,
) : NativeTTSMediaControlSpec(appContext) {

    private var listenerCount = 0
    private var receiverRegistered = false
    private var serviceActive = false

    private val serviceEventReceiver = object : BroadcastReceiver() {
        override fun onReceive(
            context: Context,
            intent: Intent,
        ) {
            if (intent.action != NativeTTSPlaybackService.EVENT_ACTION) {
                return
            }

            val eventName =
                intent.getStringExtra(
                    NativeTTSPlaybackService.EXTRA_EVENT_NAME,
                ) ?: return

            val params = Arguments.createMap()

            if (intent.hasExtra(NativeTTSPlaybackService.EXTRA_POSITION)) {
                params.putInt(
                    "position",
                    intent.getIntExtra(
                        NativeTTSPlaybackService.EXTRA_POSITION,
                        0,
                    ),
                )
            }

            if (intent.hasExtra(NativeTTSPlaybackService.EXTRA_MESSAGE)) {
                params.putString(
                    "message",
                    intent.getStringExtra(
                        NativeTTSPlaybackService.EXTRA_MESSAGE,
                    ),
                )
            }

            sendEvent(eventName, params)
        }
    }

    private fun registerEventReceiver() {
        if (receiverRegistered) {
            return
        }

        val filter = IntentFilter(NativeTTSPlaybackService.EVENT_ACTION)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(
                serviceEventReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED,
            )
        } else {
            appContext.registerReceiver(serviceEventReceiver, filter)
        }

        receiverRegistered = true
    }

    private fun unregisterEventReceiver() {
        if (!receiverRegistered) {
            return
        }

        try {
            appContext.unregisterReceiver(serviceEventReceiver)
        } catch (_: IllegalArgumentException) {
            // The React context can dispose the receiver before this module.
        }

        receiverRegistered = false
    }

    private fun sendEvent(
        eventName: String,
        params: com.facebook.react.bridge.WritableMap,
    ) {
        if (listenerCount <= 0) {
            return
        }

        try {
            appContext
                .getJSModule(
                    DeviceEventManagerModule.RCTDeviceEventEmitter::class.java,
                )
                .emit(eventName, params)
        } catch (_: Exception) {
            // JavaScript may not be available while React Native is restarting.
        }
    }

    private fun foregroundIntent(action: String): Intent =
        Intent(appContext, NativeTTSPlaybackService::class.java).apply {
            this.action = action
        }

    private fun startForegroundService(intent: Intent) {
        ContextCompat.startForegroundService(appContext, intent)
    }

    override fun showMediaNotification(
        title: String,
        subtitle: String,
        coverUri: String,
        isPlaying: Boolean,
    ) {
        serviceActive = true

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_CONFIGURE).apply {
                putExtra(NativeTTSPlaybackService.EXTRA_TITLE, title)
                putExtra(NativeTTSPlaybackService.EXTRA_SUBTITLE, subtitle)
                putExtra(NativeTTSPlaybackService.EXTRA_COVER_URI, coverUri)
                putExtra(NativeTTSPlaybackService.EXTRA_IS_PLAYING, isPlaying)
            },
        )
    }

    override fun updatePlaybackState(isPlaying: Boolean) {
        if (!serviceActive) {
            return
        }

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_UPDATE_STATE).apply {
                putExtra(NativeTTSPlaybackService.EXTRA_IS_PLAYING, isPlaying)
            },
        )
    }

    override fun updateProgress(
        current: Double,
        total: Double,
    ) {
        if (!serviceActive) {
            return
        }

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_UPDATE_PROGRESS).apply {
                putExtra(NativeTTSPlaybackService.EXTRA_POSITION, current.toInt())
                putExtra(NativeTTSPlaybackService.EXTRA_TOTAL, total.toInt())
            },
        )
    }

    override fun startPlayback(
        textSegmentsJson: String,
        startIndex: Double,
        voiceIdentifier: String,
        language: String,
        rate: Double,
        pitch: Double,
    ) {
        val textSegments = ArrayList<String>()

        try {
            val jsonSegments = JSONArray(textSegmentsJson)

            for (index in 0 until jsonSegments.length()) {
                textSegments.add(jsonSegments.optString(index))
            }
        } catch (_: Exception) {
            sendEvent(
                "TTSNativeError",
                Arguments.createMap().apply {
                    putString("message", "No se pudo preparar la cola de lectura")
                },
            )
            return
        }

        if (textSegments.none { it.isNotBlank() }) {
            return
        }

        serviceActive = true

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_START_PLAYBACK).apply {
                putStringArrayListExtra(
                    NativeTTSPlaybackService.EXTRA_TEXT_SEGMENTS,
                    textSegments,
                )
                putExtra(
                    NativeTTSPlaybackService.EXTRA_POSITION,
                    startIndex.toInt(),
                )
                putExtra(
                    NativeTTSPlaybackService.EXTRA_VOICE_IDENTIFIER,
                    voiceIdentifier,
                )
                putExtra(NativeTTSPlaybackService.EXTRA_LANGUAGE, language)
                putExtra(NativeTTSPlaybackService.EXTRA_RATE, rate.toFloat())
                putExtra(NativeTTSPlaybackService.EXTRA_PITCH, pitch.toFloat())
            },
        )
    }

    override fun pausePlayback() {
        if (!serviceActive) {
            return
        }

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_PAUSE),
        )
    }

    override fun resumePlayback() {
        if (!serviceActive) {
            return
        }

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_RESUME),
        )
    }

    override fun speakTest(text: String) {
        serviceActive = true

        showMediaNotification(
            "Prueba TTS nativa",
            "LNReader",
            "",
            true,
        )

        startForegroundService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_START_PLAYBACK).apply {
                putStringArrayListExtra(
                    NativeTTSPlaybackService.EXTRA_TEXT_SEGMENTS,
                    arrayListOf(text),
                )
                putExtra(NativeTTSPlaybackService.EXTRA_POSITION, 0)
                putExtra(NativeTTSPlaybackService.EXTRA_IS_TEST, true)
            },
        )
    }

    override fun stopNativePlayback() {
        serviceActive = false
        appContext.startService(
            foregroundIntent(NativeTTSPlaybackService.ACTION_STOP),
        )
    }

    override fun dismiss() {
        stopNativePlayback()
    }

    override fun addListener(eventName: String?) {
        listenerCount++
        registerEventReceiver()
    }

    override fun removeListeners(count: Double) {
        listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)

        if (listenerCount == 0) {
            unregisterEventReceiver()
        }
    }

    override fun invalidate() {
        unregisterEventReceiver()
        super.invalidate()
    }
}
