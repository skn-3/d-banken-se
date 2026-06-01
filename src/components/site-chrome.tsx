import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function SiteHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
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

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-3">
        {user ? (
          <>
            <Link to="/kop" className="btn-secondary whitespace-nowrap">Plantera träd</Link>
            <Link to="/konto" className="btn-secondary whitespace-nowrap">Mitt konto</Link>
            <button onClick={logout} className="btn-secondary whitespace-nowrap">Logga ut</button>
          </>
        ) : (
          <>
            <Link to="/auth" className="btn-secondary whitespace-nowrap">Logga in</Link>
            <Link to="/kop" className="btn-primary whitespace-nowrap">Plantera träd</Link>
          </>
        )}
      </nav>

      {/* Mobile hamburger */}
      <button
        className="md:hidden flex items-center justify-center rounded-full p-2"
        style={{ border: "1px solid var(--border)" }}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Öppna meny"
      >
        {menuOpen ? <X size={22} style={{ color: "var(--forest)" }} /> : <Menu size={22} style={{ color: "var(--forest)" }} />}
      </button>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 z-50 px-6 pb-6" style={{ background: "var(--paper)" }}>
          <nav className="flex flex-col gap-3 pt-2">
            {user ? (
              <>
                <Link to="/kop" onClick={() => setMenuOpen(false)} className="btn-secondary whitespace-nowrap text-center">Plantera träd</Link>
                <Link to="/konto" onClick={() => setMenuOpen(false)} className="btn-secondary whitespace-nowrap text-center">Mitt konto</Link>
                <button onClick={logout} className="btn-secondary whitespace-nowrap text-center">Logga ut</button>
              </>
            ) : (
              <>
                <Link to="/auth" onClick={() => setMenuOpen(false)} className="btn-secondary whitespace-nowrap text-center">Logga in</Link>
                <Link to="/kop" onClick={() => setMenuOpen(false)} className="btn-primary whitespace-nowrap text-center">Plantera träd</Link>
              </>
            )}
          </nav>
        </div>
      )}
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
