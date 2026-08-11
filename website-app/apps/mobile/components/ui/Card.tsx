/**
 * Card Component
 * Container for content sections with subtle shadow
 */

import { View, ViewStyle } from "react-native";
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: ViewStyle;
  variant?: "default" | "elevated" | "outlined";
}

const variants = {
  default: "bg-white rounded-2xl p-5 shadow-sm",
  elevated: "bg-white rounded-2xl p-5 shadow-lg",
  outlined: "bg-white rounded-2xl p-5 border border-slate-200",
};

export function Card({ children, className = "", style, variant = "default" }: CardProps) {
  return (
    <View className={`${variants[variant]} ${className}`} style={style}>
      {children}
    </View>
  );
}
