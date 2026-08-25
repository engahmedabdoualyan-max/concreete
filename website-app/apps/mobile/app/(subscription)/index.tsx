/**
 * Subscription Expired
 * Full-screen lock for companies whose subscription has ended. Asks the user
 * to contact FimtoSoft and offers a link to fimtosoft.com.
 */

import { View, Text, TouchableOpacity, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth-store";

export default function SubscriptionExpiredScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const openFimtoSoft = () => {
    Linking.openURL("https://fimtosoft.com").catch(() => {});
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login" as any);
  };

  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-6">
      <Card variant="elevated" className="w-full items-center p-8">
        <Text className="text-5xl mb-4">🔒</Text>
        <Text className="text-2xl font-bold text-slate-800 text-center mb-3">
          انتهى اشتراك الشركة
        </Text>
        <Text className="text-slate-600 text-center leading-6 mb-1">
          مرحباً {user?.fullName || ""}، انتهت مدة الاشتراك الخاصة بشركتك.
        </Text>
        <Text className="text-slate-600 text-center leading-6 mb-6">
          لاستكمال العمل وتفعيل التجديد، يرجى التواصل مع شركة
          <Text className="font-bold text-slate-800"> FimtoSoft</Text>.
        </Text>

        <Button
          title="🌐 الانتقال إلى fimtosoft.com"
          onPress={openFimtoSoft}
          size="large"
          className="w-full mb-3"
        />

        <TouchableOpacity onPress={handleLogout} className="py-2">
          <Text className="text-slate-500 text-sm">تسجيل الخروج</Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
}
