"use client";

import { useActionState } from "react";
import { signup, type AuthState } from "@/app/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" className="input" defaultValue={state?.values?.name} aria-invalid={!!fe.name} />
        {fe.name && <p className="field-error">{fe.name}</p>}
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" className="input" defaultValue={state?.values?.email} aria-invalid={!!fe.email} />
        {fe.email && <p className="field-error">{fe.email}</p>}
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" className="input" aria-invalid={!!fe.password} aria-describedby="pw-hint" />
        {fe.password ? <p className="field-error">{fe.password}</p> : <p id="pw-hint" className="text-xs text-ink-faint mt-1">At least 10 characters.</p>}
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create journal"}</button>
    </form>
  );
}
