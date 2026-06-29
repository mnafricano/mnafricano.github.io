import { adminClient, errorResponse, json } from "../_shared/http.ts";

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function verifySignature(
  payload: string,
  signature: string,
): Promise<void> {
  const parts = Object.fromEntries(
    signature.split(",").map((item) => item.split("=", 2)),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    throw new Error("Expired webhook signature");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("STRIPE_WEBHOOK_SECRET")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const signatures = signature.split(",").filter((item) =>
    item.startsWith("v1=")
  ).map((item) => item.slice(3));
  if (!signatures.some((value) => constantTimeEqual(value, expected))) {
    throw new Error("Invalid webhook signature");
  }
}

function planFromPrice(priceId: string | undefined): "solo" | "team" | "free" {
  if (
    [
      Deno.env.get("STRIPE_SOLO_MONTHLY_PRICE_ID"),
      Deno.env.get("STRIPE_SOLO_ANNUAL_PRICE_ID"),
    ].includes(priceId)
  ) return "solo";
  if (
    [
      Deno.env.get("STRIPE_TEAM_MONTHLY_PRICE_ID"),
      Deno.env.get("STRIPE_TEAM_ANNUAL_PRICE_ID"),
    ].includes(priceId)
  ) return "team";
  return "free";
}

Deno.serve(async (request) => {
  const admin = adminClient();
  let eventId: string | null = null;
  try {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new Error("Missing webhook signature");
    await verifySignature(payload, signature);
    const event = JSON.parse(payload);
    eventId = event.id;
    const { error: insertError } = await admin.from("webhook_events").insert({
      id: event.id,
      provider: "stripe",
      event_type: event.type,
      status: "running",
    });
    if (insertError?.code === "23505") {
      const { data: existing } = await admin.from("webhook_events").select(
        "status,attempt",
      ).eq("id", event.id).single();
      if (existing?.status === "complete") {
        return json({ received: true, duplicate: true });
      }
      await admin.from("webhook_events").update({
        status: "running",
        attempt: Number(existing?.attempt || 1) + 1,
        error_code: null,
      }).eq("id", event.id);
    }
    if (insertError && insertError.code !== "23505") throw insertError;
    const object = event.data.object;
    let workspaceId = object.metadata?.workspace_id ||
      object.client_reference_id;
    if (!workspaceId && object.customer) {
      const { data } = await admin.from("subscriptions").select("workspace_id")
        .eq("stripe_customer_id", object.customer).maybeSingle();
      workspaceId = data?.workspace_id;
    }
    if (event.type === "checkout.session.completed" && workspaceId) {
      const plan = object.metadata?.plan_code || "free";
      await admin.from("subscriptions").update({
        plan_code: plan,
        status: "active",
        stripe_customer_id: object.customer,
        stripe_subscription_id: object.subscription,
        billing_interval: null,
      }).eq("workspace_id", workspaceId);
      if (plan === "team") {
        await admin.from("workspaces").update({ type: "business" }).eq(
          "id",
          workspaceId,
        );
      }
      await admin.from("operational_events").insert({
        workspace_id: workspaceId,
        event_type: "subscription.activated",
        entity_type: "workspace",
        entity_id: workspaceId,
        metadata: { plan_code: plan, upgrade_infrastructure_required: true },
      });
    } else if (event.type.startsWith("customer.subscription.") && workspaceId) {
      const price = object.items?.data?.[0]?.price;
      const plan = event.type === "customer.subscription.deleted"
        ? "free"
        : planFromPrice(price?.id);
      const mappedStatus = event.type === "customer.subscription.deleted"
        ? "canceled"
        : ["trialing", "active", "past_due", "unpaid", "canceled"].includes(
            object.status,
          )
        ? object.status
        : "past_due";
      await admin.from("subscriptions").update({
        plan_code: plan,
        status: mappedStatus,
        stripe_customer_id: object.customer,
        stripe_subscription_id: object.id,
        billing_interval: price?.recurring?.interval || null,
        current_period_end: object.current_period_end
          ? new Date(object.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: Boolean(object.cancel_at_period_end),
      }).eq("workspace_id", workspaceId);
    } else if (event.type === "invoice.payment_failed" && object.customer) {
      await admin.from("subscriptions").update({ status: "past_due" }).eq(
        "stripe_customer_id",
        object.customer,
      );
    }
    await admin.from("webhook_events").update({
      status: "complete",
      processed_at: new Date().toISOString(),
    }).eq("id", event.id);
    return json({ received: true });
  } catch (error) {
    if (eventId) {
      await admin.from("webhook_events").update({
        status: "failed",
        error_code: error instanceof Error
          ? error.message.slice(0, 80)
          : "WEBHOOK_FAILED",
        processed_at: new Date().toISOString(),
      }).eq("id", eventId);
    }
    return errorResponse(error, 400);
  }
});
