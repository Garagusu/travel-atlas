import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, signupAllowed, userCount } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create your journal" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  const first = (await userCount()) === 0;
  if (!(await signupAllowed())) {
    return (
      <div>
        <h1 className="text-4xl mb-3">Sign-up is closed</h1>
        <p className="text-ink-soft mb-6">This journal already has an owner. Ask them to set ALLOW_SIGNUP=true to add accounts.</p>
        <Link href="/login" className="btn btn-secondary">Go to sign in</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-4xl mb-2">{first ? "Start your journal" : "Create an account"}</h1>
      <p className="text-ink-soft mb-8">
        {first ? "You're the first one here, so this account will own the journal." : "Each account has its own private journal."}
      </p>
      <SignupForm />
      {!first && (
        <p className="mt-6 text-sm text-ink-soft">
          Already have an account? <Link className="text-pine underline underline-offset-2" href="/login">Sign in</Link>
        </p>
      )}
    </div>
  );
}
