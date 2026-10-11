"use client";

export type PushSupport = "unsupported" | "needs-install" | "denied" | "ready";

export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

/** iOS ondersteunt Web Push alleen voor webapps die op het beginscherm staan (iOS/iPadOS 16.4+). */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!has) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
