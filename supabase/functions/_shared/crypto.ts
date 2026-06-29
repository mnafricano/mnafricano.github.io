const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(
    atob(value),
    (character) => character.charCodeAt(0),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("OAUTH_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) {
    throw new Error("OAUTH_ENCRYPTION_KEY must contain at least 32 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(value),
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [version, iv, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !ciphertext) {
    throw new Error("Unsupported encrypted credential");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(ciphertext),
  );
  return decoder.decode(plaintext);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function randomToken(bytes = 32): string {
  return base64(crypto.getRandomValues(new Uint8Array(bytes))).replaceAll(
    "+",
    "-",
  ).replaceAll("/", "_").replaceAll("=", "");
}
