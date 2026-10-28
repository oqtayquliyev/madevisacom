import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { closeJobModal, expandJobModal } from "@/lib/jobModal";

// The job popup over the list: a big rounded card on a dimmed list (desktop), a full-height
// sheet that slides up (phone). The job keeps its own URL; Esc, the ×, the dimmed area or
// Back close it. ↗ opens the same job as a full page. The membership popup (z-90) and other
// sheets sit above it.

export function JobModal({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    // The job page sets its own title; the list's comes back when the popup closes.
    const title = document.title;
    html.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Not while the membership card is up over it.
      if (
        e.key === "Escape" &&
        !document.querySelector('[aria-labelledby="paywall-title"]')
      )
        closeJobModal();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before;
      document.title = title;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // A new job in the same popup starts at the top.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [label]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/50 backdrop-blur-[3px] sm:items-center sm:p-5 lg:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && closeJobModal()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="job-modal-in relative h-[calc(100dvh-10px)] w-full overflow-y-auto overscroll-contain rounded-t-[22px] bg-[#f8fafc] shadow-2xl outline-none sm:h-[min(92dvh,1100px)] sm:max-w-5xl sm:rounded-[28px]"
      >
        {/* Floating controls, over the job's blue header. */}
        <div className="pointer-events-none sticky top-0 z-20 h-0">
          <div className="absolute inset-x-0 top-0 flex justify-end px-3 pt-3 sm:justify-between sm:px-4 sm:pt-4">
            <button
              type="button"
              onClick={expandJobModal}
              aria-label="Open as a full page"
              title="Open as a full page"
              className="pointer-events-auto hidden h-10 w-10 place-items-center rounded-full bg-white/90 text-ink-700 shadow-md ring-1 ring-black/5 backdrop-blur hover:bg-white sm:grid"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeJobModal}
              aria-label="Close"
              className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink-800 shadow-md ring-1 ring-black/5 backdrop-blur hover:bg-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
