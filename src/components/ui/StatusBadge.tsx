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
  const tone = status === 'completed' || status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : status === 'action-required' || status === 'cancelled' ? 'bg-red-50 text-red-700 ring-red-200' : status === 'in-progress' || status === 'waiting' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-ink-50 text-ink-500 ring-ink-200';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ring-1 ${compact ? 'text-xs' : 'text-sm'} ${tone}`}><Icon className="h-3.5 w-3.5" />{labels[status]}</span>;
}
