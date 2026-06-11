"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, AlertTriangle } from "lucide-react";

export interface ConfirmModalProps {
  title: string;
  description: React.ReactNode;
  warning?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmModal({ title, description, warning, onClose, onConfirm }: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setErr("");
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card border border-rose-400/20 rounded-2xl p-6 w-full max-w-sm"
      >
        <div className="flex flex-col items-center text-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-rose-400/10 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">{title}</h2>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
        </div>

        {warning && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-400/10 border border-amber-400/20 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">{warning}</p>
          </div>
        )}

        {err && <p className="text-xs text-rose-400 mb-3">{err}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-rose-500 text-white font-semibold text-sm hover:bg-rose-600 transition-colors disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Yes, delete"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
