package com.viraille.lofitray;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

/** Fonctions Java appelées par l'interface (objet "LofiAndroid" côté JavaScript). */
final class LofiBridge {
    private final Context app;

    LofiBridge(Context app) {
        this.app = app;
    }

    @JavascriptInterface
    public String versionName() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public boolean dataSaver() {
        return WebHolder.isDataSaverOn(app);
    }

    @JavascriptInterface
    public void setDataSaver(boolean enabled) {
        WebHolder.setDataSaver(app, enabled);
    }

    /** Appelé à chaque changement : live choisi, lecture, pause. */
    @JavascriptInterface
    public void reportState(String json) {
        try {
            JSONObject state = new JSONObject(json);
            String id = state.isNull("id") ? null : state.optString("id");
            String title = state.isNull("title") ? null : state.optString("title");
            PlaybackService.update(app, id, title, state.optBoolean("playing"));
        } catch (JSONException ignored) {
            // état illisible : on ne change rien
        }
    }

    @JavascriptInterface
    public void moveToBack() {
        MainActivity.moveToBack();
    }

    @JavascriptInterface
    public void quit() {
        MainActivity.quitApp(app);
    }

    @JavascriptInterface
    public void openExternal(String url) {
        open(app, url);
    }

    static void open(Context context, String url) {
        if (url == null || !url.startsWith("https://")) return;
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // aucune app pour ouvrir le lien
        }
    }
}
