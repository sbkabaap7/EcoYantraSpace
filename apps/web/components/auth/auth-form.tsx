"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

import { isApiError } from "../../lib/api/client";
import { useAuth } from "./auth-provider";
import styles from "./auth-form.module.css";

type AuthMode = "login" | "register";

export function AuthForm({ mode, nextPath = "/dashboard" }: { mode: AuthMode; nextPath?: string }) {
  const router = useRouter();
  const { login, register, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(nextPath);
  }, [nextPath, router, status]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const credentials = { email: email.trim(), password };
      if (mode === "login") await login(credentials);
      else await register(credentials);
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setError({
        message: caught instanceof Error ? caught.message : "Authentication failed.",
        ...(isApiError(caught) && caught.requestId ? { requestId: caught.requestId } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />
      <Link href="/" className={styles.backLink}><ArrowLeft size={14} /> Return to the experience</Link>

      <section className={styles.shell} aria-labelledby="auth-title">
        <div className={styles.story}>
          <Link href="/" className={styles.brand} aria-label="EcoYantraSpace home">
            <span aria-hidden="true">⬡</span>
            <strong>ECO<em>YANTRA</em>SPACE</strong>
          </Link>
          <div className={styles.storyCopy}>
            <span className={styles.eyebrow}><i /> Secure intelligence boundary</span>
            <h1>{isRegister ? <>ENTER THE<br /><em>FIELD.</em></> : <>RETURN TO<br /><em>THE SIGNAL.</em></>}</h1>
            <p>
              One authenticated workspace for carbon forecasting, explainable anomaly detection,
              and satellite forest-change analysis.
            </p>
          </div>
          <div className={styles.systems} aria-label="Intelligence systems">
            <span>01 / Carbon</span><span>02 / Anomaly</span><span>03 / Forest</span>
          </div>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formHeading}>
            <span><Leaf size={13} /> EcoYantraSpace account</span>
            <h2 id="auth-title">{isRegister ? "Create your workspace access" : "Sign in to your workspace"}</h2>
            <p>{isRegister ? "Use a secure password of at least 12 characters." : "Continue to your authorised projects and analyses."}</p>
          </div>

          <form onSubmit={submit} className={styles.form}>
            <label>
              <span>Email address</span>
              <div><Mail size={15} aria-hidden="true" /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@organisation.com" /></div>
            </label>
            <label>
              <span>Password</span>
              <div><LockKeyhole size={15} aria-hidden="true" /><input type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="12 characters minimum" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
            </label>

            {error ? <div className={styles.error} role="alert"><strong>{error.message}</strong>{error.requestId ? <span>Request ID: {error.requestId}</span> : null}</div> : null}

            <button className={styles.submit} type="submit" disabled={submitting || status === "loading"}>
              {submitting ? <LoaderCircle className={styles.spinner} size={16} /> : null}
              {submitting ? "Securing session…" : isRegister ? "Create account" : "Enter workspace"}
              {!submitting ? <ArrowUpRight size={15} /> : null}
            </button>
          </form>

          <p className={styles.switchMode}>
            {isRegister ? "Already have access?" : "New to EcoYantraSpace?"}{" "}
            <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link>
          </p>
          <p className={styles.securityNote}>Access tokens remain in memory. Session renewal uses a rotating, HttpOnly cookie.</p>
        </div>
      </section>
    </main>
  );
}
