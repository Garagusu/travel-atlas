"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  clearThrottle,
  createSession,
  destroySession,
  dummyHash,
  hashPassword,
  signupAllowed,
  throttleLogin,
  verifyPassword,
} from "@/lib/auth";
import { fieldErrors, loginSchema, signupSchema, type FieldErrors } from "@/lib/validation";

export type AuthState = { error?: string; fieldErrors?: FieldErrors; values?: Record<string, string> } | undefined;

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  if (!(await signupAllowed())) return { error: "Sign-up is closed for this journal.", values };
  const parsed = signupSchema.safeParse({ ...values, password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing.length) return { fieldErrors: { email: "An account with this email already exists" }, values };
  const [user] = await db
    .insert(users)
    .values({ name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) })
    .returning({ id: users.id });
  await createSession(user.id);
  redirect("/");
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = { email: String(form.get("email") ?? "") };
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}:${parsed.data.email}`;
  if (!throttleLogin(key)) return { error: "Too many attempts. Wait 15 minutes and try again.", values };
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  const valid = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? dummyHash(),
  );
  if (!user || !valid) return { error: "That email and password don't match.", values };
  clearThrottle(key);
  await createSession(user.id);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
