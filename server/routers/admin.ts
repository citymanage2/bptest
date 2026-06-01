import { z } from "zod";
import { eq, desc, like, or, sql, gte, and, sum, count } from "drizzle-orm";
import { router, adminProcedure } from "../trpc";
import { db } from "../db";
import { users, supportChats, supportMessages, faqArticles, tokenOperations, processes, companies, payments, apiCallLogs, interviews } from "../db/schema";
import type { ProcessData } from "@shared/types";
import { logger } from "../services/logger";
import Anthropic from "@anthropic-ai/sdk";

// YandexGPT 5.1 Pro pricing (RUB per 1000 tokens)
const YANDEX_INPUT_PRICE_PER_1K = parseFloat(process.env.YANDEX_INPUT_PRICE_PER_1K ?? "1.2");
const YANDEX_OUTPUT_PRICE_PER_1K = parseFloat(process.env.YANDEX_OUTPUT_PRICE_PER_1K ?? "4.8");
const USD_RATE = parseFloat(process.env.USD_RATE ?? "90"); // RUB per 1 USD

export const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    const result = await db.query.users.findMany({
      orderBy: desc(users.createdAt),
    });
    return result.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tokenBalance: u.tokenBalance,
      createdAt: u.createdAt.toISOString(),
    }));
  }),

  updateUserBalance: adminProcedure
    .input(z.object({ userId: z.number(), amount: z.number() }))
    .mutation(async ({ input }) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
      if (!user) throw new Error("Пользователь не найден");

      const newBalance = user.tokenBalance + input.amount;
      await db.update(users).set({ tokenBalance: newBalance }).where(eq(users.id, input.userId));

      await db.insert(tokenOperations).values({
        userId: input.userId,
        amount: input.amount,
        type: "topup",
        description: `Администратор: ${input.amount > 0 ? "пополнение" : "списание"} баланса`,
      });

      return { newBalance };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input }) => {
      await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),

  // Support chats
  listSupportChats: adminProcedure.query(async () => {
    const chats = await db.query.supportChats.findMany({
      orderBy: desc(supportChats.updatedAt),
      with: { user: true },
    });
    return chats.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.user.name,
      userEmail: c.user.email,
      status: c.status,
      subject: c.subject,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }),

  getSupportChat: adminProcedure
    .input(z.object({ chatId: z.number() }))
    .query(async ({ input }) => {
      const messages = await db.query.supportMessages.findMany({
        where: eq(supportMessages.chatId, input.chatId),
        orderBy: supportMessages.createdAt,
      });
      return messages.map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        senderRole: m.senderRole,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }));
    }),

  replySupportChat: adminProcedure
    .input(z.object({ chatId: z.number(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [message] = await db
        .insert(supportMessages)
        .values({
          chatId: input.chatId,
          senderId: ctx.userId,
          senderRole: "admin",
          content: input.content,
        })
        .returning();

      await db
        .update(supportChats)
        .set({ updatedAt: new Date() })
        .where(eq(supportChats.id, input.chatId));

      return {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        senderRole: message.senderRole,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      };
    }),

  closeSupportChat: adminProcedure
    .input(z.object({ chatId: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .update(supportChats)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(supportChats.id, input.chatId));
      return { success: true };
    }),

  // FAQ
  listFaq: adminProcedure.query(async () => {
    const articles = await db.query.faqArticles.findMany({
      orderBy: desc(faqArticles.updatedAt),
    });
    return articles.map((a) => ({
      ...a,
      keywords: a.keywords as string[],
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }),

  createFaq: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        keywords: z.array(z.string()),
        category: z.string().min(1),
        published: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const [article] = await db.insert(faqArticles).values(input).returning();
      return {
        ...article,
        keywords: article.keywords as string[],
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
      };
    }),

  updateFaq: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        keywords: z.array(z.string()).optional(),
        category: z.string().min(1).optional(),
        published: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [article] = await db
        .update(faqArticles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(faqArticles.id, id))
        .returning();
      return {
        ...article,
        keywords: article.keywords as string[],
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
      };
    }),

  deleteFaq: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(faqArticles).where(eq(faqArticles.id, input.id));
      return { success: true };
    }),

  // Processes (admin view — all users)
  listProcesses: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z.enum(["draft", "active", "archived"]).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const allProcesses = await db.query.processes.findMany({
        orderBy: desc(processes.createdAt),
        with: {
          company: {
            with: {
              user: true,
            },
          },
        },
      });

      let filtered = allProcesses;

      // Filter by status
      if (input?.status) {
        filtered = filtered.filter((p) => p.status === input.status);
      }

      // Filter by search query (company name, user name/email, process name)
      if (input?.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter((p) => {
          const data = p.data as ProcessData | null;
          const processName = data?.name?.toLowerCase() ?? "";
          const companyName = p.company.name.toLowerCase();
          const userName = p.company.user.name.toLowerCase();
          const userEmail = p.company.user.email.toLowerCase();
          return (
            processName.includes(q) ||
            companyName.includes(q) ||
            userName.includes(q) ||
            userEmail.includes(q)
          );
        });
      }

      return filtered.map((p) => {
        const data = p.data as ProcessData | null;
        return {
          id: p.id,
          status: p.status,
          processName: data?.name ?? "Без названия",
          companyId: p.companyId,
          companyName: p.company.name,
          userId: p.company.userId,
          userName: p.company.user.name,
          userEmail: p.company.user.email,
          stagesCount: data?.stages?.length ?? 0,
          blocksCount: data?.blocks?.length ?? 0,
          rolesCount: data?.roles?.length ?? 0,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      });
    }),

  getProcessById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const process = await db.query.processes.findFirst({
        where: eq(processes.id, input.id),
        with: {
          company: {
            with: {
              user: true,
            },
          },
        },
      });
      if (!process) throw new Error("Процесс не найден");

      return {
        id: process.id,
        interviewId: process.interviewId,
        companyId: process.companyId,
        status: process.status,
        data: process.data as ProcessData,
        companyName: process.company.name,
        userName: process.company.user.name,
        userEmail: process.company.user.email,
        createdAt: process.createdAt.toISOString(),
        updatedAt: process.updatedAt.toISOString(),
      };
    }),

  // Server logs (admin only)
  getLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).optional().default(200),
        level: z.enum(["info", "warn", "error"]).optional(),
      }).optional()
    )
    .query(({ input }) => {
      const logs = logger.getLogs(input?.limit ?? 200, input?.level);
      return {
        logs,
        total: logs.length,
        timestamp: new Date().toISOString(),
      };
    }),

  getLogsText: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional().default(200) }).optional())
    .query(({ input }) => {
      return logger.getLogsAsText(input?.limit ?? 200);
    }),

  clearLogs: adminProcedure.mutation(() => {
    logger.clear();
    logger.info("Admin", "Logs cleared by admin");
    return { success: true };
  }),

  // ── Analytics: Overview Dashboard ────────────────────────────────
  getDashboardStats: adminProcedure.query(async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [newUsers30d] = await db.select({ count: count() }).from(users).where(gte(users.createdAt, thirtyDaysAgo));
    const [newUsers7d] = await db.select({ count: count() }).from(users).where(gte(users.createdAt, sevenDaysAgo));
    const [adminCount] = await db.select({ count: count() }).from(users).where(eq(users.role, "admin"));

    const [totalProcesses] = await db.select({ count: count() }).from(processes);
    const [activeProcesses] = await db.select({ count: count() }).from(processes).where(eq(processes.status, "active"));

    // Revenue (confirmed payments)
    const confirmedPayments = await db.query.payments.findMany({
      where: eq(payments.status, "confirmed"),
    });
    const totalRevenue = confirmedPayments.reduce((s, p) => s + p.amount, 0); // kopecks
    const revenue30d = confirmedPayments
      .filter(p => p.createdAt >= thirtyDaysAgo)
      .reduce((s, p) => s + p.amount, 0);
    const revenue7d = confirmedPayments
      .filter(p => p.createdAt >= sevenDaysAgo)
      .reduce((s, p) => s + p.amount, 0);

    // Tokens sold (credited)
    const tokensSold = confirmedPayments.reduce((s, p) => s + p.tokensCredited, 0);
    const tokensSold30d = confirmedPayments
      .filter(p => p.createdAt >= thirtyDaysAgo)
      .reduce((s, p) => s + p.tokensCredited, 0);

    // Tokens consumed
    const allOps = await db.query.tokenOperations.findMany();
    const consumed = allOps.filter(o => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0);
    const consumed30d = allOps
      .filter(o => o.amount < 0 && o.createdAt >= thirtyDaysAgo)
      .reduce((s, o) => s + Math.abs(o.amount), 0);

    // Active users (had a token operation in 30 days)
    const activeUserIds = new Set(
      allOps.filter(o => o.createdAt >= thirtyDaysAgo).map(o => o.userId)
    );

    // Support chats
    const [openChats] = await db.select({ count: count() }).from(supportChats).where(eq(supportChats.status, "open"));

    // API usage (graceful fallback if table not yet created)
    let apiLogs: Array<{ totalTokens: number; inputTokens: number; outputTokens: number }> = [];
    try {
      apiLogs = await db.query.apiCallLogs.findMany();
    } catch { /* table may not exist yet — migration pending */ }
    const totalApiTokens = apiLogs.reduce((s, l) => s + l.totalTokens, 0);
    const apiInputTokens = apiLogs.reduce((s, l) => s + l.inputTokens, 0);
    const apiOutputTokens = apiLogs.reduce((s, l) => s + l.outputTokens, 0);
    const apiCostRub = (apiInputTokens / 1000) * YANDEX_INPUT_PRICE_PER_1K + (apiOutputTokens / 1000) * YANDEX_OUTPUT_PRICE_PER_1K;

    return {
      users: {
        total: totalUsers.count,
        new30d: newUsers30d.count,
        new7d: newUsers7d.count,
        admins: adminCount.count,
        active30d: activeUserIds.size,
      },
      processes: {
        total: totalProcesses.count,
        active: activeProcesses.count,
      },
      revenue: {
        totalKopecks: totalRevenue,
        month30dKopecks: revenue30d,
        week7dKopecks: revenue7d,
        confirmedCount: confirmedPayments.length,
      },
      tokens: {
        sold: tokensSold,
        sold30d: tokensSold30d,
        consumed,
        consumed30d,
      },
      api: {
        totalTokens: totalApiTokens,
        inputTokens: apiInputTokens,
        outputTokens: apiOutputTokens,
        costRub: Math.round(apiCostRub * 100) / 100,
        costUsd: Math.round((apiCostRub / USD_RATE) * 10000) / 10000,
        trackedCalls: apiLogs.length,
      },
      support: {
        openChats: openChats.count,
      },
    };
  }),

  // ── Analytics: Token Economics ────────────────────────────────────
  getTokenEconomics: adminProcedure.query(async () => {
    const allOps = await db.query.tokenOperations.findMany({ orderBy: desc(tokenOperations.createdAt) });
    const confirmedPayments = await db.query.payments.findMany({ where: eq(payments.status, "confirmed") });

    // Consumption by operation type
    const byType: Record<string, number> = {};
    for (const op of allOps.filter(o => o.amount < 0)) {
      byType[op.type] = (byType[op.type] ?? 0) + Math.abs(op.amount);
    }

    // API usage by operation type (graceful fallback if table not created yet)
    let apiLogs: Array<{ operationType: string; inputTokens: number; outputTokens: number }> = [];
    try {
      apiLogs = await db.query.apiCallLogs.findMany({ orderBy: desc(apiCallLogs.createdAt) });
    } catch { /* table may not exist yet */ }
    const apiByType: Record<string, { inputTokens: number; outputTokens: number; calls: number }> = {};
    for (const log of apiLogs) {
      if (!apiByType[log.operationType]) apiByType[log.operationType] = { inputTokens: 0, outputTokens: 0, calls: 0 };
      apiByType[log.operationType].inputTokens += log.inputTokens;
      apiByType[log.operationType].outputTokens += log.outputTokens;
      apiByType[log.operationType].calls += 1;
    }

    // Total tokens in circulation
    const allUsers = await db.query.users.findMany({ columns: { tokenBalance: true } });
    const totalBalances = allUsers.reduce((s, u) => s + u.tokenBalance, 0);

    const totalSold = confirmedPayments.reduce((s, p) => s + p.tokensCredited, 0);
    const totalConsumed = allOps.filter(o => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0);
    const totalRevenue = confirmedPayments.reduce((s, p) => s + p.amount, 0);

    // API cost
    const totalInput = apiLogs.reduce((s, l) => s + l.inputTokens, 0);
    const totalOutput = apiLogs.reduce((s, l) => s + l.outputTokens, 0);
    const totalApiCostRub = (totalInput / 1000) * YANDEX_INPUT_PRICE_PER_1K + (totalOutput / 1000) * YANDEX_OUTPUT_PRICE_PER_1K;

    // Revenue per site-token: how much RUB each sold token is worth
    const revenuePerToken = totalSold > 0 ? (totalRevenue / 100) / totalSold : 0; // in RUB

    // API cost per consumed site-token
    const apiCostPerConsumedToken = totalConsumed > 0 ? totalApiCostRub / totalConsumed : 0;

    // Gross margin on AI cost (only for operations with tracked API calls)
    const trackedRevenue = totalApiCostRub > 0 ? (totalRevenue / 100) : 0;
    const grossMargin = trackedRevenue > 0 ? ((trackedRevenue - totalApiCostRub) / trackedRevenue) * 100 : null;

    return {
      siteTokens: {
        sold: totalSold,
        consumed: totalConsumed,
        remainingBalances: totalBalances,
        byType,
      },
      apiTokens: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalCostRub: Math.round(totalApiCostRub * 100) / 100,
        totalCostUsd: Math.round((totalApiCostRub / USD_RATE) * 10000) / 10000,
        byType: apiByType,
        trackedCalls: apiLogs.length,
        pricingInfo: {
          inputPer1k: YANDEX_INPUT_PRICE_PER_1K,
          outputPer1k: YANDEX_OUTPUT_PRICE_PER_1K,
          usdRate: USD_RATE,
        },
      },
      economics: {
        revenueRub: Math.round(totalRevenue / 100),
        apiCostRub: Math.round(totalApiCostRub * 100) / 100,
        revenuePerSiteToken: Math.round(revenuePerToken * 1000) / 1000,
        apiCostPerSiteToken: Math.round(apiCostPerConsumedToken * 10000) / 10000,
        grossMarginPct: grossMargin !== null ? Math.round(grossMargin * 10) / 10 : null,
      },
    };
  }),

  // ── Analytics: Growth Chart (last 30 days) ────────────────────────
  getGrowthData: adminProcedure.query(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentUsers = await db.query.users.findMany({
      where: gte(users.createdAt, thirtyDaysAgo),
      columns: { createdAt: true },
    });
    const recentPayments = await db.query.payments.findMany({
      where: and(eq(payments.status, "confirmed"), gte(payments.createdAt, thirtyDaysAgo)),
      columns: { createdAt: true, amount: true },
    });
    const recentOps = await db.query.tokenOperations.findMany({
      where: and(sql`${tokenOperations.amount} < 0`, gte(tokenOperations.createdAt, thirtyDaysAgo)),
      columns: { createdAt: true, amount: true },
    });

    // Build day-by-day buckets for last 30 days
    const days: Array<{
      date: string;
      newUsers: number;
      revenue: number; // RUB
      tokensConsumed: number;
    }> = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({
        date: dateStr,
        newUsers: recentUsers.filter(u => u.createdAt.toISOString().slice(0, 10) === dateStr).length,
        revenue: recentPayments
          .filter(p => p.createdAt.toISOString().slice(0, 10) === dateStr)
          .reduce((s, p) => s + Math.round(p.amount / 100), 0),
        tokensConsumed: recentOps
          .filter(o => o.createdAt.toISOString().slice(0, 10) === dateStr)
          .reduce((s, o) => s + Math.abs(o.amount), 0),
      });
    }

    return { days };
  }),

  // Test Claude API connectivity
  testAI: adminProcedure.mutation(async () => {
    const apiKey = process.env.CLAUDE_API_KEY ?? "";
    if (!apiKey) return { ok: false, error: "CLAUDE_API_KEY не задан в env" };
    try {
      const client = new Anthropic({ apiKey });
      const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
      const response = await client.messages.create({
        model,
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });
      const text = response.content.find(b => b.type === "text")?.text ?? "";
      return { ok: true, model, reply: text, inputTokens: response.usage.input_tokens };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }),

  // List companies and interviews for a specific user
  getUserDetail: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const userCompanies = await db.query.companies.findMany({
        where: eq(companies.userId, input.userId),
        orderBy: desc(companies.createdAt),
      });
      const companyIds = userCompanies.map(c => c.id);
      const userInterviews = companyIds.length > 0
        ? await db.query.interviews.findMany({
            where: sql`${interviews.companyId} = ANY(${sql.raw("ARRAY[" + companyIds.join(",") + "]::int[]")})`,
            orderBy: desc(interviews.createdAt),
          })
        : [];
      const userProcesses = companyIds.length > 0
        ? await db.query.processes.findMany({
            where: sql`${processes.companyId} = ANY(${sql.raw("ARRAY[" + companyIds.join(",") + "]::int[]")})`,
            orderBy: desc(processes.createdAt),
          })
        : [];
      return {
        companies: userCompanies.map(c => ({ id: c.id, name: c.name, industry: c.industry, createdAt: c.createdAt })),
        interviews: userInterviews.map(i => ({ id: i.id, companyId: i.companyId, mode: i.mode, status: i.status, completionPercent: i.completionPercent, createdAt: i.createdAt })),
        processes: userProcesses.map(p => ({ id: p.id, companyId: p.companyId, status: p.status, createdAt: p.createdAt })),
      };
    }),
});
