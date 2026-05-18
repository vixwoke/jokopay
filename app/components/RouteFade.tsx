"use client";

import { useEffect, useState } from "react";

export default function RouteFade() {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("jokopay_route_fade") === "1";
  });

  useEffect(() => {
    if (!show) return;

    sessionStorage.removeItem("jokopay_route_fade");

    const timeout = window.setTimeout(() => {
      setShow(false);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="route-fade-in pointer-events-none fixed inset-0 z-[80] bg-black"
      aria-hidden="true"
    />
  );
}
