import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { motion } from "@/constants/tokens";

interface Props extends Omit<PressableProps, "style"> {
  /** Target scale while pressed. Subtle by design (Emil: 0.95–0.98). */
  scaleTo?: number;
  /** Fire a light haptic on press-in. Use for primary/confirming taps only. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion = v));
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => (reduceMotion = v));

/**
 * The motion foundation for every tappable surface.
 *
 * Press feedback within ~16ms via a native-driver spring on `transform` only
 * (GPU, never touches layout). This is the single detail that makes the UI feel
 * like it's "listening" — applied once, inherited everywhere.
 */
export function PressableScale({
  scaleTo = 0.97,
  haptic = false,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: reduceMotion ? 1 : to,
      useNativeDriver: true,
      speed: motion.press.speed,
      bounciness: motion.press.bounciness,
    }).start();

  const handleIn = (e: GestureResponderEvent) => {
    if (!disabled) {
      animate(scaleTo);
      if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPressIn?.(e);
  };

  const handleOut = (e: GestureResponderEvent) => {
    animate(1);
    onPressOut?.(e);
  };

  return (
    <Pressable onPressIn={handleIn} onPressOut={handleOut} disabled={disabled} {...rest}>
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}
