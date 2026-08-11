/**
 * Status Badge Component
 * Color-coded badge for order/trip status
 */

import { View, Text } from "react-native";
import { ORDER_STATUS_DISPLAY, OrderStatus } from "@/types";

interface StatusBadgeProps {
  status: OrderStatus;
  size?: "small" | "medium" | "large";
}

const sizes = {
  small: "px-2 py-1 text-xs",
  medium: "px-3 py-1.5 text-sm",
  large: "px-4 py-2 text-base",
};

export function StatusBadge({ status, size = "medium" }: StatusBadgeProps) {
  const display = ORDER_STATUS_DISPLAY[status];

  return (
    <View
      className={`
        flex-row items-center
        rounded-full
        ${display.bgColor}
        ${sizes[size]}
        self-start
      `}
    >
      <Text className="text-lg mr-1">{display.emoji}</Text>
      <Text className={`${display.color} font-bold`}>
        {display.labelAr}
      </Text>
    </View>
  );
}
