// ============================================
// Business Process Builder - Shared Types
// ============================================

// --- User & Auth ---
export interface User {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  tokenBalance: number;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// --- Company ---
export interface Company {
  id: number;
  userId: number;
  name: string;
  industry: string;
  description: string | null;
  contactInfo: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Interview ---
export type InterviewMode = "full" | "express";

export interface InterviewQuestion {
  id: string;
  block: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  blockName: string;
  question: string;
  required: boolean;
  expressMode: boolean;
  order: number;
}

export interface Interview {
  id: number;
  companyId: number;
  mode: InterviewMode;
  status: "draft" | "completed";
  answers: Record<string, string>;
  completionPercent: number;
  createdAt: string;
  updatedAt: string;
}

// --- Process ---
export type BlockType = "start" | "action" | "product" | "decision" | "split" | "end";

export interface ProcessBlock {
  id: string;
  name: string;
  description: string;
  type: BlockType;
  role: string;
  stage: string;
  timeEstimate?: string;
  inputDocuments?: string[];
  outputDocuments?: string[];
  infoSystems?: string[];
  funnelStage?: string;
  connections: string[]; // IDs of next blocks
  conditionLabel?: string; // For decision branches
  isDefault?: boolean; // Default branch from decision
  position?: { x: number; y: number };
}

export interface ProcessRole {
  id: string;
  name: string;
  description: string;
  department?: string;
  color: string;
}

export interface ProcessStage {
  id: string;
  name: string;
  order: number;
}

export interface ProcessData {
  name: string;
  goal: string;
  owner: string;
  startEvent: string;
  endEvent: string;
  roles: ProcessRole[];
  stages: ProcessStage[];
  blocks: ProcessBlock[];
}

export interface Process {
  id: number;
  interviewId: number;
  companyId: number;
  status: "draft" | "active" | "archived";
  data: ProcessData;
  createdAt: string;
  updatedAt: string;
}

// --- Process Versions ---
export interface ProcessVersion {
  id: number;
  processId: number;
  data: ProcessData;
  description: string;
  createdAt: string;
}

// --- Change Requests ---
export interface ChangeRequest {
  id: number;
  processId: number;
  description: string;
  status: "pending" | "applied" | "rejected";
  previousData: ProcessData;
  newData: ProcessData;
  createdAt: string;
}

// --- Recommendations ---
export interface Recommendation {
  id: number;
  processId: number;
  category: "ai" | "crm" | "chatbot" | "spreadsheet" | "1c";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  relatedSteps: string[];
}

export interface CrmFunnel {
  id: string;
  name: string;
  variant: number;
  stages: CrmFunnelStage[];
}

export interface CrmFunnelStage {
  id: string;
  name: string;
  order: number;
  relatedBlockIds: string[];
  automations: string[];
  conversionTarget?: number;
}

// --- Process Metrics ---
export interface ProcessMetrics {
  totalTime: string;
  criticalPath: string;
  handoffs: number;
  decisionPoints: number;
  roles: number;
  steps: number;
}

// --- Documents ---
export interface Document {
  id: number;
  companyId: number;
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

// --- Support ---
export interface SupportMessage {
  id: number;
  chatId: number;
  senderId: number;
  senderRole: "user" | "admin";
  content: string;
  createdAt: string;
}

export interface SupportChat {
  id: number;
  userId: number;
  status: "open" | "closed";
  subject: string;
  createdAt: string;
  updatedAt: string;
}

// --- FAQ ---
export interface FaqArticle {
  id: number;
  title: string;
  content: string;
  keywords: string[];
  category: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Token Operations ---
export interface TokenOperation {
  id: number;
  userId: number;
  amount: number;
  type: "generation" | "regeneration" | "change_request" | "recommendations" | "transcription" | "topup";
  description: string;
  createdAt: string;
}

// Token costs
export const TOKEN_COSTS = {
  generation: 1000,
  regeneration: 1000,
  change_request: 500,
  recommendations: 200,
  transcription_per_minute: 10,
} as const;

// Block visual config
export const BLOCK_CONFIG: Record<BlockType, { shape: string; borderColor: string; label: string }> = {
  start: { shape: "pill", borderColor: "#22c55e", label: "Начало" },
  action: { shape: "hexagon", borderColor: "#000000", label: "Действие" },
  product: { shape: "rounded-rect", borderColor: "#000000", label: "Результат" },
  decision: { shape: "diamond", borderColor: "#3b82f6", label: "Решение" },
  split: { shape: "triangle", borderColor: "#3b82f6", label: "Разделение" },
  end: { shape: "double-rect", borderColor: "#ef4444", label: "Конец" },
};

// Swimlane colors — 12 distinct pastel tones for many-role diagrams
export const SWIMLANE_COLORS = [
  "#e9d5ff", // purple
  "#bfdbfe", // blue
  "#bbf7d0", // green
  "#fef08a", // yellow
  "#fed7aa", // orange
  "#fecdd3", // pink
  "#c7d2fe", // indigo
  "#a5f3fc", // cyan
  "#d9f99d", // lime
  "#fcd6bb", // peach
  "#e2e8f0", // slate
  "#ddd6fe", // violet
];
