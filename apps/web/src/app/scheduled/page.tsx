import { AuthShell } from '@/components/auth-shell';
import { EmailListView } from '@/components/email-list-view';

export default function ScheduledPage() {
  return <AuthShell><EmailListView mode="scheduled" /></AuthShell>;
}