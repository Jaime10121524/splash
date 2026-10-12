package br.com.ahritech.splash;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

/**
 * HTML local https://localhost, API remota HTTPS com sessao CodeIgniter.
 * O Android WebView bloqueia cookies de terceiros por padrao, impossibilitando
 * persistir a sessao ao chamar a API fora da origem local do Capacitor.
 * Esta Activity e usada exclusivamente no APK SPLASH, com HTTPS e CSRF.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            CookieManager manager = CookieManager.getInstance();
            manager.setAcceptCookie(true);
            manager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        }
    }
}
