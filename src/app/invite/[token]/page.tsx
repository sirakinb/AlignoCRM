"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useUser } from "@insforge/nextjs";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const userLoading = !isLoaded;

  const [status, setStatus] = useState<"loading" | "accepting" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (userLoading) return;

    // Attempt the accept directly — the API validates the server session.
    // Relying on the client-side `user` alone can misfire while the client
    // SDK is still hydrating even though the server session cookie is valid.
    setStatus("accepting");

    fetch("/api/organizations/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          // Not signed in — redirect to sign-up with a redirect back here
          router.replace(`/sign-up?redirect=/invite/${token}`);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to accept invite");
        setStatus("success");
      })
      .catch((err) => {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to accept invite");
      });
  }, [user, userLoading, token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
      <div className="w-full max-w-[400px] text-center">
        <Image
          src="/aligno-crm_logo.png"
          alt="AlignoCRM"
          width={48}
          height={48}
          className="mx-auto mb-4 h-12 w-12 object-contain"
        />

        <div className="crisp-card p-8">
          {(status === "loading" || status === "accepting") && (
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
                {status === "loading" ? "Loading..." : "Accepting invite..."}
              </h1>
              <p className="mt-2 text-[13px] text-zinc-500">Please wait a moment.</p>
              <div className="mt-5 flex justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-[#6c2bd9]" />
              </div>
            </div>
          )}

          {status === "success" && (
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">You&apos;re in!</h1>
              <p className="mt-2 text-[13px] text-zinc-500">
                You&apos;ve successfully joined the team.
              </p>
              <Link
                href="/dashboard"
                className="mt-5 inline-block rounded-lg bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6]"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {status === "error" && (
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Invite Error</h1>
              <p className="mt-2 text-[13px] text-red-600">{errorMessage}</p>
              <div className="mt-5 space-x-3">
                <Link
                  href="/sign-in"
                  className="inline-block rounded-lg border border-[#e7e7ea] bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Sign In
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-block rounded-lg bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5b21b6]"
                >
                  Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
