/**
 * Zoho Books connector (Epic 6)
 * Docs: https://www.zoho.com/books/api/v3/
 *
 * Credentials: { clientId, clientSecret, refreshToken, region? (com|eu|in) }
 * Settings:    { organizationId? (auto-discovered), currency? }
 */

import {
  cachedToken,
  storeToken,
  type AccountingConnector,
  type ConnectorResult,
} from "./connector";

const HOSTS: Record<string, { accounts: string; books: string }> = {
  com: { accounts: "https://accounts.zoho.com", books: "https://www.zohoapis.com" },
  eu: { accounts: "https://accounts.zoho.eu", books: "https://www.zohoapis.eu" },
  in: { accounts: "https://accounts.zoho.in", books: "https://www.zohoapis.in" },
};

function hosts(region?: string) {
  return HOSTS[region ?? "com"] ?? HOSTS.com;
}

async function accessToken(
  connKey: string,
  creds: Record<string, string>
): Promise<string> {
  const hit = cachedToken(`zoho:${connKey}`);
  if (hit) return hit;

  const { accounts } = hosts(creds.region);
  const params = new URLSearchParams({
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${accounts}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`Zoho OAuth failed: ${body.error ?? res.status}`);
  }
  storeToken(`zoho:${connKey}`, body.access_token, body.expires_in ?? 3600);
  return body.access_token;
}

async function orgId(
  connKey: string,
  creds: Record<string, string>,
  settings: Record<string, unknown>
): Promise<string> {
  if (typeof settings.organizationId === "string" && settings.organizationId) {
    return settings.organizationId;
  }
  const { books } = hosts(creds.region);
  const token = await accessToken(connKey, creds);
  const res = await fetch(`${books}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const body = (await res.json()) as {
    organizations?: { organization_id: string }[];
  };
  const id = body.organizations?.[0]?.organization_id;
  if (!id) throw new Error("No Zoho organization found");
  return id;
}

async function zohoCall(
  method: "GET" | "POST",
  path: string,
  connKey: string,
  creds: Record<string, string>,
  settings: Record<string, unknown>,
  payload?: unknown
): Promise<{ ok: boolean; data?: Record<string, unknown>; message: string }> {
  try {
    const { books } = hosts(creds.region);
    const org = await orgId(connKey, creds, settings);
    const token = await accessToken(connKey, creds);
    const res = await fetch(
      `${books}/books/v3/${path}?organization_id=${encodeURIComponent(org)}`,
      {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: payload ? JSON.stringify(payload) : undefined,
      }
    );
    const body = (await res.json()) as {
      code?: number;
      message?: string;
      contact?: { contact_id: string };
      invoice?: { invoice_id: string; invoice_number: string };
    };
    if (body.code === 0) {
      const ext = body.contact?.contact_id ?? body.invoice?.invoice_id;
      return {
        ok: true,
        data: { externalId: ext, number: body.invoice?.invoice_number },
        message: body.message ?? "OK",
      };
    }
    return { ok: false, message: body.message ?? `Zoho error ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Zoho call failed",
    };
  }
}

export const zohoConnector: AccountingConnector = {
  provider: "ZOHO_BOOKS",

  async testConnection(creds, settings): Promise<ConnectorResult> {
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
      return { ok: false, message: "clientId/clientSecret/refreshToken required" };
    }
    const r = await zohoCall("GET", "organizations", "test", creds, settings);
    return r.ok
      ? { ok: true, message: "Zoho Books connected" }
      : { ok: false, message: r.message };
  },

  async pushCustomer(creds, settings, input): Promise<ConnectorResult> {
    const r = await zohoCall("POST", "contacts", `c:${input.companyName}`, creds, settings, {
      contact_name: input.companyName,
      company_name: input.companyName,
      contact_persons: input.contactPerson
        ? [{ first_name: input.contactPerson }]
        : undefined,
      phone: input.phone,
      email: input.email,
      vat_treatment: input.vatNumber ? "vat_registered" : undefined,
      vat_reg_no: input.vatNumber,
    });
    return {
      ok: r.ok,
      externalId: r.data?.externalId as string | undefined,
      message: r.message,
    };
  },

  async pushInvoice(creds, settings, input): Promise<ConnectorResult> {
    const r = await zohoCall(
      "POST",
      "invoices",
      `i:${input.orderNumber}`,
      creds,
      settings,
      {
        customer_id: input.customerExternalId,
        reference_number: input.orderNumber,
        date: input.issueDate,
        currency_code: input.currency,
        line_items: input.lines.map((l) => ({
          name: l.description,
          quantity: l.quantityM3,
          rate: l.rateSar,
          unit: "m3",
        })),
        notes: input.notes,
      }
    );
    return {
      ok: r.ok,
      externalId: r.data?.externalId as string | undefined,
      message: r.data?.number
        ? `Invoice ${r.data.number} created`
        : r.message,
    };
  },
};
