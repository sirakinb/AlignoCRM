"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
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
  "https://3nm75tby.us-east.insforge.app/functions/check-subscription";

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SubscriptionState>({
    has_subscription: false,
    tier: null,
    billing_period: null,
    status: null,
    current_period_end: null,
  });
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    try {
      const result = await insforge.auth.getCurrentSession();
      const token = result.data?.session?.accessToken;
      if (!token) {
        setState((s) => ({ ...s, has_subscription: false }));
        setLoading(false);
        return;
      }

      const res = await fetch(CHECK_URL, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!res.ok) {
        setState((s) => ({ ...s, has_subscription: false }));
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
      setState((s) => ({ ...s, has_subscription: false }));
    } finally {
      setLoading(false);
    }
  }, []);

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
