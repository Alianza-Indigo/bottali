import "server-only";
import { getEnv } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Default provider: logs to stdout. Never fails, never sends anything real — safe by default. */
class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log("[email:console]", JSON.stringify({ to: message.to, subject: message.subject }));
    console.log(message.text);
  }
}

/** Real SMTP delivery, gated behind EMAIL_PROVIDER=smtp and full SMTP_* configuration. */
class SmtpEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const env = getEnv();
    if (!env.SMTP_HOST || !env.SMTP_USERNAME || !env.SMTP_PASSWORD) {
      throw new Error("EMAIL_PROVIDER=smtp requiere SMTP_HOST, SMTP_USERNAME y SMTP_PASSWORD.");
    }
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD },
    });
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getEnv();
  cached = env.EMAIL_PROVIDER === "smtp" ? new SmtpEmailProvider() : new ConsoleEmailProvider();
  return cached;
}
