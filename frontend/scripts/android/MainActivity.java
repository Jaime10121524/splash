package br.com.ahritech.splash;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.CookieManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Mantem o topo e a base fora das barras do Android.
 * Insets Android sao pixels fisicos, NAO devem ser injetados como CSS pixels:
 * essa conversao incorreta criou uma margem inferior enorme em aparelhos Samsung.
 * O rodape HTML termina no limite da WebView, imediatamente acima da barra
 * de navegacao nativa. Cookies HTTPS para a sessao do Shield continuam ativos.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().getDecorView().setBackgroundColor(Color.rgb(38, 38, 38));
        getWindow().setNavigationBarColor(Color.rgb(38, 38, 38));
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightNavigationBars(false);

        View content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
                Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                );
                // O Android aplica o padding em unidades nativas, sem dobrar
                // a margem com env(safe-area-inset-bottom) nem com devicePixelRatio.
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
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
