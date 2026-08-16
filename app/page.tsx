'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, ShieldCheck, Lock, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgSettings } from '@/hooks/use-org-settings';
import Image from 'next/image';

export default function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const { logoUrl, orgFullName } = useOrgSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace('/dashboard');
  }, [loading, session, router]);

  const BrandIcon = ({ className }: { className?: string }) =>
    logoUrl ? <Image src={logoUrl} alt="Logo" width={64} height={64} className={className} /> : <Wallet className={className} />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      setSubmitting(false);
      return;
    }
    router.replace('/dashboard');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-accent/5 lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar-accent/40 to-transparent" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-accent text-accent-foreground shadow-lg">
            <BrandIcon className="h-7 w-7 object-contain" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">{orgFullName || 'PSKS Accounting ERP'}</p>
            <p className="text-sm text-sidebar-foreground/60">Enterprise Finance Platform</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <h2 className="max-w-md text-3xl font-semibold leading-tight text-balance">
            Complete double-entry accounting for multi-branch NGO &amp; microfinance operations
          </h2>
          <div className="grid max-w-md gap-4">
            {[
              { icon: Building2, text: 'Branch, project & donor-wise accounting' },
              { icon: ShieldCheck, text: 'Role-based access with full audit trail' },
              { icon: Wallet, text: 'Trial balance, ledger & financial statements' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <f.icon className="h-4 w-4" />
                </div>
                <span className="text-sidebar-foreground/80">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-sidebar-foreground/50">
          &copy; {new Date().getFullYear()} PSKS. All rights reserved.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-in-fade">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm">
              <BrandIcon className="h-12 w-12 object-contain" />
            </div>
            <p className="text-lg font-semibold tracking-tight">{orgFullName || 'PSKS Accounting ERP'}</p>
            <p className="text-xs text-muted-foreground">Enterprise Finance Platform</p>
          </div>

          <Card className="border-border/60 shadow-xl shadow-primary/5">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@psks.org"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() =>
                        toast('Contact your administrator to reset your password', {
                          description: 'Self-service reset coming soon.',
                        })
                      }
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </form>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
