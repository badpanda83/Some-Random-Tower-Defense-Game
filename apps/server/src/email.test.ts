import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "./config.js";
import {
  createEmailSender,
  EmailDeliveryError,
  type EmailLogger,
} from "./email.js";

const resendConfig: Extract<AppConfig["email"], { provider: "resend" }> = {
  provider: "resend",
  apiKey: "re_super_secret",
  from: "The Dubious Realm <noreply@mail.dubiousrealm.com>",
  timeoutMs: 1_000,
};

const magicLink = {
  email: "hero@example.com",
  url: "https://game.example/api/auth/magic-link/verify?token=secret-token",
};

function recordingLogger() {
  const entries: Array<{
    details: Record<string, unknown>;
    message: string;
  }> = [];
  const logger: EmailLogger = {
    error(details, message) {
      entries.push({ details, message });
    },
  };
  return { entries, logger };
}

describe("magic-link email delivery", () => {
  let smtpServer: Server | undefined;

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!smtpServer) {
          resolve();
          return;
        }
        smtpServer.close((error) => (error ? reject(error) : resolve()));
        smtpServer = undefined;
      }),
  );

  it("sends through the Resend HTTPS API", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
      );
    const { entries, logger } = recordingLogger();

    await createEmailSender(resendConfig, {
      fetch: fetchImplementation,
      logger,
    }).sendMagicLink(magicLink);

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, request] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(request).toMatchObject({ method: "POST" });
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer re_super_secret",
    );
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: resendConfig.from,
      to: [magicLink.email],
      text: expect.stringContaining(magicLink.url),
    });
    expect(entries).toEqual([]);
  });

  it("surfaces provider failures without logging secrets or magic URLs", async () => {
    const { entries, logger } = recordingLogger();
    const sender = createEmailSender(resendConfig, {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("provider details", { status: 422 })),
      logger,
    });

    await expect(sender.sendMagicLink(magicLink)).rejects.toEqual(
      new EmailDeliveryError(),
    );

    expect(entries).toEqual([
      {
        details: {
          event: "magic_link_email_delivery_failed",
          kind: "provider_error",
          provider: "resend",
          status: 422,
        },
        message: "Magic-link email delivery failed",
      },
    ]);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(resendConfig.apiKey);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain(magicLink.url);
  });

  it("aborts a hung Resend request at the configured timeout", async () => {
    vi.useFakeTimers();
    const { entries, logger } = recordingLogger();
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const delivery = createEmailSender(resendConfig, {
      fetch: fetchImplementation,
      logger,
    }).sendMagicLink(magicLink);
    const rejection = expect(delivery).rejects.toEqual(
      new EmailDeliveryError(),
    );

    await vi.advanceTimersByTimeAsync(resendConfig.timeoutMs);
    await rejection;
    expect(entries[0]?.details).toMatchObject({
      provider: "resend",
      kind: "timeout",
    });
    vi.useRealTimers();
  });

  it("retains SMTP delivery for local Mailpit development", async () => {
    let message = "";
    smtpServer = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.write("220 mailpit.test ESMTP\r\n");
      socket.on("data", (chunk: string) => {
        message += chunk;
        const command = chunk.toUpperCase();
        if (command.startsWith("EHLO")) {
          socket.write("250-mailpit.test\r\n250 OK\r\n");
        } else if (
          command.startsWith("MAIL FROM") ||
          command.startsWith("RCPT TO")
        ) {
          socket.write("250 OK\r\n");
        } else if (command.startsWith("DATA")) {
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (chunk.includes("\r\n.\r\n")) {
          socket.write("250 Queued\r\n");
        } else if (command.startsWith("QUIT")) {
          socket.end("221 Bye\r\n");
        }
      });
    });
    await new Promise<void>((resolve) =>
      smtpServer!.listen(0, "127.0.0.1", resolve),
    );
    const address = smtpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("SMTP test server did not bind to a TCP port");
    }

    await createEmailSender({
      provider: "smtp",
      host: "127.0.0.1",
      port: address.port,
      secure: false,
      from: "local@example.test",
      timeoutMs: 1_000,
    }).sendMagicLink(magicLink);

    expect(message).toContain("RCPT TO:<hero@example.com>");
    expect(message).toContain("Your portal to The Dubious Realm");
  });
});
