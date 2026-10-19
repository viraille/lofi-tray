package com.viraille.lofitray;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.MutableContextWrapper;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/**
 * Garde une seule WebView pour toute l'app : elle continue de vivre (et de jouer la musique)
 * quand l'écran de l'app est fermé, et se raccroche à l'écran quand on le rouvre.
 */
final class WebHolder {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String PREFS = "lofi";
    private static final String PREF_DATA_SAVER = "dataSaver";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WebView webView;
    private static MutableContextWrapper context;
    private static ScriptHandler qualityScript;

    private WebHolder() {}

    static WebView attach(Activity activity) {
        if (webView == null) {
            context = new MutableContextWrapper(activity);
            webView = create(context, activity.getApplicationContext());
            applyDataSaver(isDataSaverOn(activity));
            webView.loadUrl(ORIGIN + "/index.html");
        } else {
            context.setBaseContext(activity);
        }
        removeFromParent();
        return webView;
    }

    static void detach() {
        if (webView == null) return;
        removeFromParent();
        context.setBaseContext(context.getApplicationContext());
    }

    static void destroy() {
        if (webView == null) return;
        detach();
        webView.destroy();
        webView = null;
        context = null;
        qualityScript = null;
    }

    static boolean isDataSaverOn(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREF_DATA_SAVER, true);
    }

    static void setDataSaver(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREF_DATA_SAVER, enabled).apply();
        MAIN.post(() -> applyDataSaver(enabled));
    }

    /**
     * Économie de données : le lecteur YouTube lit sa qualité préférée dans son localStorage
     * ("yt-player-quality"). On l'y écrit (144p) avant qu'il démarre, à chaque nouveau lecteur.
     */
    private static void applyDataSaver(boolean enabled) {
        if (webView == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        if (qualityScript != null) qualityScript.remove();
        String script = enabled
                ? "try{var n=Date.now();localStorage.setItem('yt-player-quality',JSON.stringify("
                        + "{data:JSON.stringify({quality:144,previousQuality:144}),expiration:n+31536e6,creation:n}))}catch(e){}"
                : "try{localStorage.removeItem('yt-player-quality')}catch(e){}";
        qualityScript = WebViewCompat.addDocumentStartJavaScript(webView, script,
                Collections.singleton("https://www.youtube-nocookie.com"));
    }

    static boolean isAlive() {
        return webView != null;
    }

    /** Envoie une commande à l'interface : toggle, pause, resume. */
    static void sendCommand(String name) {
        runJs("window.__lofiCommand && window.__lofiCommand('" + name + "')");
    }

    static void notifyShown() {
        runJs("window.__lofiShown && window.__lofiShown()");
    }

    /** Bouton retour : l'interface ferme d'abord les réglages / la recherche, sinon on passe en arrière-plan. */
    static void handleBack(Activity activity) {
        if (webView == null) {
            activity.moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript("!!(window.__lofiBack && window.__lofiBack())", handled -> {
            if (!"true".equals(handled)) activity.moveTaskToBack(true);
        });
    }

    private static void runJs(String js) {
        MAIN.post(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    private static void removeFromParent() {
        ViewParent parent = webView.getParent();
        if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(webView);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private static WebView create(Context ctx, Context app) {
        WebView view = new LofiWebView(ctx);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        view.setBackgroundColor(0xFF15112A);
        view.setWebViewClient(new LofiWebViewClient(app));
        view.addJavascriptInterface(new LofiBridge(app), "LofiAndroid");
        return view;
    }
}
