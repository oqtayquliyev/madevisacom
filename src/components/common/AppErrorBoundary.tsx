import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, loadAgain } from '@/lib/lazyPage';

/**
 * Last line of defence: instead of a blank white page, a short message and
 * a button that loads the latest version of the site.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const update = isChunkLoadError(this.state.error);
    const reload = () => void loadAgain(this.state.error);
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-5 text-center">
        <div className="max-w-sm">
          <a href="/" className="text-[22px] font-bold text-ink-950">
            made<span className="text-[#1D4ED8]">visa</span>
          </a>
          <h1 className="mt-6 text-[20px] font-bold text-ink-950">{update ? 'MadeVisa was just updated' : 'Something went wrong'}</h1>
          <p className="mt-2 text-[14px] leading-6 text-ink-600">
            {update ? 'Load the latest version to open this page.' : 'This page hit a problem. Loading it again usually fixes it.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={reload} className="rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-800">
              Load again
            </button>
            <a href="/" className="rounded-lg px-4 py-2.5 text-[14px] font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-white">
              Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
