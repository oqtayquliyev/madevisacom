import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { closeJobModal } from "@/lib/jobModal";

// The job popup over the list, in the style of a portfolio project card: a wide white card with
// soft 20px corners on a light, washed-out list. A plain ⤢ in the top-left corner makes it fill
// the window, ⤡ brings it back. Esc, the washed-out area, "All jobs" or Back close it; on a phone
// it is a full-height sheet with a ×. The job keeps its own URL. The membership popup (z-90) and
// the sponsorship-document preview (z-80) sit above it.

export function JobModal({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    // The job page sets its own title; the list's comes back when the popup closes.
    const title = document.title;
    html.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Not while another popup is up over it.
      if (
        e.key === "Escape" &&
        !document.querySelector('[aria-labelledby="paywall-title"], [data-over-job-modal]')
      )
        closeJobModal();
    };
    // Capture phase: runs before a popup above it closes itself on the same Esc.
    window.addEventListener("keydown", onKey, true);
    return () => {
      html.style.overflow = before;
      document.title = title;
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // A new job in the same popup starts at the top.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [label]);

  const corner =
    "pointer-events-auto grid h-9 w-9 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

  return createPortal(
    <div
      className={`job-modal-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(238,238,238,0.72)] sm:items-center ${full ? "" : "sm:p-0"}`}
      onMouseDown={(e) => e.target === e.currentTarget && closeJobModal()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`job-modal-in job-modal-scroll relative w-full overflow-y-auto overscroll-contain bg-white outline-none transition-[width,height,max-width,border-radius] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] h-[calc(100dvh_-_10px)] rounded-t-[20px] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] ${
          full
            ? "sm:h-[100dvh] sm:w-screen sm:max-w-none sm:rounded-none"
            : "sm:h-[calc(100dvh_-_2*clamp(16px,4.5vh,44px))] sm:w-[calc(100vw_-_2*clamp(16px,8vw,180px))] sm:max-w-[1500px] sm:rounded-[20px] sm:shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_30px_80px_-20px_rgba(0,0,0,0.18)]"
        }`}
      >
        {/* Corner controls: they sit on the job's blue header and scroll away with it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-3 sm:px-5 sm:pt-5">
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            aria-label={full ? "Make smaller" : "Fill the window"}
            title={full ? "Make smaller" : "Fill the window"}
            className={`${corner} hidden sm:grid`}
          >
            {full ? <Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Maximize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            onClick={closeJobModal}
            aria-label="Close"
            className={`${corner} ml-auto ${full ? "" : "sm:hidden"}`}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
