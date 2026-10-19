package com.viraille.lofitray;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Sert l'interface depuis les assets sur https://appassets.androidplatform.net (une vraie
 * origine https, exigée par le lecteur YouTube) et relaie les requêtes /yt vers YouTube.
 */
final class LofiWebViewClient extends WebViewClient {
    private static final String HOST = "appassets.androidplatform.net";

    private final Context app;

    LofiWebViewClient(Context app) {
        this.app = app;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!HOST.equals(url.getHost())) return null;
        String path = url.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        if (path.equals("/yt")) return YouTubeProxy.handle(url);
        try {
            InputStream in = app.getAssets().open("www" + path);
            return new WebResourceResponse(mimeType(path), "utf-8", in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null,
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    // Les liens (logo YouTube du lecteur, "Ouvrir sur YouTube"…) s'ouvrent dans l'app YouTube ou le navigateur.
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (HOST.equals(url.getHost()) || !request.isForMainFrame()) return false;
        LofiBridge.open(app, url.toString());
        return true;
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }
}
