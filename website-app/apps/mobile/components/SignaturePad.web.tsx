/**
 * SignaturePad.web — web/desktop fallback.
 *
 * `react-native-signature-canvas` renders a WebView, which does not exist on the
 * web build, so importing it took the whole screen down. This uses a plain HTML
 * canvas with the same contract: `onOK(dataUrl)` on confirm, `onEmpty` when the
 * pad is cleared, and the same imperative handle.
 */
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

export interface SignaturePadHandle {
  readSignature: () => void;
  clearSignature: () => void;
}

interface SignaturePadProps {
  onOK: (dataUrl: string) => void;
  onEmpty?: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ onOK, onEmpty }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const [dirty, setDirty] = useState(false);

    const context = () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.getContext("2d");
    };

    const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const ctx = context();
      if (!ctx) return;
      drawing.current = true;
      const { x, y } = position(event);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0F172A";
    };

    const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      const ctx = context();
      if (!ctx) return;
      const { x, y } = position(event);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!dirty) setDirty(true);
    };

    const end = () => {
      drawing.current = false;
    };

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = context();
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setDirty(false);
      onEmpty?.();
    }, [onEmpty]);

    useImperativeHandle(ref, () => ({
      readSignature: () => {
        const canvas = canvasRef.current;
        if (canvas && dirty) onOK(canvas.toDataURL("image/png"));
      },
      clearSignature: clear,
    }));

    return (
      <View className="rounded-2xl overflow-hidden border-2 border-slate-300 bg-white">
        <View className="h-64 w-full">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <canvas
            ref={canvasRef as any}
            width={900}
            height={420}
            style={{ width: "100%", height: "100%", touchAction: "none", display: "block" }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
        </View>
        <View className="flex-row gap-2 p-2 border-t border-slate-200">
          <TouchableOpacity onPress={clear} className="flex-1 rounded-xl py-2 items-center bg-slate-100">
            <Text className="text-slate-700 font-bold text-sm">مسح</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const canvas = canvasRef.current;
              if (canvas && dirty) onOK(canvas.toDataURL("image/png"));
            }}
            className="flex-1 rounded-xl py-2 items-center bg-orange-500"
          >
            <Text className="text-white font-bold text-sm">تأكيد التوقيع</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
