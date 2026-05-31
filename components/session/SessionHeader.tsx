"use client";

import { motion } from "framer-motion";
import { Calendar, CheckCircle2, Timer } from "lucide-react";
import { Session, MLResults } from "@/types";
import { formatDate, getStrokeEmoji } from "@/lib/utils";
import Badge from "@/components/ui/Badge";

interface SessionHeaderProps {
  session: Session;
  mlResults?: MLResults;
}

export default function SessionHeader({ session, mlResults }: SessionHeaderProps) {
  return (
    <div className="glass-card p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-ocean-700 to-ocean-600 border border-white/10 flex items-center justify-center text-2xl">
            {getStrokeEmoji(session.strokeType)}
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-white">
              {session.swimmerName}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(session.date)}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="w-3.5 h-3.5" />
                {Math.floor(session.duration / 60)}m {session.duration % 60}s
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="aqua" className="text-sm">
            <span className="mr-1">{getStrokeEmoji(session.strokeType)}</span>
            {session.strokeType}
          </Badge>
          {mlResults && (
            <Badge variant="success" className="text-sm">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {mlResults.strokeTypeConfidence.toFixed(1)}% Match
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
