package asia.justflux.mobile;

import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Whether notifications are switched on for the app in Android's settings.
 * The messaging plugin answers "granted" on Android 12 and lower without
 * checking, so PushService asks this too.
 */
@CapacitorPlugin(name = "NotificationState")
public class NotificationStatePlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }
}
