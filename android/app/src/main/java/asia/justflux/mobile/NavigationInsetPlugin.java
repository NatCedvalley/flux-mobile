package asia.justflux.mobile;

import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Writes the part of the bottom system bar that covers the WebView to
 * `--flux-android-nav-inset` on `<html>`, which global.scss adds to
 * `--ion-safe-area-bottom`.
 *
 * Capacitor's SystemBars injects `--safe-area-inset-bottom` as 0 whenever it
 * thinks the keyboard is open, and on Android 10 and lower it asks that of a
 * copy of the insets that androidx can't answer for: any bottom inset there
 * reads as a keyboard. So with button navigation the bar covered the tab bar
 * (FM-60). This reads the root insets instead, and subtracts what SystemBars
 * already padded the window by (all of it, on a WebView older than 140), so
 * it only adds what is missing.
 */
@CapacitorPlugin(name = "NavigationInset")
public class NavigationInsetPlugin extends Plugin {

    private static final int BARS = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();

    private int lastInset = -1;
    private WebViewListener webViewListener;

    @Override
    public void load() {
        // SystemBars' listener is on the decor view, which runs before this one.
        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (v, insets) -> {
            update(v);
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
    }

    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        // A page load starts with no variable set. Added here, not in load(),
        // because the bridge replaces its listener list after plugins load.
        if (webViewListener == null) {
            webViewListener = new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    lastInset = -1;
                    view.requestApplyInsets();
                }
            };
            getBridge().addWebViewListener(webViewListener);
        }
    }

    private void update(View webView) {
        WindowInsetsCompat root = ViewCompat.getRootWindowInsets(webView);
        if (root == null) {
            return;
        }
        int bottom = 0;
        if (!root.isVisible(WindowInsetsCompat.Type.ime())) {
            int padded = getActivity().getWindow().getDecorView().getPaddingBottom();
            bottom = Math.max(0, root.getInsets(BARS).bottom - padded);
        }
        // Truncated to whole dp, as SystemBars does.
        int inset = (int) (bottom / getActivity().getResources().getDisplayMetrics().density);
        if (inset == lastInset) {
            return;
        }
        lastInset = inset;
        String script = String.format(
            Locale.US,
            "document.documentElement.style.setProperty('--flux-android-nav-inset', '%dpx')",
            inset
        );
        getBridge().getWebView().evaluateJavascript(script, null);
    }
}
