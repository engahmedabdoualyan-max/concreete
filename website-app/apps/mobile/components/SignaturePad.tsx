/**
 * SignaturePad — Customer sign-on-glass capture (Epic 3)
 * Wraps react-native-signature-canvas with Fimto styling.
 * Returns a PNG data URL ready for POST /api/dispatch/[tripId]/signature.
 */

import { useRef, forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";
import SignatureScreen, {
  type SignatureViewRef,
} from "react-native-signature-canvas";

export interface SignaturePadHandle {
  readSignature: () => void;
  clearSignature: () => void;
}

interface SignaturePadProps {
  onOK: (dataUrl: string) => void;
  onEmpty?: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ onOK, onEmpty }, ref) => {
    const sigRef = useRef<SignatureViewRef>(null);

    useImperativeHandle(ref, () => ({
      readSignature: () => sigRef.current?.readSignature(),
      clearSignature: () => sigRef.current?.clearSignature(),
    }));

    const handleOK = (sig: string) => {
      // Library returns raw base64 — normalise to a data URL for the API
      const dataUrl = sig.startsWith("data:")
        ? sig
        : `data:image/png;base64,${sig}`;
      onOK(dataUrl);
    };

    return (
      <View className="h-64 rounded-2xl overflow-hidden border-2 border-slate-300 bg-white">
        <SignatureScreen
          ref={sigRef}
          onOK={handleOK}
          onEmpty={onEmpty}
          autoClear={false}
          descriptionText=""
          clearText=""
          confirmText=""
          webStyle={`
            .m-signature-pad { box-shadow: none; border: none; }
            .m-signature-pad--body { border: none; }
            .m-signature-pad--footer { display: none; }
          `}
        />
      </View>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
