import { anonymousClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [anonymousClient(), magicLinkClient()],
});

export async function ensureGuestSession(): Promise<void> {
  const current = await authClient.getSession();
  if (current.data) {
    return;
  }

  const created = await authClient.signIn.anonymous();
  if (created.error) {
    throw new Error(
      created.error.message ?? "Could not create a guest session",
    );
  }
}

export async function sendMagicLink(email: string): Promise<void> {
  const response = await authClient.signIn.magicLink({
    email,
    name: "Linked Adventurer",
    callbackURL: `${window.location.origin}/`,
  });
  if (response.error) {
    throw new Error(response.error.message ?? "Could not send the magic link");
  }
}
