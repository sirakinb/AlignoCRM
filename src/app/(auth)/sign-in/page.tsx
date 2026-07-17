"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getPostAuthRedirectUrl } from "@/lib/auth/redirect-url";
import { getSafeRedirectPath } from "@/lib/auth/sync-server-session";
import { insforge } from "@/lib/insforge/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const redirectPath = getSafeRedirectPath(
        new URLSearchParams(window.location.search).get("redirect")
      );
      const result = await insforge.auth.signInWithPassword({ email, password });

      if (result.error) {
        const msg = result.error.message || "";
        if (msg.toLowerCase().includes("verify") || msg.toLowerCase().includes("not verified")) {
          setStep("verify");
          setLoading(false);
          return;
        }
        throw new Error(msg || "Sign in failed");
      }

      if (result.data?.accessToken) {
        await fetch("/api/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${result.data.accessToken}`,
          },
          body: JSON.stringify({
            action: "sync-token",
            user: result.data.user,
          }),
        });
        window.location.href = redirectPath;
      } else {
        throw new Error("Sign in failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const redirectPath = getSafeRedirectPath(
        new URLSearchParams(window.location.search).get("redirect")
      );
      const result = await insforge.auth.verifyEmail({ otp: verifyCode, email });
      if (result.error) throw new Error(result.error.message);

      if (result.data?.accessToken) {
        await fetch("/api/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${result.data.accessToken}`,
          },
          body: JSON.stringify({
            action: "sync-token",
            user: result.data.user,
          }),
        });
        window.location.href = redirectPath;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const redirectPath = getSafeRedirectPath(
      new URLSearchParams(window.location.search).get("redirect")
    );
    setOauthLoading(true);
    setError("");
    const { error: oauthError } = await insforge.auth.signInWithOAuth({
      provider: "google",
      redirectTo: getPostAuthRedirectUrl(redirectPath),
    });
    if (oauthError) {
      setError(oauthError.message || "Google sign-in failed. Please try again.");
      setOauthLoading(false);
    }
  }

  if (step === "verify") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 text-center">
            <Image src="/aligno-crm_logo.png" alt="AlignoCRM" width={48} height={48} className="mx-auto mb-3 h-12 w-12 object-contain" />
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Verify Your Email</h1>
            <p className="mt-1 text-[13px] text-zinc-500">Enter the code sent to {email}</p>
          </div>
          <div className="crisp-card p-6">
            <form onSubmit={handleVerify} className="space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
                className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-center text-lg tracking-widest text-zinc-900 outline-none placeholder:text-zinc-400"
                autoFocus
              />
              <button type="submit" disabled={loading || verifyCode.length < 6} className="w-full rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50">
                {loading ? "Verifying..." : "Verify"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <Image src="/aligno-crm_logo.png" alt="AlignoCRM" width={48} height={48} className="mx-auto mb-3 h-12 w-12 object-contain" />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">AlignoCRM</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Sign in to your account</p>
        </div>

        <div className="crisp-card space-y-4 p-6">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}

          <button
            onClick={handleGoogle}
            disabled={oauthLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e7e7ea] bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {oauthLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          {!showEmailForm && (
            <button
              onClick={() => setShowEmailForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white">
                <Image src="/pentridge-p.png" alt="" width={12} height={12} className="h-3 w-3 object-contain" />
              </span>
              Continue with Pentridge
            </button>
          )}

          {showEmailForm && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#f0f0f2]" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-zinc-400">or</span></div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs text-zinc-500">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="example@email.com" className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-xs text-zinc-500">Password</label>
                <Link href="/forgot-password" className="text-xs font-medium text-[#6c2bd9] hover:text-[#5b21b6]">Forgot password?</Link>
              </div>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••" className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400" />
            </div>
                <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50">
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-zinc-500">
          Don&apos;t have an account?{" "}
          <a
            href="https://pentridgemedia.com/labs"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#6c2bd9] hover:text-[#5b21b6]"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
