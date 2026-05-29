"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  Droplets,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/swimmers", label: "Swimmers", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const pathname = usePathname();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 72 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen z-40 glass-panel border-r border-white/10 flex flex-col"
    >
      {/* Logo Area */}
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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} className="block">
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

      {/* Toggle Button */}
      <div className="p-3 border-t border-white/5">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </motion.aside>
  );
}
