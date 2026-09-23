/**
 * QuickBooks Online connector (Epic 6)
 * Docs: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer
 *
 * Credentials: { clientId, clientSecret, refreshToken, realmId }
 * Settings:    { sandbox? (boolean), itemRef? (sales item, default "1"),
 *                currency? }
 */

import {
  cachedToken,
  storeToken,
  type AccountingConnector,
  type ConnectorResult,
} from "./connector";

function baseUrl(sandbox: boolean): string {
  return sandbox
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

async function accessToken(
  connKey: string,
  creds: Record<string, string>
): Promise<string> {
  const hit = cachedToken(`qb:${connKey}`);
  if (hit) return hit;

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
  });
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`QuickBooks OAuth failed: ${data.error ?? res.status}`);
  }
  storeToken(`qb:${connKey}`, data.access_token, data.expires_in ?? 3600);
  return data.access_token;
}

async function qbCall(
  method: "POST",
  entity: "customer" | "invoice",
  connKey: string,
  creds: Record<string, string>,
  settings: Record<string, unknown>,
  payload: unknown
): Promise<{ ok: boolean; externalId?: string; message: string }> {
  try {
    if (!creds.realmId) return { ok: false, message: "realmId (Company ID) required" };
    const token = await accessToken(connKey, creds);
    const sandbox = settings.sandbox === true;
    const res = await fetch(
      `${baseUrl(sandbox)}/v3/company/${creds.realmId}/${entity}?minorversion=75`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const body = (await res.json()) as {
      Customer?: { Id: string };
      Invoice?: { Id: string; DocNumber: string };
      Fault?: { Error: { Message: string }[] };
    };
    if (body.Fault) {
      return {
        ok: false,
        message: body.Fault.Error.map((e) => e.Message).join("; "),
      };
    }
    const ext = body.Customer?.Id ?? body.Invoice?.Id;
    return {
      ok: true,
      externalId: ext,
      message: body.Invoice?.DocNumber
        ? `Invoice ${body.Invoice.DocNumber} created`
        : "OK",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "QuickBooks call failed",
    };
  }
}

export const quickbooksConnector: AccountingConnector = {
  provider: "QUICKBOOKS",

  async testConnection(creds): Promise<ConnectorResult> {
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken || !creds.realmId) {
      return {
        ok: false,
        message: "clientId/clientSecret/refreshToken/realmId required",
      };
    }
    // Lightweight probe: create nothing — validate OAuth + realm via companyinfo
    try {
      const token = await accessToken("test", creds);
      const sandbox = false;
      const res = await fetch(
        `${baseUrl(sandbox)}/v3/company/${creds.realmId}/companyinfo/${creds.realmId}?minorversion=75`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!res.ok) {
        // Sandbox fallback probe
        const resSb = await fetch(
          `${baseUrl(true)}/v3/company/${creds.realmId}/companyinfo/${creds.realmId}?minorversion=75`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
        );
        if (!resSb.ok) return { ok: false, message: `Realm unreachable (${res.status})` };
        return { ok: true, message: "QuickBooks connected (sandbox realm)" };
      }
      return { ok: true, message: "QuickBooks connected" };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "QuickBooks test failed",
      };
    }
  },

  async pushCustomer(creds, settings, input): Promise<ConnectorResult> {
    return qbCall("POST", "customer", `c:${input.companyName}`, creds, settings, {
      DisplayName: input.companyName.slice(0, 100),
      CompanyName: input.companyName,
      GivenName: input.contactPerson,
      PrimaryPhone: input.phone ? { FreeFormNumber: input.phone } : undefined,
      PrimaryEmailAddr: input.email ? { Address: input.email } : undefined,
    });
  },

  async pushInvoice(creds, settings, input): Promise<ConnectorResult> {
    const itemRef =
      typeof settings.itemRef === "string" && settings.itemRef ? settings.itemRef : "1";
    return qbCall("POST", "invoice", `i:${input.orderNumber}`, creds, settings, {
      CustomerRef: { value: input.customerExternalId },
      DocNumber: input.orderNumber,
      TxnDate: input.issueDate,
      CurrencyRef: { value: input.currency },
      PrivateNote: input.notes,
      Line: input.lines.map((l, i) => ({
        Id: String(i + 1),
        Amount: Math.round(l.quantityM3 * l.rateSar * 100) / 100,
        DetailType: "SalesItemLineDetail",
        Description: l.description,
        SalesItemLineDetail: {
          ItemRef: { value: itemRef },
          Qty: l.quantityM3,
          UnitPrice: l.rateSar,
        },
      })),
    });
  },
};
