package com.rajarsheechatterjee.NativeTTSMediaControl

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*
import java.net.URL

class NativeTTSMediaControl(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val context: Context = reactContext
    private var mediaSession: MediaSessionCompat? = null
    private var isInitialized = false
    
    companion object {
        private const val CHANNEL_ID = "tts_audio_channel"
        private const val NOTIFICATION_ID = 777
        private const val ACTION_PLAY_PAUSE = "com.rajarsheechatterjee.ACTION_PLAY_PAUSE"
        private const val ACTION_STOP = "com.rajarsheechatterjee.ACTION_STOP"
        private const val ACTION_NEXT = "com.rajarsheechatterjee.ACTION_NEXT"
        private const val ACTION_PREV = "com.rajarsheechatterjee.ACTION_PREV"
    }

    override fun getName(): String = "NativeTTSMediaControl"

    @ReactMethod
    fun setupMediaNotification(promise: Promise) {
        try {
            createNotificationChannel()
            
            val packageContext = context.packageManager.getContextForPackage(context.packageName)
            val className = "com.rajarsheechatterjee.MainActivity"
            
            val intent = Intent(packageContext, Class.forName(className)).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("from_notification", true)
            }
            
            val pendingIntent = PendingIntent.getActivity(
                packageContext,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            mediaSession = MediaSessionCompat(context, "TTS_MediaSession").apply {
                setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS)
                isActive = true
            }

            isInitialized = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETUP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateTTSPlaybackState(title: String, author: String, coverUri: String?, isPlaying: Boolean, promise: Promise?) {
        if (!isInitialized) {
            promise?.reject("NOT_INITIALIZED", "Media session not initialized")
            return
        }

        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Load cover image
            var coverBitmap: Bitmap? = null
            if (!coverUri.isNullOrBlank()) {
                try {
                    val url = if (coverUri.startsWith("http")) URL(coverUri) else null
                    if (url != null) {
                        coverBitmap = BitmapFactory.decodeStream(url.openConnection().getInputStream())
                    } else {
                        coverBitmap = BitmapFactory.decodeFile(coverUri.replace("file://", ""))
                    }
                } catch (e: Exception) {
                    // Use default icon if cover fails
                }
            }

            // Create actions
            val playPauseIntent = buildPendingIntent(if (isPlaying) ACTION_STOP else ACTION_PLAY_PAUSE)
            val stopIntent = buildPendingIntent(ACTION_STOP)
            val nextIntent = buildPendingIntent(ACTION_NEXT)
            val prevIntent = buildPendingIntent(ACTION_PREV)

            val playPauseAction = NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_pause,
                if (isPlaying) "Pause" else "Play",
                playPauseIntent
            ).build()

            val stopAction = NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_pause,
                "Stop",
                stopIntent
            ).build()

            val nextAction = NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_next,
                "Next",
                nextIntent
            ).build()

            val prevAction = NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_previous,
                "Previous",
                prevIntent
            ).build()
            
            val rewindAction = NotificationCompat.Action.Builder(
                android.R.drawable.ic_media_rew,
                "Rewind",
                prevIntent
            ).build()

            // Build notification with persistent flags
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(author)
                .setSmallIcon(context.applicationInfo.icon)
                .setLargeIcon(coverBitmap)
                .setContentIntent(getContentIntent())
                .setDeleteIntent(buildPendingIntent(ACTION_STOP))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)           // Makes it harder to dismiss
                .setAutoCancel(false)       // Prevents swipe-to-dismiss
                .addAction(prevAction)
                .addAction(rewindAction)
                .addAction(playPauseAction)
                .addAction(nextAction)
                .setStyle(androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession?.sessionToken)
                    .setShowActionsInCompactView(1, 2, 3))
                .build()

            notificationManager.notify(NOTIFICATION_ID, notification)

            // Update media session state
            updateMediaSessionState(isPlaying)

            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("UPDATE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun removeMediaNotification(promise: Promise?) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(NOTIFICATION_ID)
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("REMOVE_ERROR", e.message)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TTS Audio Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Controls for TTS audio playback"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            
            val notificationManager = context.getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildPendingIntent(action: String): PendingIntent {
        val intent = Intent(action).setPackage(context.packageName)
        return PendingIntent.getBroadcast(
            context,
            action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun getContentIntent(): PendingIntent {
        val packageContext = context.packageManager.getContextForPackage(context.packageName)
        val intent = Intent(packageContext, Class.forName("com.rajarsheechatterjee.MainActivity")).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("from_notification", true)
        }
        return PendingIntent.getActivity(
            packageContext,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun updateMediaSessionState(isPlaying: Boolean) {
        mediaSession?.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setState(
                    if (isPlaying) PlaybackStateCompat.STATE_PLAYING 
                    else PlaybackStateCompat.STATE_PAUSED,
                    PlaybackStateCompat.POSITION_UNKNOWN,
                    1.0f
                )
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_STOP or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                )
                .build()
        )
    }

    override fun invalidate() {
        mediaSession?.release()
        mediaSession = null
        isInitialized = false
        super.invalidate()
    }
}