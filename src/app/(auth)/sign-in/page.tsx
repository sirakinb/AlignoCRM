"use client";

import Image from "next/image";
import { SignIn } from "@insforge/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/aligno-crm_logo.png"
            alt="AlignoCRM"
            width={48}
            height={48}
            className="mx-auto mb-3 h-12 w-12 object-contain"
          />
          <h1 className="text-2xl font-bold text-gray-900">AlignoCRM</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to your account
          </p>
        </div>
        <SignIn
          signUpUrl="/sign-up"
          signUpText="Don't have an account?"
          signUpLinkText="Sign up"
        />
      </div>
    </div>
  );
}
