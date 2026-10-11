import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "@react-native-firebase/auth";
import { auth } from "./config/firebase";
import {
  connectSocket,
  disconnectSocket,
  isSocketConnected,
} from "./config/socket";
import HomeScreen from "./screens/HomeScreen";
import EarningsScreen from "./screens/EarningsScreen";
import InboxScreen from "./screens/InboxScreen";
import ProfileScreen from "./screens/ProfileScreen";
import AuthScreen from "./screens/AuthScreen";
import { OnlineProvider } from "./context/OnlineContext";
import * as colors from "./utils/colors";
import * as Notifications from "expo-notifications";
import {
  startPushRegistration,
  stopPushRegistration,
} from "./utils/pushRegistration";
import { getCurrentOffer } from "./utils/orders";
import { emitOffer } from "./utils/offerBridge";
import { ensureDriverSession } from "./utils/driverSession";

const Tab = createBottomTabNavigator();

function MainNavigator() {
  return (
    <OnlineProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
              borderTopWidth: 1,
            },
            tabBarActiveTintColor: colors.white,
            tabBarInactiveTintColor: colors.textFaint,
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: "600",
            },
          }}
        >
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Earnings"
            component={EarningsScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="cash-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Inbox"
            component={InboxScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="chatbubble-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="person-outline" size={size} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </OnlineProvider>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  // Ensure the backend has a drivers row for this account, then connect the
  // socket. The socket server rejects unknown drivers ("Driver account not
  // found"), and that row is only created by /api/drivers/session — so we sync
  // it here on every authenticated start (fresh or persisted login), before the
  // handshake, rather than only on OTP verify. The socket still fetches its own
  // fresh ID token on each (re)connection via its auth callback.
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }
    let cancelled = false;
    (async () => {
      await ensureDriverSession();
      if (!cancelled) connectSocket();
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Reconnect when app comes back to foreground if the socket dropped.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && user && !isSocketConnected()) {
        connectSocket();
      }
    });
    return () => sub.remove();
  }, [user]);

  // Register this device for delivery-offer push notifications while signed in.
  useEffect(() => {
    if (!user) {
      stopPushRegistration();
      return;
    }
    startPushRegistration();
  }, [user]);

  // Open the delivery request when the driver taps an offer notification
  // (backgrounded or cold start). The modal lives in HomeScreen, so we fetch the
  // current offer and hand it over via the offer bridge.
  useEffect(() => {
    if (!user) return;

    async function handleOfferResponse(response) {
      const data = response?.notification?.request?.content?.data;
      if (data?.type !== "delivery_offered") return;
      const offer = await getCurrentOffer();
      if (offer) emitOffer(offer);
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleOfferResponse(response);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(
      handleOfferResponse,
    );
    return () => sub.remove();
  }, [user]);

  if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.white,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <AuthScreen />;
  return <MainNavigator />;
}
