"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; message: string; tone: "info" | "error" };
const ToastCtx = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed z-[100] bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center pointer-events-none w-[min(92vw,420px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm shadow-[var(--shadow-lift)] ${
              t.tone === "error" ? "bg-danger text-white" : "bg-ink text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
