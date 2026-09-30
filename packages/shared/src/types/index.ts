import { EmailStatus } from "../constants/index.js";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

export interface EmailJobPayload {
  emailId: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  idempotencyKey: string;
  status?: EmailStatus;
  batchId?: string;
  rescheduleCount?: number;
}

export interface ScheduleBatchRequest {
  senderEmail: string;
  recipients: string[];
  subject: string;
  body: string;
  startTime: string; // ISO date string
  delayBetweenEmailsMs?: number;
  hourlyLimit?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: string;
}
