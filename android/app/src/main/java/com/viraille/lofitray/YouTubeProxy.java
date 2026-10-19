package com.viraille.lofitray;

import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Fait les requêtes vers YouTube à la place de l'interface (le navigateur les bloquerait :
 * elles viennent d'une autre origine). Mêmes en-têtes que l'app PC.
 *   /yt?url=…                      -> GET
 *   /yt?url=…&body=…&cv=…          -> POST JSON (page suivante de la liste)
 */
final class YouTubeProxy {
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    private YouTubeProxy() {}

    static WebResourceResponse handle(Uri request) {
        String target = request.getQueryParameter("url");
        if (target == null || !target.startsWith("https://www.youtube.com/")) return error(400, "Bad Request");
        String body = request.getQueryParameter("body");
        String clientVersion = request.getQueryParameter("cv");

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(target).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept-Language", "fr-FR,fr;q=0.9");
            // Évite la page de consentement des cookies (cookies non essentiels refusés).
            conn.setRequestProperty("Cookie", "SOCS=CAI");
            if (body != null) {
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Origin", "https://www.youtube.com");
                conn.setRequestProperty("X-YouTube-Client-Name", "1");
                if (clientVersion != null) conn.setRequestProperty("X-YouTube-Client-Version", clientVersion);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }

            int status = conn.getResponseCode();
            if (status >= 300 && status < 400) return error(502, "Bad Gateway");
            InputStream in = status < 400 ? conn.getInputStream() : conn.getErrorStream();
            byte[] data = in != null ? readAll(in) : new byte[0];
            String mime = body != null ? "application/json" : "text/html";
            return new WebResourceResponse(mime, "utf-8", status, status < 400 ? "OK" : "Error",
                    Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(data));
        } catch (IOException e) {
            return error(502, "Bad Gateway");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int n;
            while ((n = input.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    private static WebResourceResponse error(int status, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", status, reason, null,
                new ByteArrayInputStream(new byte[0]));
    }
}
