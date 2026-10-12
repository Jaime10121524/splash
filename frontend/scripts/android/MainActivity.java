package br.com.ahritech.splash;

import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * SPLASH Android:
 * - O WebView ocupa somente a area visivel, respeitando status bar, recorte
 *   de tela e barra de navegacao, inclusive Android 15/16 (edge-to-edge).
 * - Cookies de terceiros aceitos para a API remota HTTPS do SPLASH.
 *   O backend exige CSRF e restringe CORS a https://localhost.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                );
                // O padding e aplicado ao container nativo, nao ao CSS:
                // menus, modais, inputs e barra inferior ficam fora das barras do Android.
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(content);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            CookieManager manager = CookieManager.getInstance();
            manager.setAcceptCookie(true);
            manager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        }
    }
}
