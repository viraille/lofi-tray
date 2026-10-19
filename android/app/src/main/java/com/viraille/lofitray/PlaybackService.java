package com.viraille.lofitray;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Service de premier plan qui garde l'app en vie pendant la lecture (écran éteint, app fermée) :
 * notification lecture / pause / arrêter, commandes de l'écran de verrouillage et du casque.
 * Le son lui-même vient du lecteur YouTube de la WebView (voir WebHolder).
 */
public final class PlaybackService extends Service {
    private static final String TAG = "LofiTray";
    private static final String ACTION_UPDATE = "com.viraille.lofitray.UPDATE";
    private static final String ACTION_TOGGLE = "com.viraille.lofitray.TOGGLE";
    private static final String ACTION_STOP = "com.viraille.lofitray.STOP";
    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 1;
    private static final long WAKE_LOCK_TIMEOUT = 12 * 60 * 60 * 1000L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static PlaybackService instance;

    private NotificationManager notifications;
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean noisyRegistered;
    private boolean foreground;

    private String id;
    private String title;
    private boolean playing;
    private Bitmap logo;
    private Bitmap art;

    // Casque débranché / Bluetooth coupé : pause, comme toutes les apps de musique.
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            WebHolder.sendCommand("pause");
        }
    };

    /** Appelé (depuis n'importe quel thread) quand l'interface change d'état. */
    static void update(Context context, String id, String title, boolean playing) {
        if (id != null && !id.matches("[A-Za-z0-9_-]{6,20}")) return;
        MAIN.post(() -> {
            if (instance != null) {
                if (id == null) instance.shutdown();
                else instance.apply(id, title, playing);
            } else if (id != null && playing) {
                Intent intent = new Intent(context, PlaybackService.class).setAction(ACTION_UPDATE)
                        .putExtra("id", id).putExtra("title", title).putExtra("playing", true);
                try {
                    context.startForegroundService(intent);
                } catch (RuntimeException e) {
                    Log.w(TAG, "Lecture en arrière-plan impossible à démarrer", e);
                }
            }
        });
    }

    static void stop(Context context) {
        MAIN.post(() -> {
            if (instance != null) instance.shutdown();
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(
                new NotificationChannel(CHANNEL, "Lecture", NotificationManager.IMPORTANCE_LOW));

        wakeLock = getSystemService(PowerManager.class)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LofiTray:playback");
        wakeLock.setReferenceCounted(false);
        wifiLock = ((WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE))
                .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "LofiTray:playback");
        wifiLock.setReferenceCounted(false);

        session = new MediaSession(this, "LofiTray");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                WebHolder.sendCommand("resume");
            }

            @Override
            public void onPause() {
                WebHolder.sendCommand("pause");
            }

            @Override
            public void onStop() {
                stopPlayback();
            }

            @Override
            public void onCustomAction(String action, Bundle extras) {
                if (ACTION_STOP.equals(action)) stopPlayback();
            }
        });
        session.setSessionActivity(openAppIntent());
        session.setActive(true);
        logo = loadLogo();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_UPDATE.equals(action)) {
            apply(intent.getStringExtra("id"), intent.getStringExtra("title"), intent.getBooleanExtra("playing", false));
        } else if (ACTION_TOGGLE.equals(action)) {
            WebHolder.sendCommand("toggle");
        } else if (ACTION_STOP.equals(action)) {
            stopPlayback();
        }
        // Sans interface (app tuée entre-temps), il n'y a rien à jouer.
        if (!foreground || !WebHolder.isAlive()) shutdown();
        return START_NOT_STICKY;
    }

    // App balayée depuis les apps récentes : on continue seulement si la musique joue.
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (!playing) shutdown();
    }

    @Override
    public void onDestroy() {
        releaseResources();
        session.setActive(false);
        session.release();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void apply(String newId, String newTitle, boolean nowPlaying) {
        boolean changed = !newId.equals(id);
        id = newId;
        title = newTitle != null && !newTitle.isEmpty() ? newTitle : "Lofi Girl";
        playing = nowPlaying;
        if (changed) {
            art = null;
            loadArt(newId);
        }
        updateSession();
        Notification notification = buildNotification();
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foreground = true;
        } else {
            notifications.notify(NOTIFICATION_ID, notification);
        }
        if (playing) holdResources();
        else releaseResources();
    }

    private void stopPlayback() {
        WebHolder.sendCommand("pause");
        shutdown();
    }

    private void shutdown() {
        releaseResources();
        playing = false;
        foreground = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    // ---------------------------------------------------------------------------------------------
    // Réveil du téléphone, Wi-Fi, casque
    // (Pas de demande de focus audio ici : la WebView gère le sien, et une deuxième demande
    // venant de la même app la faisait se mettre en pause aussitôt.)
    // ---------------------------------------------------------------------------------------------

    private void holdResources() {
        wakeLock.acquire(WAKE_LOCK_TIMEOUT);
        wifiLock.acquire();
        if (!noisyRegistered) {
            IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(noisyReceiver, filter);
            noisyRegistered = true;
        }
    }

    private void releaseResources() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (noisyRegistered) {
            unregisterReceiver(noisyReceiver);
            noisyRegistered = false;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Notification et écran de verrouillage
    // ---------------------------------------------------------------------------------------------

    private void updateSession() {
        PlaybackState.CustomAction stop = new PlaybackState.CustomAction.Builder(
                ACTION_STOP, "Arrêter", R.drawable.ic_close).build();
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
                .addCustomAction(stop)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
                .build());

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, "Lofi Girl")
                .putLong(MediaMetadata.METADATA_KEY_DURATION, -1);
        Bitmap cover = art != null ? art : logo;
        if (cover != null) metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, cover);
        session.setMetadata(metadata.build());
    }

    private Notification buildNotification() {
        Notification.Builder builder = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_lofi)
                .setContentTitle(title)
                .setContentText(playing ? "Lofi Girl · en direct" : "Lofi Girl · en pause")
                .setLargeIcon(art != null ? art : logo)
                .setContentIntent(openAppIntent())
                .setOngoing(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .addAction(action(playing ? R.drawable.ic_pause : R.drawable.ic_play,
                        playing ? "Pause" : "Lecture", ACTION_TOGGLE))
                .addAction(action(R.drawable.ic_close, "Arrêter", ACTION_STOP))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1));
        if (Build.VERSION.SDK_INT >= 31) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return builder.build();
    }

    private Notification.Action action(int icon, String label, String action) {
        PendingIntent intent = PendingIntent.getService(this, action.hashCode(),
                new Intent(this, PlaybackService.class).setAction(action),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, intent).build();
    }

    private PendingIntent openAppIntent() {
        return PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Bitmap loadLogo() {
        try (InputStream in = getAssets().open("www/assets/lofigirl-logo.png")) {
            return BitmapFactory.decodeStream(in);
        } catch (IOException e) {
            return null;
        }
    }

    // Miniature du live pour la notification et l'écran de verrouillage.
    private void loadArt(String videoId) {
        new Thread(() -> {
            Bitmap bitmap = null;
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg").openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                try (InputStream in = conn.getInputStream()) {
                    bitmap = BitmapFactory.decodeStream(in);
                }
            } catch (IOException e) {
                Log.i(TAG, "Miniature indisponible", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
            Bitmap result = bitmap;
            MAIN.post(() -> {
                if (result == null || !videoId.equals(id) || !foreground) return;
                art = result;
                updateSession();
                notifications.notify(NOTIFICATION_ID, buildNotification());
            });
        }, "lofi-art").start();
    }
}
