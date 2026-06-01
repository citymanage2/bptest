import crypto from "crypto";
import { TOKEN_PACKAGES } from "./packages";

const TERMINAL_KEY = process.env.TBANK_TERMINAL_KEY!;
const PASSWORD = process.env.TBANK_PASSWORD!;
const API_URL = process.env.TBANK_API_URL || "https://rest-api-test.tinkoff.ru/v2";

console.log("[T-Bank] TBANK_TERMINAL_KEY:", TERMINAL_KEY ? `set (${TERMINAL_KEY.slice(0, 4)}...)` : "NOT SET");
console.log("[T-Bank] TBANK_PASSWORD:", PASSWORD ? "set" : "NOT SET");
console.log("[T-Bank] TBANK_API_URL:", API_URL);

const SIGNATURE_EXCLUDED = new Set(["Token", "Receipt", "DATA"]);

export function buildSignature(params: Record<string, string | number | boolean>): string {
  const entries = Object.entries({ ...params, Password: PASSWORD })
    .filter(([key]) => !SIGNATURE_EXCLUDED.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const concat = entries.map(([, v]) => String(v)).join("");
  return crypto.createHash("sha256").update(concat).digest("hex");
}

export function verifyWebhookSignature(body: Record<string, unknown>): boolean {
  const { Token, ...rest } = body;
  const expected = buildSignature(rest as Record<string, string | number | boolean>);
  return expected === Token;
}

export function buildReceipt(
  pkg: (typeof TOKEN_PACKAGES)[number],
  userEmail: string
) {
  return {
    Email: userEmail,
    Taxation: "usn_income_outcome",
    Items: [
      {
        Name: `Пополнение токенового баланса (${pkg.tokens} токенов)`,
        Price: pkg.amount,
        Quantity: 1.0,
        Amount: pkg.amount,
        Tax: "none",
        PaymentMethod: "full_payment",
        PaymentObject: "service",
      },
    ],
  };
}

const NOTIFICATION_URL = "https://biz-process.ru/api/payments/webhook";

export async function initPayment(params: {
  orderId: string;
  amount: number;
  description: string;
  receipt: ReturnType<typeof buildReceipt>;
  successUrl: string;
  failUrl: string;
}): Promise<{ paymentUrl: string; paymentId: string }> {
  const reqBody: Record<string, unknown> = {
    TerminalKey: TERMINAL_KEY,
    Amount: params.amount,
    OrderId: params.orderId,
    Description: params.description,
    SuccessURL: params.successUrl,
    FailURL: params.failUrl,
    NotificationURL: NOTIFICATION_URL,
    Receipt: params.receipt,
  };

  const token = buildSignature(reqBody as Record<string, string | number | boolean>);
  reqBody.Token = token;

  console.log("[T-Bank] POST", `${API_URL}/Init`, JSON.stringify({ ...reqBody, Token: reqBody.Token, Receipt: "[omitted]" }));

  const response = await fetch(`${API_URL}/Init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const rawBody = await response.text();
    console.error("[T-Bank] Non-JSON response", response.status, contentType, rawBody.slice(0, 500));
    throw new Error(
      `T-Bank вернул неожиданный ответ (HTTP ${response.status}). Проверьте TBANK_TERMINAL_KEY и TBANK_PASSWORD в настройках окружения.`
    );
  }

  const data = (await response.json()) as {
    Success: boolean;
    PaymentURL?: string;
    PaymentId?: string;
    Message?: string;
  };

  if (!data.Success || !data.PaymentURL || !data.PaymentId) {
    throw new Error(data.Message || "T-Bank Init failed");
  }

  return { paymentUrl: data.PaymentURL, paymentId: data.PaymentId };
}

export async function confirmPayment(paymentId: string): Promise<boolean> {
  const reqBody: Record<string, string | number | boolean> = {
    TerminalKey: TERMINAL_KEY,
    PaymentId: paymentId,
  };
  reqBody.Token = buildSignature(reqBody);

  console.log("[T-Bank] Confirm PaymentId:", paymentId);

  try {
    const response = await fetch(`${API_URL}/Confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const data = (await response.json()) as { Success: boolean; Message?: string };
    if (!data.Success) {
      console.error("[T-Bank] Confirm failed:", data.Message);
      return false;
    }
    console.log("[T-Bank] Confirm success for PaymentId:", paymentId);
    return true;
  } catch (err) {
    console.error("[T-Bank] Confirm error:", err);
    return false;
  }
}
