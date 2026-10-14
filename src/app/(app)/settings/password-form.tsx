"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type PasswordState } from "@/app/actions/auth";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, undefined);
  const form = useRef<HTMLFormElement>(null);
  const fe = state?.fieldErrors ?? {};
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} noValidate className="space-y-3 max-w-sm">
      <div>
        <label className="label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" name="current" type="password" autoComplete="current-password" className="input" aria-invalid={!!fe.current} />
        {fe.current && <p className="field-error">{fe.current}</p>}
      </div>
      <div>
        <label className="label" htmlFor="pw-next">New password</label>
        <input id="pw-next" name="next" type="password" autoComplete="new-password" className="input" aria-invalid={!!fe.next} />
        {fe.next ? <p className="field-error">{fe.next}</p> : <p className="text-xs text-ink-faint mt-1">At least 10 characters.</p>}
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">New password again</label>
        <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" className="input" aria-invalid={!!fe.confirm} />
        {fe.confirm && <p className="field-error">{fe.confirm}</p>}
      </div>
      {state?.error && <p className="field-error" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-sm text-pine" role="status">Password changed. Other devices have been signed out.</p>}
      <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
