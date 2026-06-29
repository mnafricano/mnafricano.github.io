import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";

function priceId(plan: "solo" | "team", interval: "month" | "year"): string {
  const key = `STRIPE_${plan.toUpperCase()}_${
    interval === "month" ? "MONTHLY" : "ANNUAL"
  }_PRICE_ID`;
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { workspaceId, plan, interval } = await request.json();
    if (
      !workspaceId || !["solo", "team"].includes(plan) ||
      !["month", "year"].includes(interval)
    ) {
      throw new Error("Valid workspaceId, plan, and interval are required");
    }
    const { user, userClient, admin } = await authenticatedContext(request);
    await requireWorkspaceRole(userClient, workspaceId, ["owner"]);
    const { data: subscription } = await admin.from("subscriptions").select("*")
      .eq("workspace_id", workspaceId).single();
    const appUrl = Deno.env.get("APP_URL")!;
    const body: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": priceId(plan, interval),
      "line_items[0][quantity]": "1",
      success_url: `${appUrl}app/?view=billing&checkout=success`,
      cancel_url: `${appUrl}app/?view=billing&checkout=canceled`,
      client_reference_id: workspaceId,
      "metadata[workspace_id]": workspaceId,
      "metadata[plan_code]": plan,
      "subscription_data[metadata][workspace_id]": workspaceId,
      "subscription_data[metadata][plan_code]": plan,
      allow_promotion_codes: "true",
    };
    if (subscription?.stripe_customer_id) {
      body.customer = subscription.stripe_customer_id;
    } else body.customer_email = user.email!;
    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `checkout:${workspaceId}:${plan}:${interval}:${
            Math.floor(Date.now() / 300_000)
          }`,
        },
        body: new URLSearchParams(body),
      },
    );
    const session = await response.json();
    if (!response.ok || !session.url) {
      throw new Error("Stripe Checkout could not be created");
    }
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
});
