/**
 * Deterministic Business Model Builder
 * - Driver-based monthly financial model (P&L) with reverse planning
 * - Osterwalder Business Model Canvas (9 blocks)
 * Same inputs → same outputs. No LLM calls.
 */

import type {
  BusinessModelInput,
  BusinessModelOutput,
  MonthlyFinancialRow,
  FinancialModelOutput,
  CanvasOutput,
} from "../../shared/types";

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function roundDeals(n: number, mode: "CEIL" | "ROUND" | "FLOOR"): number {
  if (mode === "CEIL") return Math.ceil(n);
  if (mode === "FLOOR") return Math.floor(n);
  return Math.round(n);
}

function nullArray(arr: (number | null)[] | null, idx: number): number | null {
  if (!arr) return null;
  return arr[idx] ?? null;
}

// ─────────────────────────────────────────
// Financial Model
// ─────────────────────────────────────────

function buildFinancialModel(input: BusinessModelInput): FinancialModelOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  const totalPct = input.cost_lines.reduce((s, c) => s + c.percent, 0);
  if (Math.abs(totalPct - 100) > 0.5) {
    warnings.push(
      `Сумма процентов по статьям: ${totalPct.toFixed(1)}% (для корректного расчёта ожидается ~100%)`
    );
  }

  const dividendsLine = input.cost_lines.find((c) => c.name === "Дивиденды");

  // Mode validation
  if (input.mode === "DIVIDENDS_TO_REVENUE") {
    if (!input.dividends_needed_by_month)
      errors.push("DIVIDENDS_TO_REVENUE: обязателен dividends_needed_by_month");
    if (!dividendsLine || dividendsLine.percent <= 0)
      errors.push("DIVIDENDS_TO_REVENUE: нужна строка 'Дивиденды' с percent > 0");
  }
  if (input.mode === "REVENUE_DIRECT" && !input.revenue_plan_by_month)
    errors.push("REVENUE_DIRECT: обязателен revenue_plan_by_month");
  if (input.mode === "PROFIT_TO_REVENUE" && !input.profit_needed_by_month)
    errors.push("PROFIT_TO_REVENUE: обязателен profit_needed_by_month");

  const rows: MonthlyFinancialRow[] = [];

  for (let m = 1; m <= 12; m++) {
    const i = m - 1;

    // ── Revenue ──────────────────────────────
    let revenue = 0;

    if (input.mode === "DIVIDENDS_TO_REVENUE") {
      const divNeeded = nullArray(input.dividends_needed_by_month, i) ?? 0;
      const divPct = dividendsLine?.percent ?? 0;
      revenue = divPct > 0 ? (divNeeded / divPct) * 100 : 0;
    } else if (input.mode === "REVENUE_DIRECT") {
      revenue = nullArray(input.revenue_plan_by_month, i) ?? 0;
    } else {
      // PROFIT_TO_REVENUE
      const profitNeeded = nullArray(input.profit_needed_by_month, i) ?? 0;
      const residualPct = Math.max(0, 100 - totalPct);
      revenue = residualPct > 0 ? (profitNeeded / residualPct) * 100 : 0;
    }

    // ── Cost lines ───────────────────────────
    const costLineAmounts = input.cost_lines.map((cl) => ({
      name: cl.name,
      percent: cl.percent,
      amount: (revenue * cl.percent) / 100,
    }));

    const totalCosts = costLineAmounts.reduce((s, c) => s + c.amount, 0);
    const residualProfit = revenue - totalCosts;
    const residualProfitPct = revenue > 0 ? (residualProfit / revenue) * 100 : 0;

    // ── Deals & avg ticket ───────────────────
    let dealsCount: number | null = null;
    let avgTicket: number | null = null;

    const givenDeals = nullArray(input.deals_count_by_month, i);
    const givenTicket = nullArray(input.avg_ticket_by_month, i);

    if (givenDeals !== null && givenTicket !== null) {
      dealsCount = givenDeals;
      avgTicket = givenTicket;
      const impliedRev = givenDeals * givenTicket;
      const dev = revenue > 0 ? (Math.abs(impliedRev - revenue) / revenue) * 100 : 0;
      if (dev > input.tolerance.avg_ticket_vs_deals_pct) {
        warnings.push(
          `Месяц ${m}: сделки×билет (${impliedRev.toFixed(0)}) расходится с выручкой (${revenue.toFixed(0)}) на ${dev.toFixed(1)}%`
        );
      }
    } else if (givenDeals !== null) {
      dealsCount = givenDeals;
      avgTicket = dealsCount > 0 ? revenue / dealsCount : null;
    } else if (givenTicket !== null) {
      avgTicket = givenTicket;
      dealsCount =
        avgTicket > 0
          ? roundDeals(revenue / avgTicket, input.rounding.deals)
          : null;
    }

    rows.push({
      month: m,
      revenue,
      cost_lines: costLineAmounts,
      total_costs: totalCosts,
      residual_profit: residualProfit,
      residual_profit_pct: residualProfitPct,
      deals_count: dealsCount,
      avg_ticket: avgTicket,
    });
  }

  // ── Annual totals ────────────────────────
  const annualRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const annualCostLines = input.cost_lines.map((cl) => ({
    name: cl.name,
    amount: rows.reduce((s, r) => {
      const found = r.cost_lines.find((c) => c.name === cl.name);
      return s + (found?.amount ?? 0);
    }, 0),
  }));
  const annualTotalCosts = annualCostLines.reduce((s, c) => s + c.amount, 0);
  const annualResidualProfit = annualRevenue - annualTotalCosts;
  const annualResidualProfitPct =
    annualRevenue > 0 ? (annualResidualProfit / annualRevenue) * 100 : 0;

  if (input.target_profit_pct !== null) {
    const diff = Math.abs(annualResidualProfitPct - input.target_profit_pct);
    if (diff > 0.5) {
      warnings.push(
        `Целевая прибыль ${input.target_profit_pct}% расходится с расчётной ${annualResidualProfitPct.toFixed(1)}%`
      );
    }
  }

  return {
    rows,
    annual: {
      revenue: annualRevenue,
      cost_lines: annualCostLines,
      total_costs: annualTotalCosts,
      residual_profit: annualResidualProfit,
      residual_profit_pct: annualResidualProfitPct,
    },
    errors,
    warnings,
  };
}

