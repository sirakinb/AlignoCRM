"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useServerUser } from "./server-auth-context";
import { insforge } from "@/lib/insforge/client";

interface SubscriptionState {
  has_subscription: boolean;
  tier: string | null;
  billing_period: string | null;
  status: string | null;
  current_period_end: string | null;
}

interface SubscriptionContextValue extends SubscriptionState {
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  has_subscription: false,
  tier: null,
  billing_period: null,
  status: null,
  current_period_end: null,
  loading: true,
  refresh: async () => {},
});

const CHECK_URL =
  "https://3nm75tby.us-east.insforge.app/functions/check-subscription-public";

const ALLOWLISTED_EMAILS = new Set([
  "aki.b@pentridgemedia.com",
  "sirakinb@gmail.com",
  "dropcardai@gmail.com",
  "bajulaiye@protonmail.com",
  "raichellaram@gmail.com",
  "08lin.kevin121@gmail.com",
  "tyronepeace.qa@gmail.com",
  "jyho0243@gmail.com",
  "astrid.nigrovic@gmail.com",
]);

const NO_SUB: SubscriptionState = {
  has_subscription: false,
  tier: null,
  billing_period: null,
  status: null,
  current_period_end: null,
};

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useServerUser();
  const [state, setState] = useState<SubscriptionState>(NO_SUB);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    let email = user?.email?.toLowerCase();

    // Fallback: if server user isn't available yet, try the client SDK session
    if (!email) {
      try {
        const session = await insforge.auth.getCurrentSession();
        email = session.data?.session?.user?.email?.toLowerCase() ?? undefined;
      } catch {
        // SDK not ready yet
      }
    }

    if (!email) {
      // Still no email — stay in loading state, don't lock them out
      return;
    }

    try {
      // Bypass for allowlisted emails
      if (ALLOWLISTED_EMAILS.has(email)) {
        setState({ has_subscription: true, tier: "granted", billing_period: null, status: "active", current_period_end: null });
        setLoading(false);
        return;
      }

      const res = await fetch(CHECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      });

      if (!res.ok) {
        setState(NO_SUB);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setState({
        has_subscription: !!data.has_subscription,
        tier: data.tier ?? null,
        billing_period: data.billing_period ?? null,
        status: data.status ?? null,
        current_period_end: data.current_period_end ?? null,
      });
    } catch {
      setState(NO_SUB);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Retry: if first check found no email, try again after a short delay (SDK may need time)
  useEffect(() => {
    if (loading && !user?.email) {
      const retryInterval = setInterval(() => checkSubscription(), 1000);
      const timeout = setTimeout(() => {
        clearInterval(retryInterval);
        setLoading(false);
      }, 8000);
      return () => {
        clearInterval(retryInterval);
        clearTimeout(timeout);
      };
    }
  }, [loading, user?.email, checkSubscription]);

  return (
    <SubscriptionContext.Provider
      value={{ ...state, loading, refresh: checkSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
