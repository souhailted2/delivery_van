import React, { useEffect, useRef, useState } from "react";
import {
  Animated, PanResponder, StyleSheet, View,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";

const PEEK_VISIBLE = 184;   // how much of the sheet shows in its resting (peek) state
const EXPAND_RATIO = 0.13;  // expanded top sits at 13% of the available height

interface Props {
  /** Draggable header (grabber + title + segment). Owns the pan gesture. */
  header: React.ReactNode;
  /** Scrollable body (the list). Scrolls independently of the drag. */
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A two-snap bottom sheet (peek ⇄ expanded) built on RN core PanResponder +
 * Animated — no Reanimated/gesture-handler dependency. The drag lives on the
 * `header` only, so an inner FlatList scrolls without fighting the gesture.
 *
 * The sheet is the signature interaction of the "card-deck + sheet" dashboard:
 * the activity feed rests as a peeking layer and pulls up over the cockpit.
 */
export function DraggableSheet({ header, children, style }: Props) {
  const c = useTheme().color;
  const [h, setH] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;

  // Snap targets (kept in refs so the PanResponder closure always reads fresh).
  const expandedY = useRef(0);
  const peekY = useRef(0);
  const currentY = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => { currentY.current = value; });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const onLayout = (e: LayoutChangeEvent) => {
    const nh = Math.round(e.nativeEvent.layout.height);
    if (!nh || nh === h) return;
    setH(nh);
    const ey = Math.round(nh * EXPAND_RATIO);
    const py = Math.max(ey, nh - PEEK_VISIBLE);
    expandedY.current = ey;
    peekY.current = py;
    translateY.setValue(py);          // rest at peek
    currentY.current = py;
  };

  const snapTo = (to: number) =>
    Animated.spring(translateY, { toValue: to, useNativeDriver: true, bounciness: 3, speed: 16 }).start();

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => { startY.current = currentY.current; },
      onPanResponderMove: (_, g) => {
        const next = Math.min(Math.max(startY.current + g.dy, expandedY.current), peekY.current);
        translateY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const mid = (expandedY.current + peekY.current) / 2;
        const goExpand = g.vy < -0.5 || (g.vy <= 0.5 && currentY.current < mid);
        snapTo(goExpand ? expandedY.current : peekY.current);
      },
    })
  ).current;

  return (
    <View style={styles.fill} onLayout={onLayout} pointerEvents="box-none">
      {h > 0 && (
        <Animated.View
          style={[
            styles.sheet,
            { height: h, backgroundColor: c.glassStrong, borderColor: c.glassBorder, transform: [{ translateY }] },
            style,
          ]}
        >
          <View {...pan.panHandlers} style={styles.headerWrap}>
            <View style={[styles.grabber, { backgroundColor: c.textFaint }]} />
            {header}
          </View>
          <View style={styles.body}>{children}</View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: "absolute", left: 0, right: 0, top: 0,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, borderBottomWidth: 0, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 20,
  },
  headerWrap: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 4 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, opacity: 0.6, marginBottom: 10 },
  body: { flex: 1 },
});
