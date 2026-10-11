import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';

import App from './App';

// Delivery offers in the foreground are shown via the in-app request modal
// (delivered over the socket), so we suppress a duplicate system banner there.
// Background / killed offers are displayed by the OS automatically.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
