/**
 * PhotoCapture
 * Camera modal built on expo-camera. Returns a small JPEG data-URI
 * (base64, low quality) that can be stored alongside a Firestore record —
 * the workshop manager sees the same photo on the shared collection.
 */

import { View, Text, TouchableOpacity, Modal, Pressable, Image } from "react-native";
import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";

const MAX_PHOTO_LENGTH = 200000;

export function PhotoCapture({
  visible,
  onClose,
  onCapture,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (dataUri: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView | null>(null);
  const [busy, setBusy] = useState(false);

  const take = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    try {
      const shot = await camRef.current.takePictureAsync({
        quality: 0.15,
        base64: true,
      });
      if (shot?.base64) {
        const uri = "data:image/jpeg;base64," + shot.base64;
        if (uri.length > MAX_PHOTO_LENGTH) {
          onCapture("");
          onClose();
          return;
        }
        onCapture(uri);
        onClose();
      }
    } catch (e) {
      /* camera error — just close */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {!permission?.granted ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center", marginBottom: 16 }}>
              📷 نحتاج إذن الكاميرا لالتقاط صورة القطعة / المشكلة
            </Text>
            <TouchableOpacity
              onPress={() => requestPermission()}
              style={{ backgroundColor: "#2DD4BF", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}
            >
              <Text style={{ color: "#0B111E", fontWeight: "900" }}>منح الإذن</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            ref={camRef}
            style={{ flex: 1 }}
            facing="back"
            ratio="4:3"
          >
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.15)" }} onPress={onClose}>
              <View style={{ flex: 1, justifyContent: "space-between", padding: 20 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>📷 التقط صورة</Text>
                  <TouchableOpacity onPress={onClose} style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>إغلاق ✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: "center", marginBottom: 30 }}>
                  <TouchableOpacity
                    onPress={take}
                    disabled={busy}
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 38,
                      borderWidth: 5,
                      borderColor: "#fff",
                      backgroundColor: "rgba(45,212,191,0.4)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: "#2DD4BF" }} />
                  </TouchableOpacity>
                  <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 8 }}>{busy ? "جارٍ الالتقاط..." : "اضغط لالتقاط الصورة"}</Text>
                </View>
              </View>
            </Pressable>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

/** Tiny inline preview used on form/cards. */
export function PhotoThumb({ photo, size = 64 }: { photo?: string; size?: number }) {
  if (!photo) return null;
  return (
    <Image
      source={{ uri: photo }}
      style={{ width: size, height: size, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
      resizeMode="cover"
    />
  );
}
