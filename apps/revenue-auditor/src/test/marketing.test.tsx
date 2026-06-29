import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketingPage } from "../pages/MarketingPage";

describe("public product", () => {
  it("publishes pricing and the decision-support boundary", () => {
    render(
      <MarketingPage
        identity={{
          session: null,
          profile: null,
          workspaces: [],
          refresh: async () => undefined,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Find the money/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("$39")).toBeInTheDocument();
    expect(screen.getByText("$129")).toBeInTheDocument();
    expect(
      screen.getAllByText(/not accounting or legal advice/i).length,
    ).toBeGreaterThan(0);
  });
});
