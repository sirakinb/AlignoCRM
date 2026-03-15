"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useUser } from "@insforge/nextjs";
import { Home, GitBranch, Users, Zap, Settings, LogOut } from "lucide-react";

const navItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Pipeline", href: "/pipeline", icon: GitBranch },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Automations", href: "/automations", icon: Zap },
] as const;

interface SidebarProps {
  width?: number;
}

export function Sidebar({ width = 224 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();

  const displayName =
    (user?.profile?.name as string) ?? user?.email ?? "User";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await signOut();
    router.push("/sign-in");
  };

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
        <span className="truncate text-lg font-bold tracking-tight text-gray-900">
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

      {/* Settings */}
      <div className="px-3 pb-2">
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
            {initials}
          </div>
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
