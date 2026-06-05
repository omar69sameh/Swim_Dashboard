"use client";

import Link from "next/link";
import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronDown, Minus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessions } from "@/hooks";
import { useAuthStore } from "@/lib/auth-store";
import LoadingState from "@/components/ui/LoadingState";
import type { Session, StrokeType } from "@/types";
import { TRACKED_STROKES } from "@/lib/stroke-scores";
import { qualityTierDisplay, formatDate, getStrokeEmoji } from "@/lib/utils";

// ─── Session Picker (custom dropdown) ───────────────────────────────────────
// Uses a React portal so the dropdown escapes backdrop-filter stacking contexts.

function SessionPicker({
  label,
  sessions,
  selectedId,
  disabledId,
  onChange,
}: {
  label: string;
  sessions: Session[];
  selectedId: string;
  disabledId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Position the portal dropdown under the trigger button
  function openDropdown() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
  }

  // Close when clicking outside both the button and the portal list
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target);
      // The portal list has data-picker="list" — check that too
      const insidePortal = (target as Element).closest?.("[data-picker='list']");
      if (!insideWrapper && !insidePortal) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const options = sessions.filter((s) => s.id !== disabledId);

  const dropdownList = (
    <AnimatePresence>
      {open && (
        <motion.div
          data-picker="list"
          style={dropdownStyle}
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl border border-white/15 bg-ocean-950 shadow-2xl overflow-hidden"
        >
            {options.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No other sessions available</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {options.map((s) => {
                  const t = qualityTierDisplay(s.qualityTier, s.qualityLabel);
                  const isSelected = s.id === selectedId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => { onChange(s.id); setOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${isSelected ? "bg-aqua-300/5" : ""}`}
                      >
                        {/* Tier badge */}
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${t.bg} ${t.color}`}>
                          {t.text}
                        </span>

                        {/* Date + score */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200">{formatDate(s.date)}</p>
                          {s.numStrokes != null && (
                            <p className="text-[10px] text-slate-600">{s.numStrokes} strokes</p>
                          )}
                        </div>

                        {/* Score */}
                        <span className={`shrink-0 text-sm font-bold ${t.color}`}>
                          {s.qualityScore ?? "—"}
                        </span>

                        {/* Check if selected */}
                        {isSelected && <Check className="w-3.5 h-3.5 text-aqua-300 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
  );

  return (
    <div ref={wrapperRef}>
      <p className="text-xs text-slate-500 mb-2 font-medium">Session {label}</p>

      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
          open
            ? "border-aqua-300/50 bg-aqua-300/5"
            : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
      >
        {selected ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${qualityTierDisplay(selected.qualityTier, selected.qualityLabel).bg} ${qualityTierDisplay(selected.qualityTier, selected.qualityLabel).color}`}>
                {qualityTierDisplay(selected.qualityTier, selected.qualityLabel).text}
              </span>
              <span className="text-sm font-bold text-white">{selected.qualityScore ?? "—"}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">{formatDate(selected.date)}</p>
          </div>
        ) : (
          <span className="text-sm text-slate-500">Choose a session...</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Portal — renders outside all stacking contexts */}
      {typeof document !== "undefined" && createPortal(dropdownList, document.body)}
    </div>
  );
}

// ─── Comparison helpers ──────────────────────────────────────────────────────

type Verdict = "left" | "right" | "tie";

function compare(a: number | undefined, b: number | undefined, higherBetter = true): Verdict {
  if (a == null && b == null) return "tie";
  if (a == null) return "right";
  if (b == null) return "left";
  if (a === b) return "tie";
  return (higherBetter ? a > b : a < b) ? "left" : "right";
}

function MetricRow({
  label, leftVal, rightVal, verdict, note,
}: {
  label: string;
  leftVal: string;
  rightVal: string;
  verdict: Verdict;
  note?: string;
}) {
  const winStyle = "text-sm font-bold text-emerald-400";
  const loseStyle = "text-sm font-semibold text-slate-500";
  const tieStyle = "text-sm font-semibold text-slate-300";

  return (
    <div className="grid grid-cols-[1fr_120px_1fr] items-center py-3 border-b border-white/5 last:border-0">
      <p className={`text-right pr-3 ${verdict === "left" ? winStyle : verdict === "right" ? loseStyle : tieStyle}`}>
        {leftVal}
      </p>
      <div className="text-center px-1">
        <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
        {note && <p className="text-[9px] text-slate-700 mt-0.5">{note}</p>}
        <div className="flex justify-center gap-1.5 mt-1">
          {verdict === "left" ? (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">A wins</span>
          ) : verdict === "right" ? (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">B wins</span>
          ) : (
            <Minus className="w-3 h-3 text-slate-600" />
          )}
        </div>
      </div>
      <p className={`text-left pl-3 ${verdict === "right" ? winStyle : verdict === "left" ? loseStyle : tieStyle}`}>
        {rightVal}
      </p>
    </div>
  );
}

function SessionCard({ session, side }: { session: Session; side: "A" | "B" }) {
  const t = qualityTierDisplay(session.qualityTier, session.qualityLabel);
  const scoreColor =
    (session.qualityScore ?? 0) >= 75
      ? "text-emerald-400"
      : (session.qualityScore ?? 0) >= 50
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 text-center"
    >
      <p className="text-xs text-slate-500 mb-3 font-medium">Session {side}</p>
      <p className={`text-5xl font-display font-bold ${scoreColor}`}>
        {session.qualityScore ?? "—"}
      </p>
      <p className="text-xs text-slate-500 mb-3">/ 100</p>
      <span className={`inline-block text-xs font-medium px-3 py-1 rounded-full border ${t.bg} ${t.color}`}>
        {t.text}
      </span>
      <p className="text-[10px] text-slate-600 mt-3">{formatDate(session.date)}</p>
      {session.numStrokes != null && (
        <p className="text-[10px] text-slate-600">{session.numStrokes} strokes</p>
      )}
    </motion.div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CompareSessionsPage() {
  const user = useAuthStore((s) => s.user);
  const swimmerId = user?.swimmerId ?? "";
  const { sessions, isLoading } = useSessions();

  const [selectedStroke, setSelectedStroke] = useState<StrokeType>("Butterfly");
  const [sessionAId, setSessionAId] = useState("");
  const [sessionBId, setSessionBId] = useState("");

  const eligibleSessions = useMemo(
    () =>
      (sessions ?? [])
        .filter(
          (s) =>
            s.swimmerId === swimmerId &&
            s.strokeType === selectedStroke &&
            s.status === "completed" &&
            s.qualityScore != null
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [sessions, swimmerId, selectedStroke]
  );

  const sessionA = eligibleSessions.find((s) => s.id === sessionAId) ?? null;
  const sessionB = eligibleSessions.find((s) => s.id === sessionBId) ?? null;

  function handleStrokeChange(stroke: StrokeType) {
    setSelectedStroke(stroke);
    setSessionAId("");
    setSessionBId("");
  }

  const scoreVerdict = compare(sessionA?.qualityScore, sessionB?.qualityScore);
  const strokesVerdict = compare(sessionA?.numStrokes, sessionB?.numStrokes);
  const durationVerdict = compare(
    sessionA?.duration && sessionA.duration > 0 ? sessionA.duration : undefined,
    sessionB?.duration && sessionB.duration > 0 ? sessionB.duration : undefined
  );

  return (
    <>
      <Link href="/swimmer" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div>
        <h1 className="text-2xl font-display font-bold text-white">Compare Sessions</h1>
        <p className="text-sm text-slate-400 mt-1">Pick two sessions of the same stroke to see how they differ</p>
      </div>

      {isLoading && <LoadingState message="Loading sessions..." />}

      {!isLoading && sessions && (
        <>
          {/* Stroke selector */}
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500 mb-3">Stroke type</p>
            <div className="flex gap-2 flex-wrap">
              {TRACKED_STROKES.map((stroke) => (
                <button
                  key={stroke}
                  type="button"
                  onClick={() => handleStrokeChange(stroke as StrokeType)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    selectedStroke === stroke
                      ? "bg-aqua-300/10 border-aqua-300/50 text-aqua-300"
                      : "border-white/10 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  {getStrokeEmoji(stroke)} {stroke}
                </button>
              ))}
            </div>
          </div>

          {eligibleSessions.length < 2 ? (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-slate-400">
                You need at least 2 completed {selectedStroke} sessions to compare.
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {eligibleSessions.length === 1
                  ? "You have 1 so far — record one more!"
                  : "No sessions of this stroke type yet."}
              </p>
            </div>
          ) : (
            <>
              {/* Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="glass-card p-4">
                  <SessionPicker
                    label="A"
                    sessions={eligibleSessions}
                    selectedId={sessionAId}
                    disabledId={sessionBId}
                    onChange={setSessionAId}
                  />
                </div>
                <div className="glass-card p-4">
                  <SessionPicker
                    label="B"
                    sessions={eligibleSessions}
                    selectedId={sessionBId}
                    disabledId={sessionAId}
                    onChange={setSessionBId}
                  />
                </div>
              </div>

              {/* Results */}
              {sessionA && sessionB ? (
                <motion.div
                  key={`${sessionAId}-${sessionBId}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Score cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <SessionCard session={sessionA} side="A" />
                    <SessionCard session={sessionB} side="B" />
                  </div>

                  {/* Head-to-head */}
                  <div className="glass-card p-5">
                    <h2 className="text-sm font-semibold text-slate-300 mb-4 text-center">Head-to-Head</h2>

                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_120px_1fr] mb-2">
                      <p className="text-xs text-slate-500 text-right pr-3">Session A</p>
                      <div />
                      <p className="text-xs text-slate-500 pl-3">Session B</p>
                    </div>

                    <MetricRow
                      label="Quality Score"
                      leftVal={String(sessionA.qualityScore ?? "—")}
                      rightVal={String(sessionB.qualityScore ?? "—")}
                      verdict={scoreVerdict}
                      note="higher is better"
                    />
                    <MetricRow
                      label="Risk Level"
                      leftVal={qualityTierDisplay(sessionA.qualityTier, sessionA.qualityLabel).text}
                      rightVal={qualityTierDisplay(sessionB.qualityTier, sessionB.qualityLabel).text}
                      verdict={scoreVerdict}
                    />
                    {(sessionA.numStrokes != null || sessionB.numStrokes != null) && (
                      <MetricRow
                        label="Strokes Detected"
                        leftVal={String(sessionA.numStrokes ?? "—")}
                        rightVal={String(sessionB.numStrokes ?? "—")}
                        verdict={strokesVerdict}
                      />
                    )}
                    {(sessionA.duration > 0 || sessionB.duration > 0) && (
                      <MetricRow
                        label="Duration"
                        leftVal={sessionA.duration > 0 ? `${Math.round(sessionA.duration / 60)} min` : "—"}
                        rightVal={sessionB.duration > 0 ? `${Math.round(sessionB.duration / 60)} min` : "—"}
                        verdict={durationVerdict}
                      />
                    )}
                  </div>

                  {/* Links to full sessions */}
                  <div className="grid grid-cols-2 gap-3">
                    {[{ session: sessionA, side: "A" }, { session: sessionB, side: "B" }].map(({ session, side }) => (
                      <Link
                        key={session.id}
                        href={`/swimmer/session/${session.id}`}
                        className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-sm text-slate-400 hover:text-aqua-300 hover:border-aqua-300/30 transition-colors"
                      >
                        Open Session {side} in full <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="glass-card p-6 text-center">
                  <p className="text-sm text-slate-500">Select both sessions above to see the comparison</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