// ─────────────────────────────────────────
// Canvas
// ─────────────────────────────────────────

function buildCanvas(input: BusinessModelInput): CanvasOutput {
  const c = input.canvas;
  const warnings: string[] = [];

  const required: [keyof typeof c, string][] = [
    ["customer_segments", "Сегменты клиентов"],
    ["value_propositions", "Ценностные предложения"],
    ["revenue_streams", "Потоки доходов"],
    ["key_activities", "Ключевые активности"],
  ];
  for (const [field, label] of required) {
    const val = c[field] as string[] | null;
    if (!val || val.length === 0)
      warnings.push(`Не заполнен блок канваса: ${label}`);
  }

  return {
    customer_segments: c.customer_segments ?? [],
    value_propositions: c.value_propositions ?? [],
    channels: c.channels ?? [],
    customer_relationships: c.customer_relationships ?? [],
    revenue_streams: c.revenue_streams ?? [],
    key_resources: c.key_resources ?? [],
    key_activities: c.key_activities ?? [],
    key_partners: c.key_partners ?? [],
    cost_structure: c.cost_structure ?? [],
    meta: {
      company_name: c.company_name,
      industry: c.industry,
      geography: c.geography ?? [],
      b2b_b2c: c.b2b_b2c,
      notes: c.notes,
    },
    warnings,
  };
}

// ─────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────

export function calculateBusinessModel(
  input: BusinessModelInput
): BusinessModelOutput {
  return {
    financial: buildFinancialModel(input),
    canvas: buildCanvas(input),
  };
}
