/**
 * BackgroundLocationDisclosure
 * ─────────────────────────────────────────────────────────────────────────────
 * Prominent, multilingual disclosure dialog shown to DRIVER users BEFORE the
 * native ACCESS_BACKGROUND_LOCATION prompt (Google Play prominent-disclosure
 * requirement). Renders in the selected language (Arabic / English / Urdu),
 * with RTL layout for ar/ur.
 *
 * Usage:
 *   const [visible, setVisible] = useState(true);
 *   <BackgroundLocationDisclosure
 *     visible={visible}
 *     onAccept={() => { setVisible(false); geolocation.startTracking(...) }}
 *     onDecline={() => setVisible(false)}
 *   />
 */

import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useT } from "@/lib/i18n";

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function BackgroundLocationDisclosure({ visible, onAccept, onDecline }: Props) {
  const { t, isRtl } = useT();
  const align = isRtl ? "right" : "left";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View className="flex-1 bg-black/60 items-center justify-center px-6">
        <View className="w-full max-w-md rounded-3xl bg-white p-6">
          {/* Icon banner */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-2xl bg-orange-100 items-center justify-center">
              <Text className="text-4xl">📍</Text>
            </View>
          </View>

          <Text
            className="text-xl font-bold text-slate-900 mb-3"
            style={{ textAlign: "center" }}
          >
            {t("disclosure.title")}
          </Text>

          <ScrollView className="max-h-64 mb-5">
            <Text
              className="text-base leading-6 text-slate-700"
              style={{ textAlign: align, writingDirection: isRtl ? "rtl" : "ltr" }}
            >
              {t("disclosure.body")}
            </Text>
          </ScrollView>

          {/* Accept — primary */}
          <TouchableOpacity
            onPress={onAccept}
            activeOpacity={0.85}
            className="bg-orange-500 rounded-2xl py-4 items-center mb-3"
          >
            <Text className="text-white font-bold text-lg">{t("disclosure.accept")}</Text>
          </TouchableOpacity>

          {/* Decline — secondary */}
          <TouchableOpacity onPress={onDecline} activeOpacity={0.7} className="py-3 items-center">
            <Text className="text-slate-500 font-semibold text-base">
              {t("disclosure.decline")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
