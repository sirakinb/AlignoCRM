"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useServerUser } from "./server-auth-context";

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
    const email = user?.email?.toLowerCase();
    if (!email) {
      setState(NO_SUB);
      setLoading(false);
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
