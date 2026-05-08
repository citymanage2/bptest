import crypto from "crypto";
import { TOKEN_PACKAGES } from "./packages";

const TERMINAL_KEY = process.env.TBANK_TERMINAL_KEY!;
const PASSWORD = process.env.TBANK_PASSWORD!;
const API_URL = process.env.TBANK_API_URL || "https://rest-api-test.tinkoff.ru/v2";

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
    Receipt: params.receipt,
  };

  const token = buildSignature(reqBody as Record<string, string | number | boolean>);
  reqBody.Token = token;

  const response = await fetch(`${API_URL}/Init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
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
