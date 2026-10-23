import { describe, expect, it } from "vitest";
import { endpointId, sameKey, urlBase64ToUint8Array } from "@/lib/pwa-client";

describe("pushherstel in de browser", () => {
  it("endpointId is stabiel en geeft het endpoint niet prijs", async () => {
    const a = await endpointId("https://fcm.googleapis.com/fcm/send/abc");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await endpointId("https://fcm.googleapis.com/fcm/send/abc")).toBe(a);
    expect(await endpointId("https://fcm.googleapis.com/fcm/send/abd")).not.toBe(a);
    expect(a).not.toContain("abc");
  });
  it("herkent een abonnement met een andere VAPID-sleutel", () => {
    const key = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    const bytes = urlBase64ToUint8Array(key);
    expect(sameKey({ options: { applicationServerKey: bytes.buffer } }, key)).toBe(true);
    const other = new Uint8Array(bytes); other[3] ^= 1;
    expect(sameKey({ options: { applicationServerKey: other.buffer } }, key)).toBe(false);
    expect(sameKey({}, key)).toBe(true); // niet te controleren: niet ten onrechte vernieuwen
  });
});
