package com.viraille.lofitray;

import android.content.Context;
import android.view.View;
import android.webkit.WebView;

/**
 * WebView qui se dit toujours visible : sinon, dès que l'écran se verrouille ou que l'app passe
 * en arrière-plan, Chromium considère la page cachée et met le lecteur YouTube en pause.
 */
final class LofiWebView extends WebView {
    LofiWebView(Context context) {
        super(context);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(View.VISIBLE);
    }
}
