"use client";
import * as React from "react";

/** Registreert de service worker (alleen over https of localhost). */
export function SwRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const secure = location.protocol === "https:" || location.hostname === "localhost";
    if (!secure) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
