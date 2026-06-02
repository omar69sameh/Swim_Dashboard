import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-aqua-300 to-aqua-600 flex items-center justify-center mx-auto mb-6">
          <svg width="40" height="40" viewBox="0 0 20 20" fill="none" className="text-white">
            <circle cx="14" cy="4" r="2" fill="currentColor" />
            <path d="M2 13 Q5 10 8 12 Q11 14 14 11 Q17 8 19 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <path d="M10 12 L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 12 Q7 9 5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-aqua-300 font-mono text-sm mb-2">404</p>
        <h1 className="text-3xl font-display font-bold text-white mb-3">Page not found</h1>
        <p className="text-slate-400 mb-8 max-w-sm mx-auto">
          Looks like you swam off course. This page doesn't exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-aqua-300/10 text-aqua-300 border border-aqua-300/20 hover:bg-aqua-300/20 transition-colors font-medium"
        >
          Back to SwimMate
        </Link>
      </div>
    </div>
  );
}
