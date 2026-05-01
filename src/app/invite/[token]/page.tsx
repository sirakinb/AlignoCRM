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

    if (!user) {
      // Not signed in — redirect to sign-up with a redirect back here
      router.replace(`/sign-up?redirect=/invite/${token}`);
      return;
    }

    // User is signed in — accept the invite
    setStatus("accepting");

    fetch("/api/organizations/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm text-center">
        <Image
          src="/aligno-crm_logo.png"
          alt="AlignoCRM"
          width={48}
          height={48}
          className="mx-auto mb-4 h-12 w-12 object-contain"
        />

        {(status === "loading" || status === "accepting") && (
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {status === "loading" ? "Loading..." : "Accepting invite..."}
            </h1>
            <p className="mt-2 text-sm text-gray-500">Please wait a moment.</p>
            <div className="mt-4 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600" />
            </div>
          </div>
        )}

        {status === "success" && (
          <div>
            <h1 className="text-xl font-bold text-gray-900">You&apos;re in!</h1>
            <p className="mt-2 text-sm text-gray-500">
              You&apos;ve successfully joined the team.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {status === "error" && (
          <div>
            <h1 className="text-xl font-bold text-gray-900">Invite Error</h1>
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
            <div className="mt-4 space-x-3">
              <Link
                href="/sign-in"
                className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign In
              </Link>
              <Link
                href="/"
                className="inline-block rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
