import { z } from 'zod';
import { EmailStatus, sanitizeAndDeduplicateEmails, sanitizeEmailContent } from '@reachinbox/shared';

export const scheduleEmailSchema = z.object({
  campaignTitle: z.string().optional(),
  senderEmail: z.string().email('Valid sender email is required'),
  senderName: z.string().optional(),
  senderId: z.string().uuid().optional(),
  recipients: z
    .array(z.string())
    .min(1, 'At least one recipient email is required')
    .transform((emails) => sanitizeAndDeduplicateEmails(emails))
    .refine((emails) => emails.length > 0, {
      message: 'At least one valid recipient email is required after sanitization',
    }),
  subject: z.string().min(1, 'Subject cannot be empty').max(998, 'Subject too long'),
  body: z.string().min(1, 'Email body cannot be empty').transform(sanitizeEmailContent),
  startTime: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional()
    .transform((val) => (val ? new Date(val) : new Date())),
  delayBetweenEmailsMs: z.number().int().min(0).default(2000),
  hourlyLimit: z.number().int().min(1).max(50000).optional(),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;

export const getScheduledEmailsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  senderId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type GetScheduledEmailsQuery = z.infer<typeof getScheduledEmailsQuerySchema>;

export const searchEmailsQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  status: z.nativeEnum(EmailStatus).optional(),
  statuses: z.preprocess(
    (value) => typeof value === 'string' ? value.split(',').map((status) => status.trim()).filter(Boolean) : value,
    z.array(z.nativeEnum(EmailStatus)).max(6).optional(),
  ),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});

export type SearchEmailsQuery = z.infer<typeof searchEmailsQuerySchema>;
