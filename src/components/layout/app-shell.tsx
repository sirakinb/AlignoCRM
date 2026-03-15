"use client";

import { useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

const publicRoutes = ["/sign-in", "/sign-up"];
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 224;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = publicRoutes.includes(pathname);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;

      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + delta)
        );
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth]
  );

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar width={sidebarWidth} />
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="group relative z-10 flex w-1 cursor-col-resize items-center justify-center hover:bg-[#6C2BD9]/10"
      >
        <div className="h-8 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-[#6C2BD9]/40" />
      </div>
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  );
}
