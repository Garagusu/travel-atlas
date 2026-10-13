"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** Accessible modal built on the native <dialog> element. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto rounded-2xl bg-card p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-ink/30 max-h-[90vh]`}
      style={{ width: `min(94vw, ${wide ? 760 : 520}px)` }}
    >
      {open && (
        <div className="flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-2xl">{title}</h2>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="px-5 pb-5 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}

type ConfirmOpts = { title: string; message: string; confirmLabel: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onClose={() => close(false)} title={state?.title ?? ""}>
        <p className="text-ink-soft">{state?.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button type="button" className={`btn ${state?.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)} autoFocus>
            {state?.confirmLabel}
          </button>
        </div>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
