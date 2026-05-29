"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { swimmers } from "@/lib/data";
import { getStrokeEmoji } from "@/lib/utils";

export default function SwimmersPage() {
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
            <Users className="w-6 h-6 text-aqua-300" />
            <h1 className="text-2xl font-display font-bold text-white">All Swimmers</h1>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {swimmers.map((swimmer, index) => (
              <motion.div
                key={swimmer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={`/swimmer/${swimmer.id}`}>
                  <div className="glass-card-hover p-5 cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-ocean-700 to-ocean-600 border border-white/10 flex items-center justify-center text-xl font-bold text-white">
                        {swimmer.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-200 group-hover:text-white transition-colors">{swimmer.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm">{getStrokeEmoji(swimmer.strokeSpecialty)}</span>
                          <span className="text-xs text-slate-500">{swimmer.strokeSpecialty}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-aqua-300">{swimmer.averageQualityScore}</p>
                        <p className="text-xs text-slate-500">Avg Score</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{swimmer.totalSessions}</p>
                        <p className="text-xs text-slate-500">Sessions</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{swimmer.age}</p>
                        <p className="text-xs text-slate-500">Age</p>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
