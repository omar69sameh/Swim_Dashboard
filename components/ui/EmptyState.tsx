"use client";

interface EmptyStateProps {
  message?: string;
  className?: string;
}

export default function EmptyState({
  message = "No data available",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`glass-card p-8 flex items-center justify-center text-center ${className}`}
    >
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
