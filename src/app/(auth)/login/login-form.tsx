"use client";

import { useActionState } from "react";
import { login, type AuthState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" className="input" required
          defaultValue={state?.values?.email} aria-invalid={!!state?.fieldErrors?.email} />
        {state?.fieldErrors?.email && <p className="field-error">{state.fieldErrors.email}</p>}
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" className="input" required
          aria-invalid={!!state?.fieldErrors?.password} />
        {state?.fieldErrors?.password && <p className="field-error">{state.fieldErrors.password}</p>}
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
