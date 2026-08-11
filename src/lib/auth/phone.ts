/**
 * Normalizes a phone number to E.164 form so users can sign in with the
 * local format (05xxxxxxxx) or the international format (+9665xxxxxxxx).
 *
 * Supported input shapes:
 *  - "0500000000"            -> "+966500000000"   (Saudi mobile, leading 0)
 *  - "+966500000000"         -> "+966500000000"
 *  - "966500000000"          -> "+966500000000"
 *  - "+971 50 123 4567"      -> "+971501234567"   (strips spaces/dashes)
 */
export function normalizePhone(input: string): string {
  let digits = input.replace(/[\s\-()]/g, "");
  if (!digits.startsWith("+")) {
    if (digits.startsWith("966") && digits.length === 12) {
      digits = `+${digits}`;
    } else if (digits.startsWith("05") && digits.length === 10) {
      digits = `+966${digits.slice(1)}`;
    } else if (digits.startsWith("0")) {
      digits = `+${digits.slice(1)}`;
    }
  }
  return digits;
}
