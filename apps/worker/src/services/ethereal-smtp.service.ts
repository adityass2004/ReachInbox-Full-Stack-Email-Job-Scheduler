import nodemailer, { Transporter } from "nodemailer";
import { logger } from "../logger.js";

export interface SendMailOptions {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  etherealCredentials?: {
    host?: string | null;
    port?: number | null;
    user?: string | null;
    password?: string | null;
  };
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | null;
}

class EtherealSmtpService {
  private cachedTransporter: Transporter | null = null;
  private cachedUser: string | null = null;

  /**
   * Retrieves or constructs a nodemailer transporter for Ethereal SMTP.
   * If credentials are not provided via DB or env, creates an ephemeral test account.
   */
  async getTransporter(
    customCreds?: SendMailOptions["etherealCredentials"],
  ): Promise<Transporter> {
    const host =
      customCreds?.host || process.env.ETHEREAL_HOST || "smtp.ethereal.email";
    const port =
      customCreds?.port || parseInt(process.env.ETHEREAL_PORT || "587", 10);
    const user = customCreds?.user || process.env.ETHEREAL_USER;
    const pass = customCreds?.password || process.env.ETHEREAL_PASSWORD;

    // Use cached transporter if credentials match
    if (this.cachedTransporter && this.cachedUser === (user || "ephemeral")) {
      return this.cachedTransporter;
    }

    if (user && pass) {
      this.cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.cachedUser = user;
      return this.cachedTransporter;
    }

    // Auto-generate test account if credentials are not configured yet
    logger.info(
      "SMTP_TEST_ACCOUNT",
      "No static Ethereal credentials provided. Generating test account...",
    );
    const testAccount = await nodemailer.createTestAccount();

    this.cachedTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    this.cachedUser = testAccount.user;

    logger.info(
      "SMTP_TEST_ACCOUNT_CREATED",
      `Ethereal test account ready: ${testAccount.user}`,
    );
    return this.cachedTransporter;
  }

  /**
   * Sends an email through Ethereal SMTP and resolves the Ethereal preview URL.
   */
  async sendEmail(options: SendMailOptions): Promise<SendMailResult> {
    const transporter = await this.getTransporter(options.etherealCredentials);

    const info = await transporter.sendMail({
      from: `"${options.fromName}" <${options.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    const rawUrl = nodemailer.getTestMessageUrl(info);
    const previewUrl = rawUrl ? String(rawUrl) : null;

    return {
      messageId: info.messageId,
      previewUrl,
    };
  }

  /**
   * Identifies transient SMTP/network errors that should be retried with backoff.
   */
  isTransientError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const err = error as Record<string, unknown>;
    const code = String(err.code || "");
    const message = String(err.message || "").toLowerCase();
    const responseCode = Number(err.responseCode || 0);

    // Network / Socket errors
    const transientCodes = [
      "ECONNRESET",
      "ETIMEDOUT",
      "ESOCKET",
      "EAI_AGAIN",
      "ECONNREFUSED",
    ];
    if (transientCodes.includes(code)) return true;

    // Temporary SMTP 4xx codes (e.g. 421 Service not available, 450 Mailbox busy)
    if (responseCode >= 400 && responseCode < 500) return true;

    // Common temporary error phrases
    if (
      message.includes("timeout") ||
      message.includes("connection closed") ||
      message.includes("temporarily unavailable") ||
      message.includes("rate limit") ||
      message.includes("try again later")
    ) {
      return true;
    }

    return false;
  }
}

export const etherealSmtpService = new EtherealSmtpService();
