"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Activity, Calendar, Award } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import QualityChart from "@/components/dashboard/QualityChart";
import { swimmers, sessions } from "@/lib/data";
import { getStrokeEmoji, formatDate } from "@/lib/utils";

export default function SwimmerProfilePage() {
  const params = useParams();
  const swimmerId = params.id as string;
  const swimmer = swimmers.find((s) => s.id === swimmerId);
  const swimmerSessions = sessions.filter((s) => s.swimmerId === swimmerId);

  if (!swimmer) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Swimmer Not Found</h1>
          <Link href="/" className="text-aqua-300 hover:text-aqua-200">Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-[72px]">
        <TopBar />
        <main className="p-6 space-y-6">
          {/* Back Link */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </motion.div>

          {/* Profile Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-aqua-400 to-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-aqua-500/20">
                {swimmer.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-display font-bold text-white">{swimmer.name}</h1>
                  <span className="text-lg">{getStrokeEmoji(swimmer.strokeSpecialty)}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {swimmer.age} years old</span>
                  <span className="flex items-center gap-1"><Award className="w-4 h-4" /> {swimmer.strokeSpecialty} Specialist</span>
                  <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> {swimmer.totalSessions} sessions</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span className="text-3xl font-display font-bold text-white">{swimmer.averageQualityScore}</span>
                </div>
                <p className="text-sm text-slate-500">Average Quality Score</p>
              </div>
            </div>
          </motion.div>

          {/* Quality Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <QualityChart swimmerId={swimmerId} />
          </motion.div>

          {/* Recent Sessions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-5"
          >
            <h2 className="text-lg font-display font-semibold text-white mb-4">Recent Sessions</h2>
            <div className="space-y-2">
              {swimmerSessions.map((session) => (
                <Link key={session.id} href={`/session/${session.id}`}>
                  <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10">
                    <div className="w-10 h-10 rounded-lg bg-ocean-800 flex items-center justify-center text-lg">
                      {getStrokeEmoji(session.strokeType)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-200">{formatDate(session.date)}</p>
                      <p className="text-xs text-slate-500">{session.distance}m • {session.poolLength}m pool</p>
                    </div>
                    {session.qualityScore && (
                      <div className="text-right">
                        <span className="text-lg font-bold text-aqua-300">{session.qualityScore}</span>
                        <p className="text-xs text-slate-500">Quality Score</p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
