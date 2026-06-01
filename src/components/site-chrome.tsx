import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { user } = useAuth();
  const router = useRouter();

  const logout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-2">
        <span className="inline-block h-7 w-7 rounded-full" style={{ background: "var(--gradient-mint)", border: "1px solid var(--border)" }} />
        <span className="font-display text-lg font-semibold tracking-tight" style={{ color: "var(--forest)" }}>
          SmartKlimat
        </span>
      </Link>
      <nav className="flex items-center gap-3">
        {user ? (
          <>
            <Link to="/kop" className="btn-secondary">Plantera träd</Link>
            <Link to="/konto" className="btn-secondary">Mitt konto</Link>
            <button onClick={logout} className="btn-secondary">Logga ut</button>
          </>
        ) : (
          <>
            <Link to="/auth" className="btn-secondary">Logga in</Link>
            <Link to="/kop" className="btn-primary">Plantera träd</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function Blobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="blob blob-sage" style={{ top: "-120px", left: "-80px", width: "420px", height: "420px" }} />
      <div className="blob blob-mint" style={{ top: "20%", right: "-140px", width: "520px", height: "520px" }} />
      <div className="blob blob-apricot" style={{ bottom: "-160px", left: "30%", width: "480px", height: "380px" }} />
    </div>
  );
}
