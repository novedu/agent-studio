import { Badge } from './Badge';

interface StatusTagProps {
  status: string;
}

export function StatusTag({ status }: StatusTagProps) {
  return (
    <Badge tone={getTone(status)} className="gap-1.5 font-mono uppercase">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}

function getTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'running' || status === 'queued' || status === 'planning') return 'info';
  if (status === 'success' || status === 'completed') return 'success';
  if (status === 'error' || status === 'failed') return 'danger';
  if (status === 'cancelled') return 'warning';
  if (status === 'streaming') return 'info';
  return 'neutral';
}
