import { AuthShell } from '@/components/auth-shell';
import { ComposeForm } from '@/components/compose-form';

export default function ComposePage() {
    return <AuthShell><ComposeForm /></AuthShell>;
}