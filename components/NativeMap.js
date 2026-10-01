import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { AppleMaps, GoogleMaps } from "expo-maps";

function zoomFromLatitudeDelta(latitudeDelta = 0.05) {
  return Math.max(2, Math.min(20, Math.log2(360 / latitudeDelta)));
}

function cameraFromRegion(region) {
  return {
    coordinates: {
      latitude: region.latitude,
      longitude: region.longitude,
    },
    zoom: zoomFromLatitudeDelta(region.latitudeDelta),
  };
}

const NativeMap = forwardRef(function NativeMap(
  {
    initialRegion,
    style,
    showsUserLocation = false,
    interactive = true,
  },
  forwardedRef,
) {
  const nativeMapRef = useRef(null);

  useImperativeHandle(
    forwardedRef,
    () => ({
      animateToRegion(region, duration = 0) {
        const camera = cameraFromRegion(region);
        if (Platform.OS === "android") camera.duration = duration;
        nativeMapRef.current?.setCameraPosition(camera);
      },
    }),
    [],
  );

  if (Platform.OS === "ios") {
    return (
      <AppleMaps.View
        ref={nativeMapRef}
        style={[StyleSheet.absoluteFill, style]}
        cameraPosition={cameraFromRegion(initialRegion)}
        properties={{ isMyLocationEnabled: showsUserLocation }}
        uiSettings={{
          compassEnabled: interactive,
          scaleBarEnabled: interactive,
          togglePitchEnabled: interactive,
        }}
        pointerEvents={interactive ? "auto" : "none"}
      />
    );
  }

  if (Platform.OS === "android") {
    return (
      <GoogleMaps.View
        ref={nativeMapRef}
        style={[StyleSheet.absoluteFill, style]}
        cameraPosition={cameraFromRegion(initialRegion)}
        properties={{ isMyLocationEnabled: showsUserLocation }}
        uiSettings={{
          compassEnabled: interactive,
          mapToolbarEnabled: interactive,
          scaleBarEnabled: interactive,
          scrollGesturesEnabled: interactive,
          rotationGesturesEnabled: interactive,
          tiltGesturesEnabled: interactive,
          zoomControlsEnabled: false,
          zoomGesturesEnabled: interactive,
        }}
        pointerEvents={interactive ? "auto" : "none"}
      />
    );
  }

  return <View style={[StyleSheet.absoluteFill, style]} />;
});

export default NativeMap;
