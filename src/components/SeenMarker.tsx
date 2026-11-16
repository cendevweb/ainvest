"use client";
import { useEffect } from "react";

/** Marque la séance comme vue une fois la notification affichée. */
export function SeenMarker({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/sessions/${encodeURIComponent(sessionId)}/seen`, { method: "POST" }).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [sessionId]);
  return null;
}
