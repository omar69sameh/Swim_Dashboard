"use client";

import { motion } from "framer-motion";
import { Bell, Search } from "lucide-react";

export default function TopBar() {
  return (
    <header className="h-16 glass-panel border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search swimmers, sessions..."
            className="bg-ocean-900/50 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-aqua-300/50 focus:ring-1 focus:ring-aqua-300/50 w-64 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
        </motion.button>

        <div className="flex items-center gap-3 pl-4 border-l border-white/10">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-200">Coach Williams</p>
            <p className="text-xs text-slate-500">Head Coach</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-aqua-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
            CW
          </div>
        </div>
      </div>
    </header>
  );
}
