"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

interface RequestInfo {
  clientName: string;
  clientCompany: string;
  businessName: string;
  completed: boolean;
}

type Step = "intro" | "problem" | "solution" | "result" | "details" | "done";

const MIN_ANSWER = 10;

function buildQuestions(businessName: string) {
  return [
    {
      key: "problem" as const,
      index: 1,
      title: `What did ${businessName} help you with?`,
      hint: "The project, service, or thing we handled for you.",
      placeholder: "They helped us with…",
    },
    {
      key: "solution" as const,
      index: 2,
      title: `How was it working with ${businessName}?`,
      hint: "Communication, speed, quality — whatever stood out. A sentence is plenty.",
      placeholder: "Working together was…",
    },
    {
      key: "result" as const,
      index: 3,
      title: `What would you tell someone thinking about working with ${businessName}?`,
      hint: "No essay needed — whatever you'd say to a friend who asked.",
      placeholder: "If you're thinking about it…",
    },
  ];
}

export default function TestimonialFormPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<Step>("intro");
  const [answers, setAnswers] = useState({ problem: "", solution: "", result: "" });
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [permission, setPermission] = useState(true);
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/public/testimonials/${token}`);
        if (!response.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }

        const payload = (await response.json()) as RequestInfo;
        if (cancelled) return;

        setInfo(payload);
        setName(payload.clientName);
        setCompany(payload.clientCompany);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const questions = buildQuestions(info?.businessName ?? "us");
  const qIdx = questions.findIndex((q) => q.key === step);
  const question = qIdx >= 0 ? questions[qIdx] : null;

  useEffect(() => {
    if (question && areaRef.current) areaRef.current.focus();
  }, [step, question]);

  const goNext = useCallback(() => {
    setError(null);

    if (step === "intro") {
      setStep("problem");
      return;
    }

    if (question) {
      if (answers[question.key].trim().length < MIN_ANSWER) {
        setError("A sentence or two is all we need — just a little more.");
        return;
      }
      setStep(qIdx === questions.length - 1 ? "details" : questions[qIdx + 1].key);
    }
  }, [step, question, answers, qIdx, questions]);

  const goBack = useCallback(() => {
    setError(null);
    if (question) setStep(qIdx === 0 ? "intro" : questions[qIdx - 1].key);
    else if (step === "details") setStep("result");
  }, [step, question, qIdx, questions]);

  async function handleSubmit() {
    setError(null);

    if (name.trim().length < 2) {
      setError("Please tell us your name.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/public/testimonials/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          company: company.trim(),
          problem: answers.problem.trim(),
          solution: answers.solution.trim(),
          result: answers.result.trim(),
          permission,
          website,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Something went wrong — please try again.");
      }

      setStep("done");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const firstName = (info?.clientName ?? "").split(/\s+/)[0] || "there";

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f8]">
      <header className="flex items-center gap-2 px-6 py-5">
        <Image
          src="/aligno-crm_logo.png"
          alt=""
          width={22}
          height={22}
          className="h-[22px] w-[22px] object-contain"
        />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
          {info?.businessName ?? ""}
        </span>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-14">
        <div className="w-full max-w-xl">
          {loading && (
            <div className="flex items-center justify-center py-24 text-zinc-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          )}

          {!loading && notFound && (
            <div className="rounded-xl border border-[#e7e7ea] bg-white p-8 text-center shadow-[0_1px_2px_rgba(17,17,26,0.05)]">
              <h1 className="text-[17px] font-semibold text-zinc-900">
                This link isn&apos;t active
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-500">
                It may have expired or been removed. If you were asked for a
                testimonial, reply to the person who sent it and they&apos;ll send a
                fresh link.
              </p>
            </div>
          )}

          {!loading && info?.completed && step !== "done" && (
            <div className="rounded-xl border border-[#e7e7ea] bg-white p-8 text-center shadow-[0_1px_2px_rgba(17,17,26,0.05)]">
              <CheckCircle2 size={28} className="mx-auto text-[#6c2bd9]" />
              <h1 className="mt-3 text-[17px] font-semibold text-zinc-900">
                Already got yours — thank you!
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-500">
                We&apos;ve already received your testimonial. Nothing more to do here.
              </p>
            </div>
          )}

          {!loading && info && !info.completed && (
            <div className="rounded-xl border border-[#e7e7ea] bg-white shadow-[0_1px_2px_rgba(17,17,26,0.05),0_2px_8px_rgba(17,17,26,0.04)]">
              {/* Progress */}
              {step !== "intro" && step !== "done" && (
                <div className="flex gap-1 px-8 pt-6">
                  {[0, 1, 2, 3].map((i) => {
                    const current = step === "details" ? 3 : qIdx;
                    return (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= current ? "bg-[#6c2bd9]" : "bg-[#ececef]"
                        }`}
                      />
                    );
                  })}
                </div>
              )}

              <div className="p-8">
                {step === "intro" && (
                  <section>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
                      A quick favor
                    </p>
                    <h1 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900">
                      Hi {firstName} — would you share a few words about working
                      with {info.businessName}?
                    </h1>
                    <p className="mt-3 text-[13.5px] leading-relaxed text-zinc-500">
                      Three questions, under two minutes. Your words, in your voice.
                    </p>
                    <button
                      onClick={goNext}
                      className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
                    >
                      Let&apos;s do it
                      <ArrowRight size={14} />
                    </button>
                    <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                      ~2 min · 3 questions
                    </p>
                  </section>
                )}

                {question && (
                  <section key={question.key}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
                      Question {question.index} of 3
                    </p>
                    <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900">
                      {question.title}
                    </h2>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                      {question.hint}
                    </p>
                    <textarea
                      ref={areaRef}
                      value={answers[question.key]}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [question.key]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) goNext();
                      }}
                      placeholder={question.placeholder}
                      rows={5}
                      className="mt-4 w-full resize-none rounded-md border border-[#dcdce1] bg-white px-3 py-2.5 text-[14px] leading-relaxed text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:ring-2 focus:ring-[#6c2bd9]/15"
                    />
                    {error && (
                      <p className="mt-2 text-[12.5px] text-red-600">{error}</p>
                    )}
                    <div className="mt-5 flex items-center justify-between">
                      <button
                        onClick={goBack}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] hover:text-zinc-800"
                      >
                        <ArrowLeft size={14} />
                        Back
                      </button>
                      <button
                        onClick={goNext}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
                      >
                        Next
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                )}

                {step === "details" && (
                  <section>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
                      Last step
                    </p>
                    <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900">
                      How should we credit you?
                    </h2>

                    <div className="mt-5 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                          Your name
                        </label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-md border border-[#dcdce1] bg-white px-3 py-2 text-[14px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:ring-2 focus:ring-[#6c2bd9]/15"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                            Role <span className="text-zinc-400">(optional)</span>
                          </label>
                          <input
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            placeholder="Founder, Marketing Lead…"
                            className="w-full rounded-md border border-[#dcdce1] bg-white px-3 py-2 text-[14px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:ring-2 focus:ring-[#6c2bd9]/15"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[12.5px] font-medium text-zinc-600">
                            Company <span className="text-zinc-400">(optional)</span>
                          </label>
                          <input
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className="w-full rounded-md border border-[#dcdce1] bg-white px-3 py-2 text-[14px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-[#6c2bd9] focus:ring-2 focus:ring-[#6c2bd9]/15"
                          />
                        </div>
                      </div>

                      {/* Honeypot — hidden from real users, bots fill it */}
                      <input
                        type="text"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        className="absolute left-[-9999px] h-0 w-0 opacity-0"
                      />

                      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[#e7e7ea] bg-[#fafafa] px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={permission}
                          onChange={(e) => setPermission(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-[#6c2bd9]"
                        />
                        <span className="text-[13px] leading-relaxed text-zinc-600">
                          It&apos;s OK to publish this with my name.
                        </span>
                      </label>
                    </div>

                    {error && (
                      <p className="mt-3 text-[12.5px] text-red-600">{error}</p>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                      <button
                        onClick={goBack}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-black/[0.045] hover:text-zinc-800"
                      >
                        <ArrowLeft size={14} />
                        Back
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:opacity-60"
                      >
                        {submitting && <Loader2 size={14} className="animate-spin" />}
                        Send testimonial
                      </button>
                    </div>
                  </section>
                )}

                {step === "done" && (
                  <section className="py-4 text-center">
                    <CheckCircle2 size={32} className="mx-auto text-[#6c2bd9]" />
                    <h2 className="mt-3 text-[19px] font-semibold text-zinc-900">
                      Thank you, {name.split(/\s+/)[0] || firstName}!
                    </h2>
                    <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-zinc-500">
                      Your words mean a lot. We&apos;ll only ever share them the way
                      you approved.
                    </p>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
