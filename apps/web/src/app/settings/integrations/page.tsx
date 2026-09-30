import { AuthShell } from '@/components/auth-shell';
import { SlackSettings } from '@/components/slack-settings';

export default function IntegrationsPage() {
    return <AuthShell><SlackSettings /></AuthShell>;
}