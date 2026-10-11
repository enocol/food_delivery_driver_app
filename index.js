import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';

import App from './App';
// Registers the background location task (keep-alive) at startup, including when
// the OS relaunches the app in the background for a location event.
import './utils/locationTask';

// Foreground presentation: always show a heads-up banner + sound (for every
// notification, offers and otherwise) so a driver with the app open still
// notices. For a delivery offer the in-app request modal (driven by the socket)
// shows alongside it. Background / killed notifications are shown by the OS.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
