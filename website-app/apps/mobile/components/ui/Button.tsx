/**
 * Primary Button Component
 * Large touch-friendly button for field use
 */

import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from "react-native";

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "warning";
  size?: "large" | "medium" | "small";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: ViewStyle;
}

const variants = {
  primary: "bg-orange-500 active:bg-orange-600",
  secondary: "bg-slate-200 active:bg-slate-300 text-slate-800",
  danger: "bg-red-500 active:bg-red-600",
  success: "bg-emerald-500 active:bg-emerald-600",
  warning: "bg-amber-500 active:bg-amber-600",
};

const sizes = {
  large: "py-6 px-8 rounded-3xl",
  medium: "py-4 px-6 rounded-2xl",
  small: "py-3 px-5 rounded-xl",
};

const textSizes = {
  large: "text-xl",
  medium: "text-lg",
  small: "text-base",
};

export function Button({
  onPress,
  title,
  variant = "primary",
  size = "medium",
  disabled = false,
  loading = false,
  className = "",
  style,
}: ButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`
        ${variants[variant]}
        ${sizes[size]}
        items-center justify-center
        ${disabled ? "opacity-50" : "opacity-100"}
        ${className}
      `}
      activeOpacity={0.8}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color="white" size="large" />
      ) : (
        <Text className={`${textSizes[size]} font-bold text-white text-center`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}
