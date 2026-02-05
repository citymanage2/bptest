import { z } from "zod";
import { eq, desc, like, or, sql } from "drizzle-orm";
import { router, adminProcedure } from "../trpc";
import { db } from "../db";
import { users, supportChats, supportMessages, faqArticles, tokenOperations, processes, companies } from "../db/schema";
import type { ProcessData } from "@shared/types";

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
});
