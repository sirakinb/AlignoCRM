"use client";

import { useSubscription } from "./subscription-context";

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { has_subscription, loading } = useSubscription();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-3 border-[#6C2BD9]/20 border-t-[#6C2BD9]"
        />
      </div>
    );
  }

  if (!has_subscription) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="aligno-panel w-full max-w-md rounded-2xl p-10 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#6C2BD9]/10">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6C2BD9"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h1
            className="mb-2 text-2xl font-semibold"
            style={{ color: "#21173A" }}
          >
            Subscribe to access Aligno
          </h1>

          <p className="mb-8 text-[15px] leading-relaxed" style={{ color: "#5D5474" }}>
            Aligno is part of Pentridge Labs &mdash; one subscription for every
            tool.
          </p>

          <a
            href="https://pentridgemedia.com/labs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #6C2BD9, #9333ea)",
            }}
          >
            View Plans
            <svg
              className="ml-2"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17l9.2-9.2M17 17V7H7" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
