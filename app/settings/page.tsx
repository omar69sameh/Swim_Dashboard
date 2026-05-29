"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-[72px]">
        <TopBar />
        <main className="p-6 space-y-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <Settings className="w-6 h-6 text-aqua-300" />
            <h1 className="text-2xl font-display font-bold text-white">Settings</h1>
          </motion.div>

          <div className="glass-card p-12 text-center">
            <Settings className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-slate-300 mb-2">Settings Panel</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              ML pipeline configuration, notification preferences, and team management settings will be available here.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
