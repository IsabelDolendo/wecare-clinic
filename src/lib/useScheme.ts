"use client";
import { useEffect, useState } from "react";

export function useScheme() {
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setScheme(mql.matches ? "dark" : "light");
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return scheme;
}
