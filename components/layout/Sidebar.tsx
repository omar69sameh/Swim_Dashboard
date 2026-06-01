"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users,
  Settings,
  Droplets,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  UserCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/coach" || href === "/swimmer") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useAppStore();
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  const navItems =
    user?.role === "coach"
      ? [
          { href: "/coach", label: "Swimmers", icon: Users },
          { href: "/settings", label: "Settings", icon: Settings },
        ]
      : [
          { href: "/swimmer", label: "My progress", icon: TrendingUp },
          { href: "/profile", label: "Profile", icon: UserCircle },
          { href: "/settings", label: "Settings", icon: Settings },
        ];

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 72 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={cn(
        "fixed left-0 top-0 h-screen z-40 glass-panel border-r border-white/10 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div className="h-16 flex items-center px-4 border-b border-white/5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-aqua-300 to-aqua-600 flex items-center justify-center shrink-0">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <motion.span
            animate={{ opacity: sidebarOpen ? 1 : 0, width: sidebarOpen ? "auto" : 0 }}
            className="font-display font-bold text-lg gradient-text whitespace-nowrap overflow-hidden"
          >
            SwimML
          </motion.span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = isNavActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="block"
              onClick={handleNavClick}
            >
              <motion.div
                whileHover={{ x: 2 }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative overflow-hidden",
                  isActive
                    ? "bg-aqua-300/10 text-aqua-300"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-aqua-300 rounded-r-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-aqua-300")} />
                <motion.span
                  animate={{ opacity: sidebarOpen ? 1 : 0, width: sidebarOpen ? "auto" : 0 }}
                  className="font-medium text-sm whitespace-nowrap overflow-hidden"
                >
                  {item.label}
                </motion.span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5">
        <button
          type="button"
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
          aria-label={sidebarOpen ? "Collapse menu" : "Expand menu"}
        >
          {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </motion.aside>
  );
}
