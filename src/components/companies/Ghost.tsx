/** The /feedback mascot: a friendly ghost (as in "ghosted" by a company). */
export const GHOST_SRC = '/brand/ghost.webp';

export function GhostMascot({ size = 120, float = true, className = '' }: { size?: number; float?: boolean; className?: string }) {
  return (
    <span className={`relative inline-flex flex-col items-center ${className}`} style={{ width: size }} aria-hidden>
      <img src={GHOST_SRC} alt="" width={size} height={size} className={`relative z-10 select-none drop-shadow-[0_12px_18px_rgba(29,78,216,0.18)] ${float ? 'ghost-float' : ''}`} draggable={false} />
      {float && <span className="ghost-shadow -mt-2 h-3 rounded-[50%] bg-ink-900" style={{ width: size * 0.55 }} />}
    </span>
  );
}
