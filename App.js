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

  // Connect socket on login; disconnect on logout.
  // The socket fetches a fresh Firebase ID token itself on every
  // (re)connection via its auth callback, so no token is passed here.
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }
    connectSocket();
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
