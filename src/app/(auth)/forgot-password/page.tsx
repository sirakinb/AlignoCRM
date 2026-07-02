"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { insforge } from "@/lib/insforge/client";

type Step = "request" | "reset" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await insforge.auth.sendResetPasswordEmail({ email });
      if (result.error) throw new Error(result.error.message);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset code");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // Exchange the emailed code for a one-time reset token, then set the password.
      const exchange = await insforge.auth.exchangeResetPasswordToken({
        email,
        code: code.trim(),
      });
      if (exchange.error) throw new Error(exchange.error.message);

      const token = exchange.data?.token;
      if (!token) throw new Error("Invalid or expired code. Please try again.");

      const reset = await insforge.auth.resetPassword({
        newPassword,
        otp: token,
      });
      if (reset.error) throw new Error(reset.error.message);

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <Image src="/aligno-crm_logo.png" alt="AlignoCRM" width={48} height={48} className="mx-auto mb-3 h-12 w-12 object-contain" />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            {step === "done" ? "Password updated" : "Reset your password"}
          </h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            {step === "request" && "Enter your email and we'll send you a reset code."}
            {step === "reset" && `Enter the code sent to ${email} and choose a new password.`}
            {step === "done" && "You can now sign in with your new password."}
          </p>
        </div>

        <div className="crisp-card p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

          {step === "request" && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs text-zinc-500">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="example@email.com"
                  autoFocus
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset code"}
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label htmlFor="code" className="mb-1.5 block text-xs text-zinc-500">Reset code</label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  placeholder="Enter the 6-digit code"
                  maxLength={6}
                  autoFocus
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-center text-lg tracking-widest text-zinc-900 outline-none placeholder:text-zinc-400 placeholder:text-sm placeholder:tracking-normal"
                />
              </div>
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-xs text-zinc-500">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="••••••"
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-xs text-zinc-500">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••"
                  className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6] disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update password"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("request"); setError(""); }}
                className="w-full text-center text-xs text-zinc-500 hover:text-zinc-700"
              >
                Didn&apos;t get a code? Start over
              </button>
            </form>
          )}

          {step === "done" && (
            <button
              onClick={() => router.push("/sign-in")}
              className="w-full rounded-lg bg-[#6c2bd9] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6]"
            >
              Go to sign in
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-zinc-500">
          Remembered it?{" "}
          <Link href="/sign-in" className="font-medium text-[#6c2bd9] hover:text-[#5b21b6]">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
