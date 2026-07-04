"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useUser } from "@insforge/nextjs";
import { useServerUser } from "@/components/auth/server-auth-context";
import { syncServerSession } from "@/lib/auth/sync-server-session";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import {
  Home,
  GitBranch,
  Users,
  Settings,
  LogOut,
  BookOpen,
  MessageSquareQuote,
} from "lucide-react";

/* eslint-disable @next/next/no-img-element */

// NOTE: Automations nav item is temporarily hidden while the feature matures.
// Restore with: { label: "Automations", href: "/automations", icon: Zap }
const navItems = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Pipeline", href: "/pipeline", icon: GitBranch },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Testimonials", href: "/testimonials", icon: MessageSquareQuote },
] as const;

interface SidebarProps {
  width?: number;
}

export function Sidebar({ width = 224 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { user: serverUser, refreshUser } = useServerUser();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const refreshedUserId = useRef<string | null>(null);
  const userMetadata =
    ((user as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
      string,
      unknown
    >;

  const effectiveProfile = {
    ...userMetadata,
    ...(((user?.profile as Record<string, unknown> | null) ?? {})),
    ...(((serverUser?.profile as Record<string, unknown> | null) ?? {})),
  };
  const effectiveUser = serverUser || user;

  const displayName =
    (effectiveProfile.name as string) ||
    (effectiveProfile.full_name as string) ||
    (effectiveUser?.email ? effectiveUser.email.split("@")[0] : "User");
  const avatarUrl =
    (effectiveProfile.avatar_url as string) ||
    (effectiveProfile.picture as string) ||
    (effectiveProfile.avatar as string) ||
    null;
  const avatarSrc = avatarUrl
    ? `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}ui=sidebar`
    : null;
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    if (!window.confirm("Log out of AlignoCRM?")) return;

    await signOut();
    router.push("/sign-in");
  };

  const handleNavigation =
    (href: string) => async (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();

      try {
        await syncServerSession();
      } finally {
        router.push(href);
        router.refresh();
      }
    };

  useEffect(() => {
    if (!effectiveUser?.id || refreshedUserId.current === effectiveUser.id) return;
    refreshedUserId.current = effectiveUser.id;
    void refreshUser();
  }, [effectiveUser?.id, refreshUser]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  return (
    <aside
      style={{ width }}
      className="flex h-screen flex-col border-r border-[#e7e7ea] bg-[#fafafa]"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-5">
        <Image
          src="/aligno-crm_logo.png"
          alt="AlignoCRM"
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 object-contain"
        />
        <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em] text-zinc-900">
          AlignoCRM
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={false}
                  onClick={handleNavigation(item.href)}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-[#efe7fb] text-[#5b21b6]"
                      : "text-zinc-600 hover:bg-black/[0.045] hover:text-zinc-900"
                  }`}
                >
                  <item.icon
                    size={16}
                    strokeWidth={isActive ? 2.1 : 1.8}
                    className={`shrink-0 ${isActive ? "text-[#6c2bd9]" : "text-zinc-500"}`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Utility Navigation */}
      <div className="space-y-0.5 px-2.5 pb-3">
        <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Workspace
        </p>
        <Link
          href="/docs"
          prefetch={false}
          onClick={handleNavigation("/docs")}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
            pathname.startsWith("/docs")
              ? "bg-[#efe7fb] text-[#5b21b6]"
              : "text-zinc-600 hover:bg-black/[0.045] hover:text-zinc-900"
          }`}
        >
          <BookOpen size={16} strokeWidth={1.8} className="shrink-0 text-zinc-500" />
          <span className="truncate">Docs</span>
        </Link>
        <Link
          href="/settings"
          prefetch={false}
          onClick={handleNavigation("/settings")}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-[#efe7fb] text-[#5b21b6]"
              : "text-zinc-600 hover:bg-black/[0.045] hover:text-zinc-900"
          }`}
        >
          <Settings size={16} strokeWidth={1.8} className="shrink-0 text-zinc-500" />
          <span className="truncate">Settings</span>
        </Link>
      </div>

      {/* User + Logout */}
      <div className="border-t border-[#e7e7ea] px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
          {avatarSrc && !avatarFailed ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/5"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-black/5"
              style={{
                backgroundColor: withAlpha(getPurpleScaleColor(1), 0.14),
                color: getPurpleScaleColor(4),
              }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-zinc-800">
              {displayName}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-black/[0.045] hover:text-zinc-700"
            aria-label="Log out"
          >
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
