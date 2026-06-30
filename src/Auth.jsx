import React, { useState } from "react";
import { Wallet } from "lucide-react";
import { supabase } from "./supabase.js";

// Shown only in cloud mode when no user is signed in.
export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setMsg("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg(error.message);
        else setMsg("Account created. Check your email if confirmation is required, then sign in.");
      }
    } finally {
      setBusy(false);
    }
  }

  const input = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, boxSizing: "border-box", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, justifyContent: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-grad)", display: "grid", placeItems: "center" }}>
            <Wallet size={24} color="var(--bg)" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Ledger</h1>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {["signin", "signup"].map((m) => (
              <button key={m} onClick={() => { setMode(m); setMsg(""); }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: mode === m ? "var(--border)" : "transparent", color: mode === m ? "#2DD4BF" : "var(--text-3)" }}>
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} style={input} />

          <button onClick={submit} disabled={busy}
            style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", fontWeight: 700, fontSize: 14, background: "var(--accent-grad)", color: "var(--bg)", opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          {msg && <p style={{ fontSize: 13, color: "#FBBF24", marginTop: 12 }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}
