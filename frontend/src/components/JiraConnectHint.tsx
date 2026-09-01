import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Reused wherever a feature needs Jira and the org hasn't connected it (or the connection broke). */
export function JiraConnectHint({ action }: { action: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-amber-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      Connect Jira in{' '}
      <Link to="/settings" className="font-medium underline underline-offset-2">
        Settings
      </Link>{' '}
      {action}
    </p>
  );
}
