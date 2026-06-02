import { cn } from "@/lib/utils";

interface StrokeIconProps {
  stroke: string;
  size?: number;
  className?: string;
}

export default function StrokeIcon({ stroke, size = 28, className }: StrokeIconProps) {
  const s = size;
  const shared = "text-aqua-300";

  const icons: Record<string, React.ReactNode> = {
    Freestyle: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={cn(shared, className)}>
        {/* body horizontal */}
        <ellipse cx="14" cy="15" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
        {/* leading arm */}
        <path d="M22 13 Q25 11 26 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* flutter kicks */}
        <path d="M6 16 Q3 18 2 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 14 Q3 12 2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* head */}
        <circle cx="22" cy="11" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    Butterfly: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={cn(shared, className)}>
        {/* both arms arcing up symmetrically */}
        <path d="M14 16 Q9 8 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 16 Q19 8 24 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* dolphin kick */}
        <path d="M11 18 Q14 22 17 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* body */}
        <path d="M12 15 L16 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* head */}
        <circle cx="14" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    Breaststroke: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={cn(shared, className)}>
        {/* arms spreading out like frog */}
        <path d="M14 13 Q9 11 4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 13 Q19 11 24 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* frog kick legs */}
        <path d="M11 17 Q9 21 7 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M17 17 Q19 21 21 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* body */}
        <ellipse cx="14" cy="15" rx="3" ry="2" stroke="currentColor" strokeWidth="1.5" />
        {/* head */}
        <circle cx="14" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    Backstroke: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={cn(shared, className)}>
        {/* body on back - slightly tilted */}
        <ellipse cx="14" cy="16" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
        {/* arm raised back */}
        <path d="M22 14 Q25 10 24 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* flutter kicks */}
        <path d="M6 17 Q3 19 2 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 15 Q3 13 2 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* head looking up */}
        <circle cx="22" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    IM: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={cn(shared, className)}>
        {/* four quadrant arrows representing 4 strokes */}
        <path d="M14 4 L14 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 18 L14 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 14 L10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18 14 L24 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="14" r="4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  };

  return <>{icons[stroke] ?? icons["Freestyle"]}</>;
}
