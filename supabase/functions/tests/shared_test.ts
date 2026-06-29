import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptSecret, encryptSecret, sha256 } from "../_shared/crypto.ts";
import { analyzeAudit, entitlementFor } from "../_shared/domain.ts";

Deno.test("OAuth credentials encrypt with randomized authenticated ciphertext", async () => {
  Deno.env.set(
    "OAUTH_ENCRYPTION_KEY",
    "test-only-key-material-that-is-at-least-32-characters",
  );
  const first = await encryptSecret("refresh-token");
  const second = await encryptSecret("refresh-token");
  assertNotEquals(first, second);
  assertEquals(await decryptSecret(first), "refresh-token");
  Deno.env.set(
    "OAUTH_ENCRYPTION_KEY",
    "different-test-key-material-with-at-least-32-characters",
  );
  await assertRejects(() => decryptSecret(first));
});

Deno.test("hashes are deterministic without retaining source values", async () => {
  assertEquals(await sha256("state"), await sha256("state"));
  assertNotEquals(await sha256("state"), "state");
});

Deno.test("empty audits remain stable and unknown plans fail closed to Free", () => {
  assertEquals(
    analyzeAudit({
      currency: "USD",
      clients: [],
      contracts: [],
      invoices: [],
      payments: [],
      timeEntries: [],
    }),
    [],
  );
  assertEquals(entitlementFor("tampered-plan").code, "free");
});
