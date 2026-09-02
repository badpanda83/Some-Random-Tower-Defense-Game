import { describe, expect, it } from "vitest";

import { magicLinkSignInInput } from "./auth.js";

describe("magic-link client configuration", () => {
  it("returns to the current trusted application origin", () => {
    expect(
      magicLinkSignInInput("hero@example.com", "https://game.example"),
    ).toEqual({
      email: "hero@example.com",
      name: "Linked Adventurer",
      callbackURL: "https://game.example/",
    });
  });
});
