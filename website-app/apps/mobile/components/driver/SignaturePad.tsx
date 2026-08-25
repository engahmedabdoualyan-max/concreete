/**
 * SignaturePad — dependency-free signature capture for the delivery challan.
 * Stores strokes as normalized point arrays so the web challan can render them
 * as an SVG path. No native modules needed (pure PanResponder + Views).
 */

import { useState, useRef, useEffect } from "react";
import { View, Text, PanResponder, LayoutChangeEvent } from "react-native";

export type Stroke = Array<[number, number]>; // normalized 0..1

export function serializeStrokes(strokes: Stroke[]): string {
  return JSON.stringify(strokes);
}

export function parseStrokes(raw?: string): Stroke[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

interface Props {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  height?: number;
}

export default function SignaturePad({ strokes, onChange, height = 190 }: Props) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const current = useRef<Stroke>([]);
  const last = useRef<[number, number] | null>(null);

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const commit = () => {
    const merged = [...strokesRef.current, current.current];
    changeRef.current(merged);
    current.current = [];
    last.current = null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        current.current = [[locationX / size.w, locationY / size.h]];
        last.current = [locationX, locationY];
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const l = last.current;
        if (l && Math.hypot(locationX - l[0], locationY - l[1]) < 2.5) return;
        last.current = [locationX, locationY];
        current.current.push([locationX / size.w, locationY / size.h]);
        changeRef.current([...strokesRef.current, current.current]);
      },
      onPanResponderRelease: commit,
      onPanResponderTerminate: commit,
    })
  ).current;

  useEffect(() => {
    changeRef.current([...strokesRef.current]);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ w: width || 1, h: h || 1 });
  };

  // Flatten strokes into line segments (each a rotated View).
  const segments: Array<{
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rot: string;
  }> = [];
  strokes.forEach((stroke, si) => {
    for (let i = 0; i < stroke.length - 1; i++) {
      const x1 = stroke[i][0] * size.w;
      const y1 = stroke[i][1] * size.h;
      const x2 = stroke[i + 1][0] * size.w;
      const y2 = stroke[i + 1][1] * size.h;
      const w = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      segments.push({
        key: `${si}-${i}`,
        x: midX - w / 2,
        y: midY - 1.6,
        w,
        h: 3.2,
        rot: `${angle}rad`,
      });
    }
  });

  return (
    <View>
      <View
        {...pan.panHandlers}
        onLayout={onLayout}
        style={{
          height,
          width: "100%",
          borderWidth: 2,
          borderColor: "#CBD5E1",
          borderRadius: 16,
          backgroundColor: "#F8FAFC",
          overflow: "hidden",
        }}
      >
        {segments.map((s) => (
          <View
            key={s.key}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              width: s.w,
              height: s.h,
              backgroundColor: "#0F172A",
              borderRadius: 2,
              transform: [{ rotate: s.rot }],
            }}
          />
        ))}
      </View>
      <View className="flex-row justify-between items-center mt-1 px-1">
        <Text className="text-slate-400 text-xs">✍️ وقع هنا</Text>
        <Text
          onPress={() => changeRef.current([])}
          className="text-red-500 text-xs font-bold px-2 py-1"
        >
          مسح
        </Text>
      </View>
    </View>
  );
}
