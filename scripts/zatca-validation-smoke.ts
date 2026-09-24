import assert from "node:assert/strict";
import { validateZatcaInvoiceInput } from "../src/lib/zatca/validation";

const valid = validateZatcaInvoiceInput({
  sellerName: "Fimto Concrete",
  sellerVatNumber: "300000000000003",
  buyerVatNumber: "300000000000003",
  quantity: 10,
  unitPriceSar: 100,
  kind: "STANDARD",
});
assert.equal(valid.some((issue) => issue.level === "ERROR"), false);

const invalid = validateZatcaInvoiceInput({
  sellerName: "",
  sellerVatNumber: "123",
  quantity: 0,
  unitPriceSar: -1,
  kind: "SIMPLIFIED",
});
assert.ok(invalid.some((issue) => issue.code === "SELLER_VAT_INVALID"));
assert.ok(invalid.some((issue) => issue.code === "QUANTITY_INVALID"));
assert.ok(invalid.some((issue) => issue.code === "UNIT_PRICE_INVALID"));

console.log("ZATCA validation smoke passed.");
