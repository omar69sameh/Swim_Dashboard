"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export default function LoadingState({
  message = "Loading...",
  className = "",
}: LoadingStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}
    >
      <Loader2 className="w-8 h-8 text-aqua-300 animate-spin" />
      <p className="text-sm text-slate-400">{message}</p>
    </motion.div>
  );
}
