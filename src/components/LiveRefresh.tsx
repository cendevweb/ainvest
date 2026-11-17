"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recharge les données de la page à intervalle régulier tant qu'une séance tourne. */
export function LiveRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
