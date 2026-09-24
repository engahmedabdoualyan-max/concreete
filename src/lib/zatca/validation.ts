export type ZatcaInvoiceKind = "STANDARD" | "SIMPLIFIED";

export interface ZatcaInvoiceInputCheck {
  sellerName: string;
  sellerVatNumber: string;
  buyerVatNumber?: string | null;
  quantity: number;
  unitPriceSar: number;
  kind: ZatcaInvoiceKind;
}

export interface ZatcaValidationIssue {
  level: "ERROR" | "WARNING";
  code: string;
  message: string;
}

/** Basic pre-flight checks that do not encode a business policy. */
export function validateZatcaInvoiceInput(
  input: ZatcaInvoiceInputCheck,
): ZatcaValidationIssue[] {
  const issues: ZatcaValidationIssue[] = [];
  if (!input.sellerName.trim()) {
    issues.push({ level: "ERROR", code: "SELLER_NAME_REQUIRED", message: "Seller name is required" });
  }
  if (!/^3\d{13}3$/.test(input.sellerVatNumber)) {
    issues.push({
      level: "ERROR",
      code: "SELLER_VAT_INVALID",
      message: "Seller VAT number must be a 15-digit Saudi VAT number starting and ending with 3",
    });
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    issues.push({ level: "ERROR", code: "QUANTITY_INVALID", message: "Invoice quantity must be positive" });
  }
  if (!Number.isFinite(input.unitPriceSar) || input.unitPriceSar < 0) {
    issues.push({ level: "ERROR", code: "UNIT_PRICE_INVALID", message: "Invoice unit price cannot be negative" });
  }
  if (input.kind === "STANDARD" && !input.buyerVatNumber) {
    issues.push({
      level: "WARNING",
      code: "STANDARD_BUYER_VAT_MISSING",
      message: "A standard invoice normally requires a VAT-registered buyer",
    });
  }
  if (input.buyerVatNumber && !/^3\d{13}3$/.test(input.buyerVatNumber)) {
    issues.push({
      level: "ERROR",
      code: "BUYER_VAT_INVALID",
      message: "Buyer VAT number must be a 15-digit Saudi VAT number starting and ending with 3",
    });
  }
  return issues;
}

export function zatcaBlockingIssues(
  input: ZatcaInvoiceInputCheck,
): ZatcaValidationIssue[] {
  return validateZatcaInvoiceInput(input).filter((issue) => issue.level === "ERROR");
}
