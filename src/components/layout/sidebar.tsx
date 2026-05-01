"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useUser } from "@insforge/nextjs";
import { useServerUser } from "@/components/auth/server-auth-context";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import { Home, GitBranch, Users, Zap, Settings, LogOut, BookOpen } from "lucide-react";

/* eslint-disable @next/next/no-img-element */

const navItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Pipeline", href: "/pipeline", icon: GitBranch },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Automations", href: "/automations", icon: Zap },
  { label: "Docs", href: "/docs", icon: BookOpen },
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
      className="flex h-screen flex-col border-r border-gray-200 bg-white"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-6">
        <Image
          src="/aligno-crm_logo.png"
          alt="AlignoCRM"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
        />
        <span className="min-w-0 truncate text-lg font-bold tracking-tight text-gray-900">
          AlignoCRM
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#F3EAFD] text-[#6C2BD9]"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Utility Navigation */}
      <div className="space-y-1 px-3 pb-2">
        <Link
          href="/docs"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname.startsWith("/docs")
              ? "bg-[#F3EAFD] text-[#6C2BD9]"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <BookOpen size={18} className="shrink-0" />
          <span className="truncate">Docs</span>
        </Link>
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-[#F3EAFD] text-[#6C2BD9]"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <Settings size={18} className="shrink-0" />
          <span className="truncate">Settings</span>
        </Link>
      </div>

      {/* User + Logout */}
      <div className="border-t border-gray-200 px-5 py-4">
        <div className="flex items-center gap-3">
          {avatarSrc && !avatarFailed ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              style={{
                backgroundColor: withAlpha(getPurpleScaleColor(1), 0.16),
                color: getPurpleScaleColor(5),
              }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {displayName}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
