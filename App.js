import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { connectSocket, disconnectSocket } from "./config/socket";
import HomeScreen from "./screens/HomeScreen";
import EarningsScreen from "./screens/EarningsScreen";
import InboxScreen from "./screens/InboxScreen";
import ProfileScreen from "./screens/ProfileScreen";
import DiscoverScreen from "./screens/DiscoverScreen";
import AuthScreen from "./screens/AuthScreen";
import { OnlineProvider } from "./context/OnlineContext";

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
              backgroundColor: "#1a1a1a",
              borderTopColor: "#2e2e2e",
              borderTopWidth: 1,
            },
            tabBarActiveTintColor: "#ffffff",
            tabBarInactiveTintColor: "#666666",
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
            name="Discover"
            component={DiscoverScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="compass-outline" size={size} color={color} />
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
            name="Menu"
            component={ProfileScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="menu-outline" size={size} color={color} />
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

  // Connect socket on login; disconnect on logout
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }
    user.getIdToken().then((token) => connectSocket(token));
  }, [user]);

  // Reconnect when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && user) {
        user.getIdToken(true).then((token) => connectSocket(token));
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
          backgroundColor: "#fff",
        }}
      >
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  if (!user) return <AuthScreen />;
  return <MainNavigator />;
}
