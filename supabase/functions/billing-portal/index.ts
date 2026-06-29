import {
  authenticatedContext,
  errorResponse,
  handleOptions,
  json,
  requireWorkspaceRole,
} from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { workspaceId } = await request.json();
    const { userClient, admin } = await authenticatedContext(request);
    await requireWorkspaceRole(userClient, workspaceId, ["owner"]);
    const { data: subscription, error } = await admin.from("subscriptions")
      .select("stripe_customer_id").eq("workspace_id", workspaceId).single();
    if (error || !subscription?.stripe_customer_id) {
      throw new Error("No Stripe customer exists for this workspace");
    }
    const response = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: subscription.stripe_customer_id,
          return_url: `${Deno.env.get("APP_URL")}app/?view=billing`,
        }),
      },
    );
    const session = await response.json();
    if (!response.ok || !session.url) {
      throw new Error("Stripe billing portal could not be created");
    }
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
});
