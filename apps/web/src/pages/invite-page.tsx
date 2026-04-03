import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { validateInvite } from "@/lib/api";
import { MessageSquare, Loader2, AlertCircle, CheckCircle } from "lucide-react";

interface InvitePageProps {
  code: string;
  onBack: () => void;
}

export function InvitePage({ code, onBack }: InvitePageProps) {
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  useEffect(() => {
    const validate = async () => {
      try {
        const result = await validateInvite(code);
        setValid(result.valid);
        if (!result.valid) {
          setValidationMessage(result.message || "Invalid invite link");
        }
      } catch {
        setValid(false);
        setValidationMessage("Failed to validate invite link");
      } finally {
        setValidating(false);
      }
    };
    validate();
  }, [code]);

  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return;
    try {
      await register(username, email, password, code);
      // On success, auth store will update and App.tsx will show ChatPage
      // Clear the invite path from URL
      window.history.replaceState(null, "", "/");
    } catch {
      // error handled in store
    }
  };

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Invalid Invite</h1>
            <p className="text-sm text-muted-foreground">{validationMessage}</p>
          </div>
          <Button variant="outline" onClick={onBack} className="w-full">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <MessageSquare className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">You're invited!</h1>
          <div className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>Valid invite link</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Create an account to join the workspace
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Username</label>
            <Input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearError();
              }}
              placeholder="Choose a username"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="you@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              placeholder="At least 6 characters"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              Confirm Password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="mt-1"
            />
            {passwordMismatch && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={
              !username.trim() ||
              !email.trim() ||
              !password ||
              passwordMismatch ||
              isLoading
            }
          >
            {isLoading ? "Creating account..." : "Join Workspace"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            onClick={onBack}
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
