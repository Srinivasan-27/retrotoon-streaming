import {
  Film,
  Search,
  UserRound,
  LogOut,
  ChevronDown,
  ListVideo,
  Compass,
  Layers,
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function Header({ onSearch }: { onSearch: (q: string) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!profileOpen) return;

    function handleOutsideClick(event: MouseEvent | TouchEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);

    if (error) {
      alert(error.message);
      return;
    }

    setProfileOpen(false);
    navigate("/");
  }

  function submitSearch(value = search) {
    onSearch(value);
    window.dispatchEvent(new CustomEvent("retrotoon-search", { detail: value }));
    setProfileOpen(false);
    document.getElementById("catalogue")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function closeMenus() {
    setProfileOpen(false);
  }

  const username =
    user?.user_metadata?.username || user?.email?.split("@")[0] || "Toon Fan";

  return (
    <>
      <header className="topbar" ref={headerRef}>
        <Link to="/" className="brand" onClick={closeMenus}>
          <span className="brand-icon"><Film size={21} /></span>
          <span>
            RETRO<span className="brand-accent">TOON</span>
            <small>PRESS PLAY ON NOSTALGIA</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Main navigation">
          <NavLink to="/" end>Discover</NavLink>
          <a href="/#catalogue">Collections</a>
          <Link to="/my-list">My List</Link>
        </nav>

        <div className="header-actions">
          <form
            className="search-box"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                onSearch(value);
                window.dispatchEvent(
                  new CustomEvent("retrotoon-search", { detail: value })
                );
              }}
              placeholder="Find a cartoon..."
              aria-label="Search cartoons"
            />
          </form>

          {user ? (
            <div className="profile-menu">
              <button
                type="button"
                className="profile-trigger"
                onClick={() => {
                  setProfileOpen((open) => !open);
                }}
                aria-expanded={profileOpen}
                aria-label="Open account menu"
              >
                <span className="profile-avatar">{username.charAt(0).toUpperCase()}</span>
                <span className="profile-username">{username}</span>
                <ChevronDown size={15} />
              </button>

              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-details">
                    <strong>{username}</strong>
                    <small>{user.email}</small>
                  </div>
                  <Link to="/" className="profile-menu-item mobile-profile-link" onClick={closeMenus}>
                    <Compass size={17} /> Discover
                  </Link>
                  <a href="/#catalogue" className="profile-menu-item mobile-profile-link" onClick={closeMenus}>
                    <Layers size={17} /> Collections
                  </a>
                  <Link to="/my-list" className="profile-menu-item" onClick={closeMenus}>
                    <ListVideo size={17} /> My List
                  </Link>
                  <button
                    type="button"
                    className="profile-menu-item logout-item"
                    onClick={handleSignOut}
                    disabled={signingOut}
                  >
                    <LogOut size={17} />
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="profile-menu">
              <button
                type="button"
                className="icon-button profile-trigger signed-out-profile-trigger"
                title="Account and navigation"
                aria-label="Open account and navigation menu"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((open) => !open)}
              >
                <UserRound size={18} />
              </button>
              {profileOpen && (
                <div className="profile-dropdown">
                  <Link to="/" className="profile-menu-item mobile-profile-link" onClick={closeMenus}><Compass size={17} /> Discover</Link>
                  <a href="/#catalogue" className="profile-menu-item mobile-profile-link" onClick={closeMenus}><Layers size={17} /> Collections</a>
                  <Link to="/my-list" className="profile-menu-item" onClick={closeMenus}><ListVideo size={17} /> My List</Link>
                  <Link to="/auth" className="profile-menu-item" onClick={closeMenus}><UserRound size={17} /> Sign in / Create account</Link>
                </div>
              )}
            </div>
          )}

        </div>

      </header>
    </>
  );
}
