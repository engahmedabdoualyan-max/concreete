/**
 * Input Component
 * Large touch-friendly text input for field use
 */

import { TextInput, View, Text, TextInputProps } from "react-native";
import { forwardRef } from "react";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: string;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, icon, containerClassName = "", ...props }, ref) => {
    return (
      <View className={`mb-4 ${containerClassName}`}>
        {label && (
          <Text className="text-slate-600 font-semibold mb-2 text-base">
            {label}
          </Text>
        )}
        <View
          className={`
            flex-row items-center
            bg-slate-50
            rounded-2xl
            border-2
            ${error ? "border-red-300" : "border-slate-200"}
            px-4
          `}
        >
          {icon && <Text className="text-2xl ml-2">{icon}</Text>}
          <TextInput
            ref={ref}
            className="flex-1 py-4 text-lg text-slate-800"
            placeholderTextColor="#94A3B8"
            {...props}
          />
        </View>
        {error && (
          <Text className="text-red-500 text-sm mt-1">{error}</Text>
        )}
      </View>
    );
  }
);

Input.displayName = "Input";
