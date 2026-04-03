import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { LoginPage } from "@/pages/login-page";
import { RegisterPage } from "@/pages/register-page";
import { ChatPage } from "@/pages/chat-page";
import { InvitePage } from "@/pages/invite-page";
import { Loader2 } from "lucide-react";

type AuthView = "login" | "register";

function getInviteCode(): string | null {
  const match = window.location.pathname.match(/^\/invite\/([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const token = useAuthStore((s) => s.token);
  const loadUser = useAuthStore((s) => s.loadUser);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [initialized, setInitialized] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(getInviteCode);

  useEffect(() => {
    const init = async () => {
      if (token) {
        await loadUser();
      }
      setInitialized(true);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initialized || (token && isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading Slock...</p>
        </div>
      </div>
    );
  }

  // If user is already authenticated and on invite page, redirect to chat
  if (isAuthenticated) {
    if (inviteCode) {
      window.history.replaceState(null, "", "/");
    }
    return <ChatPage />;
  }

  // Show invite page if URL contains invite code
  if (inviteCode) {
    return (
      <InvitePage
        code={inviteCode}
        onBack={() => {
          setInviteCode(null);
          window.history.replaceState(null, "", "/");
          setAuthView("login");
        }}
      />
    );
  }

  if (authView === "register") {
    return <RegisterPage onSwitchToLogin={() => setAuthView("login")} />;
  }
  return <LoginPage onSwitchToRegister={() => setAuthView("register")} />;
}

export default App;
