/**
 * Trip Card Component (Driver View)
 * Large card showing current trip with dynamic action button
 */

import { View, Text } from "react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Trip, CHECKPOINT_SEQUENCE, DRIVER_CHECKPOINT_STEPS } from "@/types";

interface TripCardProps {
  trip: Trip;
  onCheckpointAction: () => void;
  loading?: boolean;
}

export function TripCard({ trip, onCheckpointAction, loading }: TripCardProps) {
  const currentCheckpointIndex = CHECKPOINT_SEQUENCE.indexOf(trip.currentCheckpoint);
  const currentStep = DRIVER_CHECKPOINT_STEPS[currentCheckpointIndex];
  const nextStep = DRIVER_CHECKPOINT_STEPS[currentCheckpointIndex + 1];
  const progress = ((currentCheckpointIndex + 1) / CHECKPOINT_SEQUENCE.length) * 100;

  // Determine button label and action based on current state
  const getActionButton = () => {
    if (trip.isCompleted) {
      return { label: "✅ تم الانتهاء", color: "bg-slate-400", disabled: true };
    }

    if (trip.isCancelled) {
      return { label: "🚫 الرحلة ملغاة", color: "bg-red-400", disabled: true };
    }

    // If at first checkpoint (ARR_PLANT), button should confirm arrival
    if (currentCheckpointIndex === 0) {
      return {
        label: `${currentStep.emoji} ${currentStep.labelAr}`,
        color: currentStep.bgColor,
        disabled: false,
      };
    }

    // Otherwise show next action
    if (nextStep) {
      return {
        label: `${nextStep.emoji} ${nextStep.labelAr}`,
        color: nextStep.bgColor,
        disabled: false,
      };
    }

    return { label: "جارِ التحميل...", color: "bg-slate-400", disabled: true };
  };

  const actionButton = getActionButton();

  return (
    <Card variant="elevated" className="bg-white">
      {/* Header */}
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-1">
          <Text className="text-slate-500 text-sm mb-1">رقم الرحلة</Text>
          <Text className="text-2xl font-bold text-slate-800">
            {trip.tripNumber}
          </Text>
        </View>
        <View className="bg-blue-50 px-3 py-2 rounded-xl">
          <Text className="text-blue-700 font-bold text-lg">
            {trip.loadedVolumeM3} م³
          </Text>
        </View>
      </View>

      {/* Trip Details */}
      <View className="bg-slate-50 rounded-2xl p-4 mb-4">
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">العميل</Text>
          <Text className="text-slate-800 font-semibold">{trip.clientName ?? "-"}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">الموقع</Text>
          <Text className="text-slate-800 font-semibold">{trip.siteName ?? "-"}</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">الخلطة</Text>
          <Text className="text-slate-800 font-semibold">{trip.designCode ?? "-"}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-slate-600 text-sm">الشاحنة</Text>
          <Text className="text-slate-800 font-semibold">
            {trip.vehicleCode} - {trip.plateNumber}
          </Text>
        </View>
      </View>

      {/* Progress Indicator */}
      <View className="mb-6">
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">تقدم الرحلة</Text>
          <Text className="text-slate-800 font-semibold">
            {currentCheckpointIndex + 1}/{CHECKPOINT_SEQUENCE.length}
          </Text>
        </View>
        <View className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <View
            className={`h-full ${currentStep.bgColor}`}
            style={{ width: `${progress}%` }}
          />
        </View>
        <View className="flex-row mt-2 justify-between">
          {CHECKPOINT_SEQUENCE.map((_, index) => (
            <View
              key={index}
              className={`w-3 h-3 rounded-full ${
                index <= currentCheckpointIndex
                  ? currentStep.bgColor
                  : "bg-slate-200"
              }`}
            />
          ))}
        </View>
      </View>

      {/* Current Status */}
      <View className="mb-4">
        <Text className="text-slate-500 text-sm mb-2">الحالة الحالية</Text>
        <View className="bg-slate-50 rounded-2xl p-4 flex-row items-center">
          <Text className="text-3xl ml-3">{currentStep.emoji}</Text>
          <View className="flex-1">
            <Text className="text-xl font-bold text-slate-800">
              {currentStep.labelAr}
            </Text>
            <Text className="text-slate-500 text-sm">
              {currentStep.labelEn}
            </Text>
          </View>
        </View>
      </View>

      {/* Action Button */}
      <Button
        title={actionButton.label}
        onPress={onCheckpointAction}
        disabled={actionButton.disabled || loading}
        loading={loading}
        size="large"
        className={actionButton.color}
      />
    </Card>
  );
}
