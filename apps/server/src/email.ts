import nodemailer from "nodemailer";

import type { AppConfig } from "./config.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const SUBJECT = "Your portal to The Dubious Realm";
const SAFE_DELIVERY_ERROR =
  "We couldn't send the magic link. Please try again in a moment.";

type EmailConfig = AppConfig["email"];

export interface EmailLogger {
  error(details: Record<string, unknown>, message: string): void;
}

interface EmailDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly logger?: EmailLogger;
}

export interface MagicLinkMessage {
  readonly email: string;
  readonly url: string;
}

export interface EmailSender {
  sendMagicLink(message: MagicLinkMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor() {
    super(SAFE_DELIVERY_ERROR);
    this.name = "EmailDeliveryError";
  }
}

const defaultLogger: EmailLogger = {
  error(details, message) {
    process.stderr.write(
      `${JSON.stringify({ level: "error", message, ...details })}\n`,
    );
  },
};

function emailContent(url: string) {
  const escapedUrl = url
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return {
    subject: SUBJECT,
    text: `Open this one-use portal within ten minutes:\n\n${url}\n\nIf you did not request it, ignore this message.`,
    html: `<p>Open this one-use portal within ten minutes:</p><p><a href="${escapedUrl}">Enter The Dubious Realm</a></p><p>If you did not request it, ignore this message.</p>`,
  };
}

function reportFailure(
  logger: EmailLogger,
  provider: EmailConfig["provider"],
  kind: "provider_error" | "timeout",
  status?: number,
) {
  logger.error(
    {
      event: "magic_link_email_delivery_failed",
      provider,
      kind,
      ...(status === undefined ? {} : { status }),
    },
    "Magic-link email delivery failed",
  );
}

function createResendSender(
  config: Extract<EmailConfig, { provider: "resend" }>,
  fetchImplementation: typeof globalThis.fetch,
  logger: EmailLogger,
): EmailSender {
  return {
    async sendMagicLink({ email, url }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImplementation(RESEND_EMAILS_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [email],
            ...emailContent(url),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          reportFailure(
            logger,
            config.provider,
            "provider_error",
            response.status,
          );
          throw new EmailDeliveryError();
        }
      } catch (error) {
        if (error instanceof EmailDeliveryError) {
          throw error;
        }
        reportFailure(
          logger,
          config.provider,
          controller.signal.aborted ? "timeout" : "provider_error",
        );
        throw new EmailDeliveryError();
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function createSmtpSender(
  config: Extract<EmailConfig, { provider: "smtp" }>,
  logger: EmailLogger,
): EmailSender {
  return {
    async sendMagicLink({ email, url }) {
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        connectionTimeout: config.timeoutMs,
        greetingTimeout: config.timeoutMs,
        socketTimeout: config.timeoutMs,
        dnsTimeout: config.timeoutMs,
        ...(config.user && config.password
          ? { auth: { user: config.user, pass: config.password } }
          : {}),
      });
      let didTimeout = false;
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          transport.sendMail({
            from: config.from,
            to: email,
            ...emailContent(url),
          }),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              didTimeout = true;
              transport.close();
              reject(new EmailDeliveryError());
            }, config.timeoutMs);
          }),
        ]);
      } catch {
        reportFailure(
          logger,
          config.provider,
          didTimeout ? "timeout" : "provider_error",
        );
        throw new EmailDeliveryError();
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        transport.close();
      }
    },
  };
}

export function createEmailSender(
  config: EmailConfig,
  dependencies: EmailDependencies = {},
): EmailSender {
  const logger = dependencies.logger ?? defaultLogger;
  return config.provider === "resend"
    ? createResendSender(config, dependencies.fetch ?? globalThis.fetch, logger)
    : createSmtpSender(config, logger);
}
