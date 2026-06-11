"use client";

import Link from "next/link";
import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronDown, Minus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessions, useSwimmers } from "@/hooks";
import LoadingState from "@/components/ui/LoadingState";
import type { Session, StrokeType } from "@/types";
import { TRACKED_STROKES } from "@/lib/stroke-scores";
import { qualityTierDisplay, formatDate, getStrokeEmoji } from "@/lib/utils";

// ─── Session Picker with swimmer filter ─────────────────────────────────────

function SessionPicker({
  label,
  sessions,
  swimmers,
  selectedId,
  disabledId,
  onChange,
}: {
  label: "A" | "B";
  sessions: Session[];
  swimmers: Map<string, string>;
  selectedId: string;
  disabledId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [swimmerFilter, setSwimmerFilter] = useState<string>("all");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Always open downward. Cap height to available space below (min 200px, max 400px).
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const maxH = Math.min(400, Math.max(200, spaceBelow));
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: maxH,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Element;
      if (!wrapperRef.current?.contains(t as Node) && !t.closest?.("[data-picker]")) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close and reset filter when selection is made
  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setSwimmerFilter("all");
  }

  const available = sessions.filter((s) => s.id !== disabledId);
  const uniqueSwimmerIds = [...new Set(available.map((s) => s.swimmerId))];
  const filtered = swimmerFilter === "all" ? available : available.filter((s) => s.swimmerId === swimmerFilter);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const dropdownPortal = (
    <AnimatePresence>
      {open && (
        <motion.div
          data-picker="list"
          style={dropdownStyle}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.13 }}
          className="rounded-xl border border-white/15 bg-ocean-950 shadow-2xl overflow-hidden"
        >
          {/* ── Filter chips (fixed — never scrolls away) ───────────── */}
          {uniqueSwimmerIds.length > 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3 pb-2 border-b border-white/8 shrink-0">
              <button
                type="button"
                onClick={() => setSwimmerFilter("all")}
                className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  swimmerFilter === "all"
                    ? "bg-aqua-300/15 border-aqua-300/40 text-aqua-300"
                    : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                }`}
              >
                All
              </button>
              {uniqueSwimmerIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSwimmerFilter(id)}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    swimmerFilter === id
                      ? "bg-aqua-300/15 border-aqua-300/40 text-aqua-300"
                      : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                  }`}
                >
                  {swimmers.get(id) ?? id.slice(0, 6)}
                </button>
              ))}
            </div>
          )}

          {/* ── Session list (scrollable, fills remaining height) ────── */}
          {filtered.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate-500 text-center shrink-0">
              No sessions for this swimmer
            </p>
          ) : (
            <ul
              className="divide-y divide-white/5 overflow-y-auto"
              style={{ flex: 1, minHeight: 0 }}
            >
              {filtered.map((s) => {
                const t = qualityTierDisplay(s.qualityTier, s.qualityLabel);
                const name = swimmers.get(s.swimmerId) ?? "—";
                const isSelected = s.id === selectedId;
                const dotColor =
                  t.color.includes("emerald") ? "bg-emerald-400" :
                  t.color.includes("amber")   ? "bg-amber-400"   :
                  t.color.includes("orange")  ? "bg-orange-400"  : "bg-rose-400";

                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(s.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isSelected ? "bg-aqua-300/8" : "hover:bg-white/5"
                      }`}
                    >
                      {/* Tier dot */}
                      <span className={`w-2 h-2 shrink-0 rounded-full ${dotColor}`} />

                      {/* Name + date */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-medium truncate">{name}</p>
                        <p className="text-[10px] text-slate-500">
                          {formatDate(s.date)}{s.numStrokes != null ? ` · ${s.numStrokes} strokes` : ""}
                        </p>
                      </div>

                      {/* Score + tier label */}
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${t.color}`}>{s.qualityScore ?? "—"}</p>
                        <p className={`text-[9px] opacity-75 ${t.color}`}>{t.text}</p>
                      </div>

                      {isSelected && <Check className="w-3.5 h-3.5 text-aqua-300 shrink-0 ml-1" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* ── Footer count (fixed) ─────────────────────────────────── */}
          <div className="shrink-0 px-4 py-2 border-t border-white/5 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              {filtered.length} session{filtered.length !== 1 ? "s" : ""}
            </p>
            {filtered.length > 4 && (
              <p className="text-[10px] text-slate-600">scroll for more ↕</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={wrapperRef}>
      <p className="text-xs text-slate-500 mb-2 font-medium">Session {label}</p>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
          open ? "border-aqua-300/50 bg-aqua-300/5" : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
      >
        {selected ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${qualityTierDisplay(selected.qualityTier, selected.qualityLabel).bg} ${qualityTierDisplay(selected.qualityTier, selected.qualityLabel).color}`}>
                {qualityTierDisplay(selected.qualityTier, selected.qualityLabel).text}
              </span>
              <span className="text-sm font-bold text-white">{selected.qualityScore ?? "—"}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              {swimmers.get(selected.swimmerId) ?? "—"} · {formatDate(selected.date)}
            </p>
          </div>
        ) : (
          <span className="text-sm text-slate-500">Choose a session...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {typeof document !== "undefined" && createPortal(dropdownPortal, document.body)}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Verdict = "left" | "right" | "tie";

function compare(a: number | undefined, b: number | undefined, higherBetter = true): Verdict {
  if (a == null && b == null) return "tie";
  if (a == null) return "right";
  if (b == null) return "left";
  if (a === b) return "tie";
  return (higherBetter ? a > b : a < b) ? "left" : "right";
}

function MetricRow({ label, leftVal, rightVal, verdict, leftColor, rightColor }: {
  label: string; leftVal: string; rightVal: string; verdict: Verdict;
  leftColor?: string; rightColor?: string;
}) {
  const winCls = "font-bold";
  const loseCls = "text-slate-500";
  const tieCls = "text-slate-300";

  return (
    <div className="grid grid-cols-[1fr_100px_1fr] items-center py-3.5 border-b border-white/5 last:border-0">
      <p className={`text-right pr-4 text-sm ${leftColor ?? (verdict === "left" ? "text-emerald-400 " + winCls : verdict === "right" ? loseCls : tieCls)}`}>
        {leftVal}
      </p>
      <div className="text-center">
        <p className="text-[10px] text-slate-500 mb-1">{label}</p>
        {verdict === "tie"
          ? <Minus className="w-3 h-3 text-slate-600 mx-auto" />
          : <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
              {verdict === "left" ? "A wins" : "B wins"}
            </span>}
      </div>
      <p className={`text-left pl-4 text-sm ${rightColor ?? (verdict === "right" ? "text-emerald-400 " + winCls : verdict === "left" ? loseCls : tieCls)}`}>
        {rightVal}
      </p>
    </div>
  );
}

function ScoreCard({ session, side, swimmerName }: { session: Session; side: "A" | "B"; swimmerName: string }) {
  const t = qualityTierDisplay(session.qualityTier, session.qualityLabel);
  const score = session.qualityScore ?? 0;
  const scoreColor = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-rose-400";
  const glowColor = score >= 75 ? "bg-emerald-400/5 border-emerald-400/20" : score >= 50 ? "bg-amber-400/5 border-amber-400/20" : "bg-rose-400/5 border-rose-400/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card border p-5 text-center ${glowColor}`}
    >
      <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 mb-3 bg-white/5 px-2.5 py-1 rounded-full">
        <span className="font-semibold text-slate-300">Session {side}</span>
      </div>
      <p className="text-sm font-semibold text-slate-200 mb-4 truncate">{swimmerName}</p>
      <p className={`text-6xl font-display font-bold leading-none ${scoreColor}`}>{session.qualityScore ?? "—"}</p>
      <p className="text-xs text-slate-500 mt-1 mb-4">/ 100</p>
      <span className={`inline-block text-xs font-medium px-3 py-1.5 rounded-full border ${t.bg} ${t.color}`}>
        {t.text}
      </span>
      <div className="mt-3 text-[10px] text-slate-600">
        {formatDate(session.date)}
        {session.numStrokes != null && <span className="ml-2">· {session.numStrokes} strokes</span>}
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachComparePage() {
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { swimmers, isLoading: swimmersLoading } = useSwimmers();
  const isLoading = sessionsLoading || swimmersLoading;

  const [selectedStroke, setSelectedStroke] = useState<StrokeType>("Butterfly");
  const [sessionAId, setSessionAId] = useState("");
  const [sessionBId, setSessionBId] = useState("");

  const swimmerMap = useMemo(() => {
    const map = new Map<string, string>();
    (swimmers ?? []).forEach((sw) => map.set(sw.id, sw.name));
    return map;
  }, [swimmers]);

  const eligibleSessions = useMemo(() =>
    (sessions ?? [])
      .filter((s) => s.strokeType === selectedStroke && s.status === "completed" && s.qualityScore != null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [sessions, selectedStroke]
  );

  function handleStrokeChange(stroke: StrokeType) {
    setSelectedStroke(stroke);
    setSessionAId("");
    setSessionBId("");
  }

  const sessionA = eligibleSessions.find((s) => s.id === sessionAId) ?? null;
  const sessionB = eligibleSessions.find((s) => s.id === sessionBId) ?? null;

  const scoreVerdict = compare(sessionA?.qualityScore, sessionB?.qualityScore);
  const strokesVerdict = compare(sessionA?.numStrokes, sessionB?.numStrokes);

  // Summary: how many sessions per swimmer
  const perSwimmerCount = useMemo(() => {
    const counts = new Map<string, number>();
    eligibleSessions.forEach((s) => counts.set(s.swimmerId, (counts.get(s.swimmerId) ?? 0) + 1));
    return counts;
  }, [eligibleSessions]);

  return (
    <>
      <Link href="/coach" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div>
        <h1 className="text-2xl font-display font-bold text-white">Compare Sessions</h1>
        <p className="text-sm text-slate-400 mt-1">
          Compare any two sessions — same swimmer or across your team
        </p>
      </div>

      {isLoading && <LoadingState message="Loading sessions..." />}

      {!isLoading && sessions && (
        <>
          {/* Stroke selector */}
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500 mb-3">Select stroke type</p>
            <div className="flex gap-2 flex-wrap mb-3">
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

            {/* Per-swimmer session availability */}
            {perSwimmerCount.size > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                <span className="text-[10px] text-slate-600 self-center">Available:</span>
                {Array.from(perSwimmerCount.entries()).map(([id, count]) => (
                  <span key={id} className="text-[10px] text-slate-400 bg-white/5 border border-white/8 rounded-full px-2 py-0.5">
                    {swimmerMap.get(id) ?? "?"} — {count} session{count > 1 ? "s" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>

          {eligibleSessions.length < 2 ? (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-slate-400">
                Need at least 2 completed {selectedStroke} sessions across your swimmers.
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {eligibleSessions.length === 1 ? "Only 1 session found." : "No sessions of this type yet."}
              </p>
            </div>
          ) : (
            <>
              {/* Session pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="glass-card p-4">
                  <SessionPicker label="A" sessions={eligibleSessions} swimmers={swimmerMap}
                    selectedId={sessionAId} disabledId={sessionBId} onChange={setSessionAId} />
                </div>
                <div className="glass-card p-4">
                  <SessionPicker label="B" sessions={eligibleSessions} swimmers={swimmerMap}
                    selectedId={sessionBId} disabledId={sessionAId} onChange={setSessionBId} />
                </div>
              </div>

              {sessionA && sessionB ? (
                <motion.div
                  key={`${sessionAId}-${sessionBId}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Score cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <ScoreCard session={sessionA} side="A" swimmerName={swimmerMap.get(sessionA.swimmerId) ?? "—"} />
                    <ScoreCard session={sessionB} side="B" swimmerName={swimmerMap.get(sessionB.swimmerId) ?? "—"} />
                  </div>

                  {/* Head-to-head */}
                  <div className="glass-card p-5">
                    <h2 className="text-sm font-semibold text-slate-300 mb-1 text-center">Head-to-Head</h2>
                    <p className="text-[10px] text-slate-600 text-center mb-4">
                      {sessionA.swimmerId === sessionB.swimmerId
                        ? `Same swimmer · ${swimmerMap.get(sessionA.swimmerId) ?? "—"}`
                        : `${swimmerMap.get(sessionA.swimmerId) ?? "—"} vs ${swimmerMap.get(sessionB.swimmerId) ?? "—"}`}
                    </p>

                    <div className="grid grid-cols-[1fr_100px_1fr] mb-2 pb-2 border-b border-white/8">
                      <p className="text-xs text-slate-500 font-medium text-right pr-4">Session A</p>
                      <div />
                      <p className="text-xs text-slate-500 font-medium pl-4">Session B</p>
                    </div>

                    <MetricRow label="Quality Score"
                      leftVal={String(sessionA.qualityScore ?? "—")}
                      rightVal={String(sessionB.qualityScore ?? "—")}
                      verdict={scoreVerdict} />

                    <MetricRow label="Risk Level"
                      leftVal={qualityTierDisplay(sessionA.qualityTier, sessionA.qualityLabel).text}
                      rightVal={qualityTierDisplay(sessionB.qualityTier, sessionB.qualityLabel).text}
                      verdict={scoreVerdict}
                      leftColor={qualityTierDisplay(sessionA.qualityTier, sessionA.qualityLabel).color}
                      rightColor={qualityTierDisplay(sessionB.qualityTier, sessionB.qualityLabel).color} />

                    {sessionA.swimmerId !== sessionB.swimmerId && (
                      <MetricRow label="Swimmer"
                        leftVal={swimmerMap.get(sessionA.swimmerId) ?? "—"}
                        rightVal={swimmerMap.get(sessionB.swimmerId) ?? "—"}
                        verdict="tie" />
                    )}

                    {(sessionA.numStrokes != null || sessionB.numStrokes != null) && (
                      <MetricRow label="Strokes Detected"
                        leftVal={String(sessionA.numStrokes ?? "—")}
                        rightVal={String(sessionB.numStrokes ?? "—")}
                        verdict={strokesVerdict} />
                    )}
                  </div>

                  {/* Open full sessions */}
                  <div className="grid grid-cols-2 gap-3">
                    {[{ s: sessionA, side: "A" }, { s: sessionB, side: "B" }].map(({ s, side }) => (
                      <Link key={s.id} href={`/coach/session/${s.id}`}
                        className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-sm text-slate-400 hover:text-aqua-300 hover:border-aqua-300/30 transition-colors">
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
