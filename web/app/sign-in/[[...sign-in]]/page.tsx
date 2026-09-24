import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

const ON = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignInPage() {
  if (!ON)
    return (
      <div className="chapter narrow">
        <h1 className="display">Sign in is not configured.</h1>
        <p className="mut">
          Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> to enable
          managed sign-in. Locally, dashboards work keyless against the dev-admin account.
        </p>
        <p><Link className="primary btn-link" href="/dashboard">Continue in dev mode</Link></p>
      </div>
    );
  return (
    <div className="auth-wrap">
      <SignIn />
    </div>
  );
}
