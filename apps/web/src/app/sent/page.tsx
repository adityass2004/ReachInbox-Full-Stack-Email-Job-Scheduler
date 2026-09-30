import { AuthShell } from '@/components/auth-shell';
import { EmailListView } from '@/components/email-list-view';

export default function SentPage() {
  return <AuthShell><EmailListView mode="sent" /></AuthShell>;
}