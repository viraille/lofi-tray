package com.viraille.lofitray;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;

import java.lang.ref.WeakReference;

public final class MainActivity extends Activity {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {0xFF1A1433, 0xFF120E24}));
        if (Build.VERSION.SDK_INT >= 35) {
            // Android 15+ affiche l'app sous les barres système : on garde l'interface à l'écart
            // (et au-dessus du clavier quand on tape une recherche).
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        root.addView(WebHolder.attach(this), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // La notification de lecture (pause / arrêter) a besoin de cette autorisation depuis Android 13.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        WebHolder.notifyShown();
    }

    // Retour = l'app passe en arrière-plan, la musique continue.
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebHolder.handleBack(this);
    }

    @Override
    protected void onDestroy() {
        if (current.get() == this) WebHolder.detach();
        super.onDestroy();
    }

    static void moveToBack() {
        MAIN.post(() -> {
            MainActivity activity = current.get();
            if (activity != null) activity.moveTaskToBack(true);
        });
    }

    static void quitApp(Context app) {
        MAIN.post(() -> {
            PlaybackService.stop(app);
            WebHolder.destroy();
            MainActivity activity = current.get();
            if (activity != null) activity.finishAndRemoveTask();
        });
    }
}
