import type { FindingStatus, Severity } from '../types';

type BadgeTone = 'critical' | 'high' | 'medium' | 'low' | 'open' | 'resolved' | 'neutral' | 'success' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  // Severity — distinct, consistent colors used everywhere severity appears.
  critical: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
  high: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20',
  medium: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
  low: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20',
  // Status
  open: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  resolved: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20',
  neutral: 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-500/20',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium capitalize ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={severity}>{severity}</Badge>;
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  return <Badge tone={status}>{status}</Badge>;
}
