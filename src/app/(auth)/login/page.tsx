import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, signupAllowed, userCount } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  if ((await userCount()) === 0) redirect("/signup");
  const { next } = await searchParams;
  return (
    <div>
      <h1 className="text-4xl mb-2">Welcome back</h1>
      <p className="text-ink-soft mb-8">Sign in to open your travel journal.</p>
      <LoginForm next={typeof next === "string" ? next : "/"} />
      {(await signupAllowed()) && (
        <p className="mt-6 text-sm text-ink-soft">
          New here?{" "}
          <Link className="text-pine underline underline-offset-2" href="/signup">
            Create an account
          </Link>
        </p>
      )}
    </div>
  );
}
