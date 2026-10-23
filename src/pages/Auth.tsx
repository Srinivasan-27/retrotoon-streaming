import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, supabaseReady } from "../lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setNotice("");
    if (!supabaseReady) { setNotice("Add your Supabase URL and anon/publishable key to .env.local first."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        setNotice(data.session ? "Account created!" : "Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err) { setNotice(err instanceof Error ? err.message : "Authentication failed."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-panel"><span className="eyebrow">YOUR NOSTALGIA, YOUR ACCOUNT</span><h1>{mode === "signin" ? "Welcome back." : "Join the club."}</h1><p className="muted">Save favourites and pick up where you left off.</p>
    <form className="stack-form" onSubmit={submit}>
      {mode === "signup" && <label>Username<input required minLength={3} value={username} onChange={e=>setUsername(e.target.value)} placeholder="toonfan27"/></label>}
      <label>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
      <button className="primary-button full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    {notice && <p className="notice" role="status">{notice}</p>}
    <p className="switch-auth">{mode === "signin" ? "New around here?" : "Already have an account?"} <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
    <Link className="back-link" to="/">← Back to discover</Link>
  </div></main>;
}