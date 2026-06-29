import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp,
    },
  },
}));

import { AuthPage } from "../pages/AuthPage";

describe("email signup", () => {
  beforeEach(() => {
    signUp.mockReset();
    signUp.mockResolvedValue({
      data: { session: null, user: { id: "new-user" } },
      error: null,
    });
    window.history.replaceState({}, "", "/revenue-auditor/login/?mode=signup");
  });

  it("allows a completed signup form to create an account", async () => {
    render(
      <AuthPage
        identity={{
          session: null,
          profile: null,
          workspaces: [],
          refresh: vi.fn(),
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Taylor Morgan" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "taylor@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: "correct-horse-battery-staple" },
    });
    fireEvent.click(screen.getByRole("checkbox"));

    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: "taylor@example.com",
        password: "correct-horse-battery-staple",
        options: expect.objectContaining({
          data: {
            display_name: "Taylor Morgan",
            consent_version: "2026-06-28",
          },
        }),
      }),
    );
    expect(
      await screen.findByText("Check your email to confirm the account."),
    ).toBeVisible();
  });
});
