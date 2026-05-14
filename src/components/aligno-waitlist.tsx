"use client";

import { useState, FormEvent } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";

export function AlignoWaitlist() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Try again.");
      } else {
        setSubmitted(true);
        setEmail("");
      }
    } catch {
      setErrorMsg("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="aligno-panel mx-auto max-w-4xl rounded-2xl px-6 py-14 text-center sm:px-12 sm:py-16"
      style={{ borderColor: withAlpha(getPurpleScaleColor(5), 0.22) }}
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD] mb-4">
        Aligno CRM
      </p>
      <h2 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl lg:text-5xl">
        Join the waitlist.
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#5D5474]">
        Aligno CRM is opening up access soon. Drop your email and we&apos;ll let you know
        the moment it&apos;s ready for you.
      </p>

      {submitted ? (
        <div className="mx-auto mt-9 max-w-md rounded-xl border border-[#44106F]/15 bg-white/78 px-6 py-8">
          <div
            className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full"
            style={{
              background: `linear-gradient(135deg, ${withAlpha(getPurpleScaleColor(3), 0.2)}, ${withAlpha(getPurpleScaleColor(5), 0.2)})`,
            }}
          >
            <Sparkles className="h-5 w-5" style={{ color: getPurpleScaleColor(5) }} />
          </div>
          <p className="text-lg font-bold text-[#21173A]">You&apos;re on the list.</p>
          <p className="mt-2 text-sm leading-6 text-[#5D5474]">
            Check your inbox for a confirmation from us.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-9 flex max-w-xl flex-col items-stretch gap-3 sm:flex-row"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
            disabled={submitting}
            className="flex-1 rounded-lg border border-[#44106F]/20 bg-white/85 px-4 py-3.5 text-sm text-[#21173A] placeholder-[#7B7590] focus:border-[#6E2ABD] focus:outline-none focus:ring-2 focus:ring-[#6E2ABD]/30 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60 disabled:hover:brightness-100"
            style={{
              background: `linear-gradient(135deg, ${getPurpleScaleColor(3)}, ${getPurpleScaleColor(5)})`,
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                Join the Waitlist
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      )}

      {errorMsg && !submitted && (
        <p className="mt-4 text-sm text-rose-600">{errorMsg}</p>
      )}
    </div>
  );
}
