import { describe, expect, it } from "vitest";
import { deliveryHint, friendlyPushError, platformOf } from "@/lib/pwa-client";

const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

describe("platform en meldingshulp", () => {
  it("herkent Mac Safari, Mac Chrome en iPhone", () => {
    expect(platformOf(MAC_SAFARI)).toEqual({ os: "mac", browser: "safari" });
    expect(platformOf(MAC_CHROME)).toEqual({ os: "mac", browser: "chrome" });
    expect(platformOf(IPHONE).os).toBe("ios");
  });
  it("geeft Mac-specifieke tips en vriendelijke fouten", () => {
    expect(deliveryHint(platformOf(MAC_CHROME))).toMatch(/Systeeminstellingen → Meldingen → Google Chrome/);
    expect(friendlyPushError({ name: "AbortError" }, platformOf(MAC_SAFARI))).toMatch(/Safari/);
    expect(friendlyPushError({ name: "NotAllowedError" }, platformOf(MAC_CHROME))).toMatch(/geblokkeerd/);
  });
});
