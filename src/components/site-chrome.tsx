import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import logoBlack from "@/assets/logos/smartklimat-logo-black.png.asset.json";

export const TAGLINE = "Tänk smart, vi har ett gemensamt klimat";


export function SiteHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSeller, setIsSeller] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setIsSeller(false); return; }
      const { data } = await supabase
        .from("team_members")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setIsSeller(!!data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const logout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.navigate({ to: "/" });
  };

  const userLinks = (onClick?: () => void) => (
    <>
      {isSeller ? (
        <Link to="/saljare" search={{}} onClick={onClick} className="btn-secondary whitespace-nowrap text-center">Säljarvy</Link>
      ) : (
        <Link to="/kop" onClick={onClick} className="btn-secondary whitespace-nowrap text-center">Plantera träd</Link>
      )}
      <Link to="/sverige" onClick={onClick} className="btn-secondary whitespace-nowrap text-center">Sverige</Link>
      <Link to="/konto" onClick={onClick} className="btn-secondary whitespace-nowrap text-center">Mitt konto</Link>
      <Link to="/hjalp" onClick={onClick} className="btn-secondary whitespace-nowrap text-center">Hjälp</Link>
      <button onClick={logout} className="btn-secondary whitespace-nowrap text-center">Logga ut</button>
    </>
  );

  const guestLinks = (onClick?: () => void) => (
    <>
      <Link to="/auth" onClick={onClick} className="btn-secondary whitespace-nowrap text-center">Logga in</Link>
      <Link to="/kop" onClick={onClick} className="btn-primary whitespace-nowrap text-center">Plantera träd</Link>
    </>
  );

  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-2" aria-label="SmartKlimat — startsida">
        <img
          src={logoBlack.url}
          alt="SmartKlimat"
          className="h-8 w-auto select-none"
          draggable={false}
        />
      </Link>


      <nav className="hidden md:flex items-center gap-3">
        {user ? userLinks() : guestLinks()}
      </nav>

      <button
        className="md:hidden flex items-center justify-center rounded-full p-2"
        style={{ border: "1px solid var(--border)" }}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Öppna meny"
      >
        {menuOpen ? <X size={22} style={{ color: "var(--forest)" }} /> : <Menu size={22} style={{ color: "var(--forest)" }} />}
      </button>

      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 z-50 px-6 pb-6" style={{ background: "var(--paper)" }}>
          <nav className="flex flex-col gap-3 pt-2">
            {user ? userLinks(() => setMenuOpen(false)) : guestLinks(() => setMenuOpen(false))}
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

export function SiteFooter() {
  return (
    <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-col items-center gap-3 border-t pt-8 text-center sm:flex-row sm:justify-between sm:text-left"
        style={{ borderColor: "var(--border)" }}>
        <Link to="/" className="flex items-center gap-2" aria-label="SmartKlimat">
          <img src={logoBlack.url} alt="SmartKlimat" className="h-6 w-auto opacity-80 select-none" draggable={false} />
        </Link>
        <p className="font-display text-xs" style={{ color: "var(--muted-foreground)" }}>
          {TAGLINE}
        </p>
      </div>
    </footer>
  );
}

