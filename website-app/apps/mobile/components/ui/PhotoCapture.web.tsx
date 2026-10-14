/**
 * PhotoCapture.web — web/desktop fallback (expo-camera has no web camera
 * surface, and importing it throws on the desktop build).
 *
 * Same contract as the native version: returns a small JPEG data-URI through
 * `onCapture`. Uses the browser's file picker with `capture` so phones/tablets
 * still open the camera, and a file input on desktop.
 */
import { useRef } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

const MAX_PHOTO_LENGTH = 200000;

async function fileToDataUri(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  // Keep the payload small — the same cap the native capture uses.
  if (raw.length <= MAX_PHOTO_LENGTH) return raw;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = raw;
  });
  const scale = Math.min(1, Math.sqrt(MAX_PHOTO_LENGTH / raw.length));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

export function PhotoCapture({
  visible,
  onClose,
  onCapture,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (dataUri: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-900 px-5 pt-16">
        <Text className="text-white text-lg font-bold mb-2">📷 التقاط صورة</Text>
        <Text className="text-slate-300 text-sm mb-6">
          نسخة الويب: اختار صورة من الجهاز (على الموبايل هيفتح الكاميرا).
        </Text>
        <TouchableOpacity
          onPress={() => inputRef.current?.click()}
          className="bg-orange-500 rounded-2xl py-5 items-center mb-3"
        >
          <Text className="text-white font-bold text-lg">اختيار / التقاط صورة</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          className="bg-white/10 rounded-2xl py-4 items-center"
        >
          <Text className="text-white font-bold">إلغاء</Text>
        </TouchableOpacity>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              onCapture(await fileToDataUri(file));
              onClose();
            } catch {
              /* unreadable file — leave the modal open so the user retries */
            }
          }}
        />
      </View>
    </Modal>
  );
}
