/**
 * Booking Form Component (Sales Rep View)
 * Simple form for creating new concrete orders
 */

import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Client, DeliverySite, MixDesign } from "@/types";

interface BookingFormProps {
  onSubmit: (data: {
    clientId: string;
    siteId: string;
    mixDesignId: string;
    volumeM3: number;
    scheduledDate: string;
    location?: { latitude: number; longitude: number };
  }) => Promise<void>;
  loading?: boolean;
}

export function BookingForm({ onSubmit, loading }: BookingFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<DeliverySite[]>([]);
  const [mixDesigns, setMixDesigns] = useState<MixDesign[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedMixId, setSelectedMixId] = useState<string>("");
  const [volume, setVolume] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Load reference data
  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      const [clientsData, mixDesignsData] = await Promise.all([
        api.getClients(),
        api.getMixDesigns(),
      ]);
      setClients(clientsData);
      setMixDesigns(mixDesignsData);
    } catch (error) {
      console.error("Failed to load reference data:", error);
    }
  };

  // Load sites when client changes
  useEffect(() => {
    if (selectedClientId) {
      loadSites(selectedClientId);
    } else {
      setSites([]);
      setSelectedSiteId("");
    }
  }, [selectedClientId]);

  const loadSites = async (clientId: string) => {
    try {
      const sitesData = await api.getSites(clientId);
      setSites(sitesData);
    } catch (error) {
      console.error("Failed to load sites:", error);
    }
  };

  const handleCaptureLocation = async () => {
    // TODO: Implement GPS capture
    // For now, use mock location
    setLocation({ latitude: 26.5588, longitude: 49.9878 });
  };

  const handleSubmit = async () => {
    if (!selectedClientId || !selectedSiteId || !selectedMixId || !volume) {
      return;
    }

    await onSubmit({
      clientId: selectedClientId,
      siteId: selectedSiteId,
      mixDesignId: selectedMixId,
      volumeM3: parseFloat(volume),
      scheduledDate,
      location: location ?? undefined,
    });
  };

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <Card variant="elevated" className="mb-4">
        <Text className="text-2xl font-bold text-slate-800 mb-6">
          طلب جديد
        </Text>

        {/* Client Selection */}
        <Text className="text-slate-600 font-semibold mb-2 text-base">
          اختر العميل
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {clients.map((client) => (
            <TouchableOpacity
              key={client.id}
              onPress={() => setSelectedClientId(client.id)}
              className={`px-4 py-2 rounded-xl border-2 ${
                selectedClientId === client.id
                  ? "bg-orange-500 border-orange-500"
                  : "bg-white border-slate-200"
              }`}
            >
              <Text
                className={`font-semibold ${
                  selectedClientId === client.id
                    ? "text-white"
                    : "text-slate-700"
                }`}
              >
                {client.companyName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Site Selection */}
        {selectedClientId && (
          <>
            <Text className="text-slate-600 font-semibold mb-2 text-base">
              اختر موقع الصب
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {sites.map((site) => (
                <TouchableOpacity
                  key={site.id}
                  onPress={() => setSelectedSiteId(site.id)}
                  className={`px-4 py-2 rounded-xl border-2 ${
                    selectedSiteId === site.id
                      ? "bg-orange-500 border-orange-500"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      selectedSiteId === site.id
                        ? "text-white"
                        : "text-slate-700"
                    }`}
                  >
                    {site.siteName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Mix Design Selection */}
        <Text className="text-slate-600 font-semibold mb-2 text-base">
          اختر الخلطة
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {mixDesigns.map((mix) => (
            <TouchableOpacity
              key={mix.id}
              onPress={() => setSelectedMixId(mix.id)}
              className={`px-4 py-3 rounded-xl border-2 ${
                selectedMixId === mix.id
                  ? "bg-blue-500 border-blue-500"
                  : "bg-white border-slate-200"
              }`}
            >
              <Text
                className={`font-bold text-lg ${
                  selectedMixId === mix.id ? "text-white" : "text-slate-700"
                }`}
              >
                {mix.designCode}
              </Text>
              <Text
                className={`text-xs ${
                  selectedMixId === mix.id
                    ? "text-blue-100"
                    : "text-slate-500"
                }`}
              >
                {mix.targetStrengthMpa} MPa
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Volume Input */}
        <Text className="text-slate-600 font-semibold mb-2 text-base">
          الكمية (م³)
        </Text>
        <View className="flex-row gap-2 mb-4 flex-wrap">
          {[10, 20, 30, 50, 100].map((vol) => (
            <TouchableOpacity
              key={vol}
              onPress={() => setVolume(vol.toString())}
              className={`px-6 py-3 rounded-xl border-2 ${
                volume === vol.toString()
                  ? "bg-emerald-500 border-emerald-500"
                  : "bg-white border-slate-200"
              }`}
            >
              <Text
                className={`font-bold text-xl ${
                  volume === vol.toString() ? "text-white" : "text-slate-700"
                }`}
              >
                {vol}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Schedule Date */}
        <Text className="text-slate-600 font-semibold mb-2 text-base">
          تاريخ الصب
        </Text>
        <TouchableOpacity
          onPress={() => {
            // TODO: Implement date picker
          }}
          className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200 mb-4"
        >
          <Text className="text-slate-800 font-semibold text-lg">
            {scheduledDate}
          </Text>
        </TouchableOpacity>

        {/* Capture Location */}
        <Button
          title={
            location
              ? `📍 تم الالتقاط (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`
              : "📍 التقاط موقع الصب"
          }
          onPress={handleCaptureLocation}
          variant="secondary"
          size="large"
        />
      </Card>

      {/* Submit Button */}
      <Button
        title="إرسال الطلب"
        onPress={handleSubmit}
        loading={loading}
        disabled={!selectedClientId || !selectedSiteId || !selectedMixId || !volume}
        size="large"
        className="mb-8"
      />
    </ScrollView>
  );
}
