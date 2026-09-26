/**
 * nativewind interop for react-native-web components.
 *
 * nativewind only maps `className` onto components it knows about. Plain
 * `<View>`/`<Text>` work out of the box, but the scroll/press/input components
 * from react-native-web silently drop the prop — so every screen root
 * (`<ScrollView className="flex-1">`) lost its flex on the web build and the
 * navigator shrink-wrapped the screen to its content width.
 *
 * Registering the mapping once, at module scope of the root layout (before any
 * screen renders), makes `className` behave the same on web as it does on the
 * phone.
 */
import { cssInterop } from "nativewind";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";

const components = {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
};

for (const component of Object.values(components)) {
  try {
    cssInterop(component as never, { className: "style" });
  } catch {
    /* component not interop-aware on this platform — keep the default */
  }
}

export const NATIVEWIND_INTEROP_READY = true;
