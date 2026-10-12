package br.com.ahritech.splash;

import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * WebView ocupa ate a borda inferior: o rodape React usa o inset Android
 * para preencher o fundo da barra de gestos sem criar faixa branca vazia.
 * Barra superior permanece protegida pelo padding nativo.
 */
public class MainActivity extends BridgeActivity {
    private volatile int navigationInsetBottom = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public int getBottomInset() {
                    return navigationInsetBottom;
                }
            }, "SplashSafeArea");
            CookieManager manager = CookieManager.getInstance();
            manager.setAcceptCookie(true);
            manager.setAcceptThirdPartyCookies(webView, true);
        }
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
                Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() |
                    WindowInsetsCompat.Type.displayCutout()
                );
                navigationInsetBottom = bars.bottom;
                // Nao reservar duas vezes o espaco inferior: o rodape web
                // desenha seu proprio fundo ate a barra de navegacao.
                view.setPadding(bars.left, bars.top, bars.right, 0);
                if (webView != null) {
                    webView.evaluateJavascript(
                        "document.documentElement.style.setProperty('--splash-bottom-safe','" +
                        bars.bottom + "px')", null
                    );
                }
                return insets;
            });
            ViewCompat.requestApplyInsets(content);
        }
    }
}
