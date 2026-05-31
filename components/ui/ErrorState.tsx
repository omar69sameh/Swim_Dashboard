"use client";

import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorState({
  message = "Something went wrong",
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`glass-card p-6 flex flex-col items-center justify-center gap-3 text-center ${className}`}
    >
      <AlertCircle className="w-8 h-8 text-rose-400" />
      <p className="text-sm text-slate-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-aqua-300 hover:text-aqua-200 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
