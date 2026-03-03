import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const interviewModeEnum = pgEnum("interview_mode", ["full", "express"]);
export const interviewStatusEnum = pgEnum("interview_status", ["draft", "completed"]);
export const processStatusEnum = pgEnum("process_status", ["draft", "active", "archived"]);
export const changeRequestStatusEnum = pgEnum("change_request_status", ["pending", "applied", "rejected"]);
// Note: recommendation_category changed from enum to text to avoid migration issues
export const recommendationPriorityEnum = pgEnum("recommendation_priority", ["high", "medium", "low"]);
export const supportChatStatusEnum = pgEnum("support_chat_status", ["open", "closed"]);
export const senderRoleEnum = pgEnum("sender_role", ["user", "admin"]);
export const tokenOperationTypeEnum = pgEnum("token_operation_type", [
  "generation",
  "regeneration",
  "change_request",
  "recommendations",
  "transcription",
  "topup",
]);

// Users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  tokenBalance: integer("token_balance").notNull().default(5000),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  companies: many(companies),
  tokenOperations: many(tokenOperations),
  supportChats: many(supportChats),
}));

// Companies
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 255 }).notNull(),
  description: text("description"),
  contactInfo: text("contact_info"),
  logoUrl: varchar("logo_url", { length: 1024 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companiesRelations = relations(companies, ({ one, many }) => ({
  user: one(users, { fields: [companies.userId], references: [users.id] }),
  interviews: many(interviews),
  processes: many(processes),
  documents: many(documents),
}));

// Interviews
export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  mode: interviewModeEnum("mode").notNull().default("full"),
  status: interviewStatusEnum("status").notNull().default("draft"),
  answers: jsonb("answers").notNull().default({}),
  completionPercent: integer("completion_percent").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const interviewsRelations = relations(interviews, ({ one }) => ({
  company: one(companies, { fields: [interviews.companyId], references: [companies.id] }),
  process: one(processes),
}));

// Processes
export const processes = pgTable("processes", {
  id: serial("id").primaryKey(),
  interviewId: integer("interview_id")
    .notNull()
    .references(() => interviews.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  status: processStatusEnum("status").notNull().default("draft"),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const processesRelations = relations(processes, ({ one, many }) => ({
  interview: one(interviews, { fields: [processes.interviewId], references: [interviews.id] }),
  company: one(companies, { fields: [processes.companyId], references: [companies.id] }),
  versions: many(processVersions),
  changeRequests: many(changeRequests),
  recommendations: many(recommendations),
}));

// Process Versions
export const processVersions = pgTable("process_versions", {
  id: serial("id").primaryKey(),
  processId: integer("process_id")
    .notNull()
    .references(() => processes.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const processVersionsRelations = relations(processVersions, ({ one }) => ({
  process: one(processes, { fields: [processVersions.processId], references: [processes.id] }),
}));

// Change Requests
export const changeRequests = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  processId: integer("process_id")
    .notNull()
    .references(() => processes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: changeRequestStatusEnum("status").notNull().default("pending"),
  previousData: jsonb("previous_data").notNull(),
  newData: jsonb("new_data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  process: one(processes, { fields: [changeRequests.processId], references: [processes.id] }),
}));

// Recommendations
export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  processId: integer("process_id")
    .notNull()
    .references(() => processes.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),
  priority: recommendationPriorityEnum("priority").notNull().default("medium"),
  relatedSteps: jsonb("related_steps").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  process: one(processes, { fields: [recommendations.processId], references: [processes.id] }),
}));

// Documents
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 1024 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentsRelations = relations(documents, ({ one }) => ({
  company: one(companies, { fields: [documents.companyId], references: [companies.id] }),
}));

// Support Chats
export const supportChats = pgTable("support_chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: supportChatStatusEnum("status").notNull().default("open"),
  subject: varchar("subject", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportChatsRelations = relations(supportChats, ({ one, many }) => ({
  user: one(users, { fields: [supportChats.userId], references: [users.id] }),
  messages: many(supportMessages),
}));

// Support Messages
export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id")
    .notNull()
    .references(() => supportChats.id, { onDelete: "cascade" }),
  senderId: integer("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  senderRole: senderRoleEnum("sender_role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  chat: one(supportChats, { fields: [supportMessages.chatId], references: [supportChats.id] }),
  sender: one(users, { fields: [supportMessages.senderId], references: [users.id] }),
}));

// FAQ Articles
export const faqArticles = pgTable("faq_articles", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  keywords: jsonb("keywords").notNull().default([]),
  category: varchar("category", { length: 100 }).notNull(),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Token Operations
export const tokenOperations = pgTable("token_operations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: tokenOperationTypeEnum("type").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tokenOperationsRelations = relations(tokenOperations, ({ one }) => ({
  user: one(users, { fields: [tokenOperations.userId], references: [users.id] }),
}));

// ===== Consent & Privacy =====

export const consentTypeEnum = pgEnum("consent_type", [
  "privacy_policy",
  "personal_data",
  "cookie_policy",
  "marketing",
]);

export const consentActionEnum = pgEnum("consent_action", [
  "granted",
  "revoked",
]);

// Policy versions — for versioning policy texts
export const policyVersions = pgTable("policy_versions", {
  id: serial("id").primaryKey(),
  policyType: varchar("policy_type", { length: 50 }).notNull(), // "privacy" | "cookie"
  version: integer("version").notNull().default(1),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User consents — records of each consent given/revoked
export const userConsents = pgTable("user_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  consentType: consentTypeEnum("consent_type").notNull(),
  action: consentActionEnum("action").notNull(),
  policyVersion: integer("policy_version"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  revokeReason: text("revoke_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userConsentsRelations = relations(userConsents, ({ one }) => ({
  user: one(users, { fields: [userConsents.userId], references: [users.id] }),
}));

// Cookie consent settings — anonymous or user-based cookie preferences
export const cookieConsents = pgTable("cookie_consents", {
  id: serial("id").primaryKey(),
  visitorId: varchar("visitor_id", { length: 255 }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  functional: boolean("functional").notNull().default(false),
  analytics: boolean("analytics").notNull().default(false),
  marketing: boolean("marketing").notNull().default(false),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cookieConsentsRelations = relations(cookieConsents, ({ one }) => ({
  user: one(users, { fields: [cookieConsents.userId], references: [users.id] }),
}));
