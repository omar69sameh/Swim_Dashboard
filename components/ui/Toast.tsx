"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error";

export interface ToastProps {
  msg: string;
  type: ToastType;
}

export function Toast({ msg, type }: ToastProps) {
  return (
    <motion.div
      key="toast"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg z-[100] text-sm font-medium ${
        type === "success" ? "bg-emerald-500/90 text-white" : "bg-rose-500/90 text-white"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <AlertTriangle className="w-4 h-4" />
      )}
      {msg}
    </motion.div>
  );
}
