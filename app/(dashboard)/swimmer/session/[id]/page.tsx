"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import SimpleSessionAnalysis from "@/components/session/SimpleSessionAnalysis";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useSession, useMLResults } from "@/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate, getStrokeEmoji } from "@/lib/utils";

export default function SwimmerSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const user = useAuthStore((s) => s.user);

  const { session, isLoading: sessionLoading, error: sessionError } = useSession(sessionId);
  const {
    mlResults,
    isLoading: mlLoading,
    isValidating: mlValidating,
    error: mlError,
    refetch,
    isProcessing,
    isFailed,
  } = useMLResults(sessionId, session?.status);

  useEffect(() => {
    if (!session || !user?.swimmerId) return;
    if (session.swimmerId !== user.swimmerId) {
      router.replace("/swimmer");
    }
  }, [session, user?.swimmerId, router]);

  const showMlLoading = mlLoading && !mlResults;

  if (!sessionLoading && !session) {
    return (
      <div className="text-center py-12">
        <p className="text-white mb-2">Session not found</p>
        <Link href="/swimmer" className="text-aqua-300 text-sm">
          Back to my progress
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/swimmer"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {session && (
        <div className="glass-card p-4">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span>{getStrokeEmoji(session.strokeType)}</span>
            {session.strokeType}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{formatDate(session.date)}</p>
          {session.status === "completed" && session.qualityScore != null && (
            <div className="flex items-center gap-4 mt-2">
              <p className="text-sm text-aqua-300">
                Quality: <span className="font-semibold">{session.qualityScore}</span>/100
              </p>
              {session.numStrokes != null && (
                <p className="text-sm text-slate-400">
                  Strokes: <span className="font-semibold text-slate-300">{session.numStrokes}</span>
                </p>
              )}
            </div>
          )}
          {session.status === "pending" && (
            <p className="text-sm text-amber-400/90 mt-2">Analysis pending — check back soon</p>
          )}
          {session.status === "processing" && (
            <p className="text-sm text-blue-300/90 mt-2">Analysis in progress...</p>
          )}
        </div>
      )}

      {sessionLoading && <LoadingState />}
      {sessionError && <ErrorState message={sessionError} />}
      {isProcessing && <LoadingState message="Analysis in progress..." />}
      {isFailed && <ErrorState message="Analysis failed" onRetry={refetch} />}
      {mlError && !isProcessing && !isFailed && (
        <ErrorState message={mlError} onRetry={refetch} />
      )}
      {showMlLoading && <LoadingState message="Loading analysis..." />}

      {mlResults && (
        <>
          {mlValidating && (
            <p className="text-xs text-slate-500 text-center">Updating...</p>
          )}
          <SimpleSessionAnalysis
            score={mlResults.overallQualityScore}
            features={mlResults.features}
            strokeType={session?.strokeType}
          />
        </>
      )}
    </>
  );
}
