package asia.justflux.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins have to be registered before the bridge starts.
        registerPlugin(NotificationStatePlugin.class);
        registerPlugin(NavigationInsetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
