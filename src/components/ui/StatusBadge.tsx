import { AlertCircle, Check, Circle, Clock3, XCircle } from 'lucide-react';
import type { Status } from '@/types';

const labels: Record<Status, string> = {
  completed: 'Completed',
  confirmed: 'Confirmed',
  'in-progress': 'In progress',
  waiting: 'Waiting',
  'not-started': 'Not started',
  'action-required': 'Action required',
  cancelled: 'Cancelled',
};

export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const Icon = status === 'completed' || status === 'confirmed' ? Check : status === 'action-required' ? AlertCircle : status === 'cancelled' ? XCircle : status === 'in-progress' || status === 'waiting' ? Clock3 : Circle;
  const tone = status === 'completed' || status === 'confirmed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800' : status === 'action-required' || status === 'cancelled' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-800' : status === 'in-progress' || status === 'waiting' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800' : 'bg-ink-50 dark:bg-ink-800 text-ink-500 dark:text-ink-400 ring-ink-200 dark:ring-ink-700';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ring-1 ${compact ? 'text-xs' : 'text-sm'} ${tone}`}><Icon className="h-3.5 w-3.5" />{labels[status]}</span>;
}
