import React, { useState, useMemo, useEffect } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet,
  Target, Pencil, LogOut,
} from "lucide-react";
import { store } from "./store.js";
import { supabase, CLOUD_ENABLED } from "./supabase.js";
import Auth from "./Auth.jsx";

const BUCKET_NAMES = ["Needs", "Wants", "Savings"];

// Bucket display config. Income categories don't roll into a spending bucket.
const BUCKETS = {
  Needs:   { color: "#60A5FA" },
  Wants:   { color: "#FB7185" },
  Savings: { color: "#34D399" },
};

const SWATCHES = ["#34D399", "#2DD4BF", "#60A5FA", "#3B82F6", "#0EA5E9", "#6366F1", "#A78BFA", "#F472B6", "#FB7185", "#FBBF24", "#FB923C", "#F87171"];

// ---------------------------------------------------------------------------
// THEMES. Each is a set of CSS custom properties applied to the app wrapper.
// Components reference var(--bg), var(--surface), etc., so switching the theme
// object restyles the whole app. "system" follows the OS light/dark setting.
// ---------------------------------------------------------------------------
const THEME_VARS = {
  dark: {
    "--bg": "#0B1120", "--surface": "#111A2E", "--surface-2": "#0F1A2E",
    "--border": "#1E293B", "--text": "#E2E8F0", "--text-2": "#94A3B8",
    "--text-3": "#64748B", "--text-4": "#475569", "--accent": "#2DD4BF",
    "--accent-grad": "var(--accent-grad)",
  },
  light: {
    "--bg": "#F1F5F9", "--surface": "#FFFFFF", "--surface-2": "#F8FAFC",
    "--border": "#E2E8F0", "--text": "#0F172A", "--text-2": "#475569",
    "--text-3": "#64748B", "--text-4": "#94A3B8", "--accent": "#0D9488",
    "--accent-grad": "linear-gradient(135deg,#14B8A6,#3B82F6)",
  },
  girlboss: {
    "--bg": "#2A0A1E", "--surface": "#3D1230", "--surface-2": "#330E28",
    "--border": "#5B1D45", "--text": "#FFE4F1", "--text-2": "#F9A8D4",
    "--text-3": "#E879B9", "--text-4": "#BE5C97", "--accent": "#FF2D9B",
    "--accent-grad": "linear-gradient(135deg,#FF2D9B,#FF8FC8)",
  },
  pride: {
    "--bg": "#15121C", "--surface": "#1E1A28", "--surface-2": "#191522",
    "--border": "#332B45", "--text": "#F8FAFC", "--text-2": "#C4B5E0",
    "--text-3": "#9C8AB8", "--text-4": "#6B5D85", "--accent": "#FF4D6D",
    "--accent-grad": "linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)",
    // Pride goes full rainbow: animated gradient wash behind translucent cards.
    "--bg-image": "linear-gradient(135deg, #E4030333 0%, #FF8C0033 17%, #FFED0033 34%, #00802633 51%, #004DFF33 68%, #75078733 85%, #E4030333 100%)",
    "--surface-alpha": "rgba(30,26,40,0.82)",
    "--rainbow": "linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)",
  },
};

// Themes that get the special rainbow background treatment.
const RAINBOW_THEMES = new Set(["pride"]);

const THEME_OPTIONS = [
  { id: "system", label: "System", hint: "Follows your device", swatch: "linear-gradient(135deg,#0B1120 50%,#F1F5F9 50%)" },
  { id: "light", label: "Light mode", hint: "Bright and clean", swatch: "#F1F5F9" },
  { id: "dark", label: "Dark mode", hint: "Easy on the eyes", swatch: "#0B1120" },
  { id: "girlboss", label: "Girl boss mode", hint: "Unapologetically pink", swatch: "linear-gradient(135deg,#FF2D9B,#FF8FC8)" },
  { id: "pride", label: "Pride mode", hint: "Rainbow accents", swatch: "linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)" },
];

// Resolve "system" to dark/light using the OS preference.
function resolveTheme(choice) {
  if (choice === "system") {
    const prefersLight = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  }
  return choice;
}

// Saves `value` via `saveFn` 600ms after it last changed (skips first render).
function useDebouncedSave(value, ready, saveFn) {
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => { Promise.resolve(saveFn(value)).catch(console.error); }, 600);
    return () => clearTimeout(id);
  }, [value, ready]);
}

// Needs and Savings are user-editable; Wants is always the leftover so the
// three sum to 100. Setting `changed` (Needs or Savings) keeps the other
// editable bucket fixed and gives the rest to Wants. The editable pair is
// clamped so it can't exceed 100 (Wants never goes negative).
function rebalance(alloc, changed, newPct) {
  if (changed === "Wants") return alloc; // Wants isn't directly editable
  newPct = Math.max(0, Math.min(100, newPct));
  const otherEditable = changed === "Needs" ? "Savings" : "Needs";
  const otherVal = Math.min(alloc[otherEditable], 100 - newPct);
  const next = {
    ...alloc,
    [changed]: newPct,
    [otherEditable]: otherVal,
    Wants: 100 - newPct - otherVal,
  };
  return next;
}

const round2 = (n) => Math.round(n * 100) / 100;
// Stored allocations keep 5 decimals of precision; displays round to 2.
const round5 = (n) => Math.round(n * 100000) / 100000;

function resolveAlloc({ allocMode, allocNeeds, allocSavings }, amt) {
  const n = parseFloat(allocNeeds) || 0;
  const s = parseFloat(allocSavings) || 0;
  if (allocMode === "val") {
    const needs$ = Math.max(0, n);
    const savings$ = Math.max(0, Math.min(s, Math.max(0, amt - needs$)));
    const wants$ = Math.max(0, amt - needs$ - savings$);
    const pctOf = (d) => (amt > 0 ? (d / amt) * 100 : 0);
    return {
      pct: { Needs: pctOf(needs$), Savings: pctOf(savings$), Wants: pctOf(wants$) },
      val: { Needs: needs$, Savings: savings$, Wants: wants$ },
    };
  }
  const needsP = Math.max(0, Math.min(100, n));
  const savingsP = Math.max(0, Math.min(s, Math.max(0, 100 - needsP)));
  const wantsP = Math.max(0, 100 - needsP - savingsP);
  const dollarOf = (p) => (p / 100) * amt;
  return {
    pct: { Needs: needsP, Savings: savingsP, Wants: wantsP },
    val: { Needs: dollarOf(needsP), Savings: dollarOf(savingsP), Wants: dollarOf(wantsP) },
  };
}

const fmt = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmt2 = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!CLOUD_ENABLED);
  const [data, setData] = useState(null);

  // Track auth session in cloud mode.
  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load data once we know who the user is (or immediately in local mode).
  useEffect(() => {
    if (!authReady) return;
    if (CLOUD_ENABLED && !session) { setData(null); return; }
    let alive = true;
    Promise.resolve(store.load()).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [authReady, session]);

  if (CLOUD_ENABLED && !authReady) return <Splash label="Loading…" />;
  if (CLOUD_ENABLED && !session) return <Auth />;
  if (!data) return <Splash label="Loading your budget…" />;

  return <BudgetApp initial={data} session={session} />;
}

function Splash({ label }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-3)", display: "grid", placeItems: "center", fontSize: 14 }}>
      {label}
    </div>
  );
}

function BudgetApp({ initial, session }) {
  const [transactions, setTransactions] = useState(initial.transactions);
  const [budgets, setBudgets] = useState(initial.budgets);
  const [categories, setCategories] = useState(initial.categories);
  const [tab, setTab] = useState("overview");
  const [theme, setTheme] = useState("dark");

  const [systemTick, setSystemTick] = useState(0);
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemTick((t) => t + 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  const resolvedTheme = resolveTheme(theme);
  const baseVars = THEME_VARS[resolvedTheme] || THEME_VARS.dark;
  const themeVars = RAINBOW_THEMES.has(resolvedTheme)
    ? { ...baseVars, "--surface": baseVars["--surface-alpha"] || baseVars["--surface"] }
    : baseVars;
  const isRainbow = RAINBOW_THEMES.has(resolvedTheme);

  // Persist whenever a collection changes, debounced so rapid edits
  // (typing a budget limit, dragging an allocation) don't spam the backend.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  useDebouncedSave(transactions, hydrated, store.saveTransactions);
  useDebouncedSave(budgets, hydrated, store.saveBudgets);
  useDebouncedSave(categories, hydrated, store.saveCategories);

  const [form, setForm] = useState({
    type: "expense", category: "Groceries", amount: "", note: "",
    date: new Date().toISOString().slice(0, 10),
    allocMode: "val",
    allocNeeds: 0,
    allocSavings: 0,
  });

  // Bumps a counter to retrigger the dancing cat each time income is added.
  const [catCheer, setCatCheer] = useState(0);

  // Lookups derived from the live category list.
  const catByName = useMemo(() => {
    const m = {};
    categories.forEach((c) => (m[c.name] = c));
    return m;
  }, [categories]);
  const bucketOf = (name) => catByName[name]?.bucket || "Wants";
  const colorOf = (name) => catByName[name]?.color || "var(--text-3)";
  const incomeCats = categories.filter((c) => c.kind === "income");
  const expenseCats = categories.filter((c) => c.kind === "expense");

  // ---- derived numbers ----
  const totals = useMemo(() => {
    const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const spendByCategory = useMemo(() => {
    const map = {};
    transactions.filter((t) => t.type === "expense").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const budgetStatus = useMemo(() => {
    return budgets.map((b) => {
      const spent = transactions
        .filter((t) => t.type === "expense" && t.category === b.category)
        .reduce((s, t) => s + t.amount, 0);
      return { ...b, spent, pct: Math.min(100, (spent / b.limit) * 100), over: spent > b.limit };
    });
  }, [budgets, transactions]);

  // Spending split across buckets, vs the user's planned allocations.
  // "target" = sum of each paycheck's allocated dollars to that bucket.
  const bucketTotals = useMemo(() => {
    const spent = { Needs: 0, Wants: 0, Savings: 0 };
    const planned = { Needs: 0, Wants: 0, Savings: 0 };
    transactions.forEach((t) => {
      if (t.type === "expense") {
        spent[bucketOf(t.category)] += t.amount;
      } else if (t.type === "income" && t.alloc) {
        BUCKET_NAMES.forEach((b) => { planned[b] += (t.alloc[b] / 100) * t.amount; });
      }
    });
    return BUCKET_NAMES.map((name) => ({
      name,
      spent: spent[name],
      allocated: planned[name],
      remaining: planned[name] - spent[name],
      target: planned[name],
      plannedPct: totals.income > 0 ? (planned[name] / totals.income) * 100 : 0,
      color: BUCKETS[name].color,
      over: spent[name] > planned[name],
    }));
  }, [transactions, totals.income, categories]);

  // ---- mutators (the Supabase swap points) ----
  function addTransaction() {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;
    const base = { id: Date.now(), type: form.type, category: form.category, note: form.note, date: form.date, amount: amt };
    if (form.type === "income") {
      const resolved = resolveAlloc(form, amt);
      base.alloc = { Needs: resolved.pct.Needs, Wants: resolved.pct.Wants, Savings: resolved.pct.Savings };
      setCatCheer((c) => c + 1); // dance, kitty!
    }
    setTransactions((prev) => [base, ...prev]);
    setForm((f) => ({ ...f, amount: "", note: "", allocMode: "val", allocNeeds: 0, allocSavings: 0 }));
  }

  // Set the exact number the user typed for Needs or Savings, in the current
  // unit. Nothing is converted, so the entered value is preserved exactly.
  function updateFormAlloc(bucket, raw) {
    setForm((f) => {
      if (bucket === "Needs") return { ...f, allocNeeds: raw };
      if (bucket === "Savings") return { ...f, allocSavings: raw };
      return f;
    });
  }

  // Switch the editing unit. Convert current entries into the new unit ONCE so
  // the displayed split stays the same when you flip the toggle.
  function setAllocMode(mode) {
    setForm((f) => {
      if (mode === f.allocMode) return f;
      const amt = parseFloat(f.amount) || 0;
      const r = resolveAlloc(f, amt);
      const src = mode === "val" ? r.val : r.pct;
      return { ...f, allocMode: mode, allocNeeds: round2(src.Needs), allocSavings: round2(src.Savings) };
    });
  }

  function deleteTransaction(id) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function updateBudget(category, limit) {
    setBudgets((prev) =>
      prev.map((b) => (b.category === category ? { ...b, limit: parseFloat(limit) || 0 } : b))
    );
  }

  // ---- category CRUD ----
  function addCategory({ name, kind, bucket, color }) {
    const clean = name.trim();
    if (!clean) return;
    if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return; // no dupes
    setCategories((prev) => [
      ...prev,
      { id: "c" + Date.now(), name: clean, kind, bucket: kind === "income" ? null : (bucket || "Wants"), color },
    ]);
  }

  function updateCategory(id, patch) {
    setCategories((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch, bucket: (patch.kind ?? c.kind) === "income" ? null : (patch.bucket ?? c.bucket ?? "Wants") } : c));
      // If the name changed, cascade to transactions, budgets, and form selection.
      if (patch.name && patch.name.trim() && patch.name.trim() !== target.name) {
        const newName = patch.name.trim();
        setTransactions((tx) => tx.map((t) => (t.category === target.name ? { ...t, category: newName } : t)));
        setBudgets((bg) => bg.map((b) => (b.category === target.name ? { ...b, category: newName } : b)));
        setForm((f) => (f.category === target.name ? { ...f, category: newName } : f));
      }
      return next;
    });
  }

  function deleteCategory(id) {
    const target = categories.find((c) => c.id === id);
    if (!target) return;
    // Block deletion if transactions still use it — safer than silently reassigning.
    const inUse = transactions.some((t) => t.category === target.name);
    if (inUse) {
      alert(`"${target.name}" is used by existing transactions. Reassign or delete those first.`);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setBudgets((prev) => prev.filter((b) => b.category !== target.name));
    setForm((f) => (f.category === target.name ? { ...f, category: (f.type === "income" ? incomeCats : expenseCats).find((c) => c.id !== id)?.name || "" } : f));
  }

  return (
    <div style={{
      minHeight: "100vh", color: "var(--text)", fontFamily: "ui-sans-serif, system-ui, sans-serif", ...themeVars,
      background: "var(--bg)",
      backgroundImage: isRainbow ? "var(--bg-image)" : "none",
      backgroundSize: isRainbow ? "300% 300%" : "auto",
      animation: isRainbow ? "rainbowShift 18s ease infinite" : "none",
    }}>
      {isRainbow && <style>{`
        @keyframes rainbowShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      `}</style>}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 64px" }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-grad)", display: "grid", placeItems: "center" }}>
            <Wallet size={22} color="#FFFFFF" />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 800,
              ...(isRainbow ? { background: "var(--rainbow)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" } : {}),
            }}>Ledger</h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
              {CLOUD_ENABLED ? (session?.user?.email || "Signed in") : "Local mode · saved on this device"}
            </p>
          </div>
          {CLOUD_ENABLED && (
            <button onClick={() => supabase.auth.signOut()}
              title="Sign out"
              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer", color: "var(--text-3)", padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <LogOut size={15} /> Sign out
            </button>
          )}
        </header>

        {/* Slim summary row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 13, color: "var(--text-3)" }}>
          <span>Income <b style={{ color: "#34D399" }}>{fmt(totals.income)}</b></span>
          <span>Spent <b style={{ color: "#FB7185" }}>{fmt(totals.expense)}</b></span>
          <span>Balance <b style={{ color: "#2DD4BF" }}>{fmt(totals.balance)}</b></span>
        </div>

        {/* Needs / Wants / Savings buckets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
          {bucketTotals.map((b) => (
            <BucketCard key={b.name} bucket={b} />
          ))}
        </div>

        {/* Tabs */}
        <nav style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["overview", "add", "budgets", "categories", "settings"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                background: tab === t ? "var(--border)" : "transparent",
                color: tab === t ? "#2DD4BF" : "var(--text-3)",
              }}>
              {t}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <Overview transactions={transactions} spendByCategory={spendByCategory} colorOf={colorOf} onDelete={deleteTransaction} />
        )}
        {tab === "add" && (
          <AddForm form={form} setForm={setForm} onAdd={addTransaction} incomeCats={incomeCats} expenseCats={expenseCats} onFormAlloc={updateFormAlloc} onMode={setAllocMode} />
        )}
        {tab === "budgets" && (
          <Budgets budgetStatus={budgetStatus} onUpdate={updateBudget} colorOf={colorOf} />
        )}
        {tab === "categories" && (
          <Categories categories={categories} onAdd={addCategory} onUpdate={updateCategory} onDelete={deleteCategory} />
        )}
        {tab === "settings" && (
          <Settings theme={theme} onTheme={setTheme} />
        )}
      </div>

      {/* Cat lives at top level so switching tabs never replays it. */}
      <DancingCat trigger={catCheer} />
    </div>
  );
}

function BucketCard({ bucket }) {
  // How much of the allocated money is still left (bar shrinks as you spend).
  const remainPct = bucket.allocated > 0 ? Math.max(0, Math.min(100, (bucket.remaining / bucket.allocated) * 100)) : 0;
  const negative = bucket.remaining < 0;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: bucket.color }}>{bucket.name}</span>
        <span style={{ fontSize: 11, color: "var(--text-4)" }}>{round2(bucket.plannedPct)}%</span>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Allocated</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{fmt(bucket.allocated)}</div>

      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Remaining</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: negative ? "#FB7185" : bucket.color, marginBottom: 8 }}>
        {fmt(bucket.remaining)}
      </div>

      <div style={{ height: 6, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${remainPct}%`, borderRadius: 99, background: negative ? "#FB7185" : bucket.color, transition: "width .3s" }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, icon }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: accent, marginBottom: 6 }}>
        {icon}<span style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Overview({ transactions, spendByCategory, colorOf, onDelete }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card title="Where your money goes">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={spendByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {spendByCategory.map((d, i) => <Cell key={i} fill={colorOf(d.name)} />)}
            </Pie>
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--border)", border: "none", borderRadius: 8, color: "var(--text)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Recent activity">
        <div style={{ display: "grid", gap: 8 }}>
          {transactions.map((t) => (
            <TxRow key={t.id} t={t} onDelete={onDelete} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function TxRow({ t, onDelete }) {
  const isIncome = t.type === "income";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", background: isIncome ? "#0F2E22" : "#2E1620" }}>
        {isIncome ? <TrendingUp size={16} color="#34D399" /> : <TrendingDown size={16} color="#FB7185" />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.category}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t.note || "—"} · {t.date}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: isIncome ? "#34D399" : "#FB7185" }}>
        {isIncome ? "+" : "−"}{fmt(t.amount)}
      </div>
      <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)" }}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

// Split editor that lives INSIDE the Add form. Needs & Savings editable (% or $),
// Wants is the locked remainder. Uses the in-progress form amount for $ math.
function AllocEditor({ form, amount, onFormAlloc, onMode }) {
  const amt = parseFloat(amount) || 0;
  const mode = form.allocMode;
  const resolved = resolveAlloc(form, amt);
  const [draft, setDraft] = useState({}); // raw text while a box is focused
  const boxStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--bg)", color: "var(--text)", fontSize: 14, boxSizing: "border-box",
  };
  const lockedBox = { ...boxStyle, background: "var(--surface)", color: "var(--text-2)", border: "1px dashed var(--border)" };

  const commit = (bucket) => {
    if (draft[bucket] === undefined) return;
    const raw = draft[bucket];
    onFormAlloc(bucket, raw === "" || raw === "-" || raw === "." ? "0" : raw);
    setDraft((d) => { const n = { ...d }; delete n[bucket]; return n; });
  };
  // What each editable box shows: live draft while typing, else the exact entered
  // number (form.allocNeeds / form.allocSavings) — never reconverted.
  const entered = (bucket) => {
    if (draft[bucket] !== undefined) return draft[bucket];
    return round2(bucket === "Needs" ? parseFloat(form.allocNeeds) || 0 : parseFloat(form.allocSavings) || 0);
  };
  const unitSym = mode === "pct" ? "%" : "$";
  // Display for a bucket in the OTHER (read-only) unit, for reference.
  const otherUnit = (b) => mode === "pct"
    ? `$${round2(resolved.val[b]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${round2(resolved.pct[b])}%`;

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 12px 14px", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Allocate this income</span>
        {/* Unit toggle: edit in Percent OR Value — not both. */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 8, padding: 3 }}>
          {[["pct", "Percent"], ["val", "Value"]].map(([m, label]) => (
            <button key={m} onClick={() => onMode(m)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: mode === m ? "var(--accent)" : "transparent",
                color: mode === m ? "#0B1120" : "var(--text-3)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {BUCKET_NAMES.map((b) => {
        const locked = b === "Wants";
        return (
          <div key={b} style={{ display: "grid", gridTemplateColumns: "72px 1fr 96px", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: BUCKETS[b].color }}>
              {b}{locked && <span style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 500 }}> · auto</span>}
            </span>
            <div style={{ position: "relative" }}>
              {mode === "val" && <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 13, pointerEvents: "none" }}>$</span>}
              <input type="number" step="0.01" inputMode="decimal"
                value={locked ? round2(mode === "pct" ? resolved.pct[b] : resolved.val[b]) : entered(b)}
                disabled={locked} readOnly={locked}
                onChange={(e) => setDraft((d) => ({ ...d, [b]: e.target.value }))}
                onBlur={() => commit(b)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ ...(locked ? lockedBox : boxStyle), paddingLeft: mode === "val" ? 22 : 10 }} />
              {mode === "pct" && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)", fontSize: 13, pointerEvents: "none" }}>%</span>}
            </div>
            {/* read-only reference in the other unit */}
            <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right" }}>{otherUnit(b)}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", marginTop: 4 }}>
        Editing in {mode === "pct" ? "percent" : "dollars"} · Wants is the remainder
      </div>
    </div>
  );
}

function AddForm({ form, setForm, onAdd, incomeCats, expenseCats, onFormAlloc, onMode }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isIncome = form.type === "income";
  const list = isIncome ? incomeCats : expenseCats;
  const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" };

  function pickType(ty) {
    setForm((f) => {
      const pool = ty === "income" ? incomeCats : expenseCats;
      const stillValid = pool.some((c) => c.name === f.category);
      return { ...f, type: ty, category: stillValid ? f.category : (pool[0]?.name || "") };
    });
  }

  return (
    <Card title="Add a transaction">
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["expense", "income"].map((ty) => (
            <button key={ty} onClick={() => pickType(ty)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, textTransform: "capitalize",
                background: form.type === ty ? (ty === "income" ? "#0F2E22" : "#2E1620") : "var(--surface-2)",
                color: form.type === ty ? (ty === "income" ? "#34D399" : "#FB7185") : "var(--text-3)" }}>
              {ty}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 12, color: "var(--text-3)" }}>Amount
          <input type="number" value={form.amount} onChange={set("amount")} placeholder="0.00" style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, color: "var(--text-3)" }}>Category
          <select value={form.category} onChange={set("category")} style={inputStyle}>
            {list.length === 0 && <option value="">No categories — add one first</option>}
            {list.map((c) => <option key={c.id} value={c.name}>{c.name}{c.bucket ? ` · ${c.bucket}` : ""}</option>)}
          </select>
        </label>

        {/* The split lives here, only for income. */}
        {isIncome && <AllocEditor form={form} amount={form.amount} onFormAlloc={onFormAlloc} onMode={onMode} />}

        <label style={{ fontSize: 12, color: "var(--text-3)" }}>Note
          <input value={form.note} onChange={set("note")} placeholder="Optional" style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, color: "var(--text-3)" }}>Date
          <input type="date" value={form.date} onChange={set("date")} style={inputStyle} />
        </label>
        <button onClick={onAdd} style={{ padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: "var(--accent-grad)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Plus size={16} /> Add transaction
        </button>
      </div>

    </Card>
  );
}

function Budgets({ budgetStatus, onUpdate, colorOf }) {
  return (
    <Card title="Category budgets">
      <div style={{ display: "grid", gap: 16 }}>
        {budgetStatus.map((b) => (
          <div key={b.category}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>
                <Target size={14} color={b.over ? "#FB7185" : "#2DD4BF"} /> {b.category}
              </div>
              <div style={{ fontSize: 13, color: b.over ? "#FB7185" : "var(--text-2)" }}>
                {fmt(b.spent)} / 
                <input type="number" value={b.limit} onChange={(e) => onUpdate(b.category, e.target.value)}
                  style={{ width: 64, marginLeft: 4, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }} />
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${b.pct}%`, borderRadius: 99, background: b.over ? "#FB7185" : "linear-gradient(90deg,#2DD4BF,#60A5FA)", transition: "width .3s" }} />
            </div>
            {b.over && <div style={{ fontSize: 12, color: "#FB7185", marginTop: 4 }}>Over by {fmt(b.spent - b.limit)}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Categories({ categories, onAdd, onUpdate, onDelete }) {
  const [draft, setDraft] = useState({ name: "", kind: "expense", bucket: "Needs", color: SWATCHES[2] });
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");

  function submit() {
    if (!draft.name.trim()) return;
    onAdd(draft);
    setDraft({ name: "", kind: "expense", bucket: "Needs", color: SWATCHES[2] });
  }
  const inputStyle = { padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card title="New category">
        <div style={{ display: "grid", gap: 10 }}>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Category name (e.g. Pets, Side gig)" style={{ ...inputStyle, width: "100%" }} />
          <div style={{ display: "flex", gap: 8 }}>
            {["expense", "income"].map((k) => (
              <button key={k} onClick={() => setDraft({ ...draft, kind: k })}
                style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, textTransform: "capitalize",
                  background: draft.kind === k ? "var(--border)" : "var(--surface-2)", color: draft.kind === k ? "#2DD4BF" : "var(--text-3)" }}>
                {k}
              </button>
            ))}
          </div>
          {draft.kind === "expense" && (
            <div style={{ display: "flex", gap: 8 }}>
              {BUCKET_NAMES.map((b) => (
                <button key={b} onClick={() => setDraft({ ...draft, bucket: b })}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                    background: draft.bucket === b ? BUCKETS[b].color : "var(--surface-2)", color: draft.bucket === b ? "var(--bg)" : "var(--text-3)" }}>
                  {b}
                </button>
              ))}
            </div>
          )}
          <SwatchRow value={draft.color} onPick={(c) => setDraft({ ...draft, color: c })} />
          <button onClick={submit}
            style={{ padding: "11px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, background: "var(--accent-grad)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={16} /> Add category
          </button>
        </div>
      </Card>

      <Card title="Expense categories">
        <div style={{ display: "grid", gap: 8 }}>
          {expense.map((c) => <CategoryRow key={c.id} c={c} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      </Card>

      <Card title="Income categories">
        <div style={{ display: "grid", gap: 8 }}>
          {income.map((c) => <CategoryRow key={c.id} c={c} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      </Card>
    </div>
  );
}

function CategoryRow({ c, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);

  if (editing) {
    return (
      <div style={{ display: "grid", gap: 8, padding: 12, background: "var(--surface-2)", borderRadius: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
        {c.kind === "expense" && (
          <div style={{ display: "flex", gap: 6 }}>
            {BUCKET_NAMES.map((b) => (
              <button key={b} onClick={() => onUpdate(c.id, { bucket: b })}
                style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: c.bucket === b ? BUCKETS[b].color : "var(--bg)", color: c.bucket === b ? "var(--bg)" : "var(--text-3)" }}>
                {b}
              </button>
            ))}
          </div>
        )}
        <SwatchRow value={c.color} onPick={(col) => onUpdate(c.id, { color: col })} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { onUpdate(c.id, { name }); setEditing(false); }}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, background: "#2DD4BF", color: "var(--bg)" }}>Save</button>
          <button onClick={() => { setName(c.name); setEditing(false); }}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--text-3)" }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 10 }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: c.color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
        {c.bucket && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{c.bucket}</div>}
      </div>
      <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>
        <Pencil size={15} />
      </button>
      <button onClick={() => onDelete(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)" }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function SwatchRow({ value, onPick }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {SWATCHES.map((c) => (
        <button key={c} onClick={() => onPick(c)}
          style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: "pointer",
            border: value === c ? "2px solid var(--text)" : "2px solid transparent" }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8-bit dancing cat — DELUXE EDITION.
// Triggers only on income add. For 3 seconds: dims the whole UI, throws colored
// disco beams + a spinning disco ball across the screen, and a full-body pixel
// cat busts an extravagant multi-move dance. Then everything fades back.
// ---------------------------------------------------------------------------
function DancingCat({ trigger }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!trigger) return; // don't show on first mount
    setShow(true);
    const id = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(id);
  }, [trigger]);

  if (!show) return null;

  // Full-body cat sprite. Colors:
  const PX = 9;
  const B = "#4B4358";   // body (charcoal)
  const D = "#39323F";   // body shading
  const O = "#1B1722";   // outline
  const P = "#FB7185";    // ears / nose / paws pads
  const W = "#FDE68A";   // eyes
  const G = "#F8FAFC";   // chest/belly highlight
  const _ = null;

  // 16 wide x 18 tall — head, body, two raised "dancing" arms, legs, curl tail.
  const sprite = [
    [_,_,O,O,_,_,_,_,_,_,_,_,O,O,_,_],
    [_,O,P,P,O,_,_,_,_,_,_,O,P,P,O,_],
    [_,O,B,B,B,O,O,O,O,O,O,B,B,B,O,_],
    [O,B,B,B,B,B,B,B,B,B,B,B,B,B,B,O],
    [O,B,W,W,B,B,B,B,B,B,B,B,W,W,B,O],
    [O,B,W,W,B,B,B,B,B,B,B,B,W,W,B,O],
    [O,B,B,B,B,B,P,P,P,B,B,B,B,B,B,O],
    [O,B,B,B,B,B,B,P,B,B,B,B,B,B,B,O],
    [_,O,O,B,B,B,B,B,B,B,B,B,B,O,O,_],
    [_,P,O,B,G,G,G,G,G,G,B,B,O,P,_],   // raised paws (pink) at sides
    [P,P,O,B,G,G,G,G,G,G,B,B,O,P,P],
    [_,_,O,B,B,G,G,G,G,B,B,B,O,_,_],
    [_,_,O,B,B,B,B,B,B,B,B,B,O,O,_],   // tail starts curling out right
    [_,_,O,D,B,B,B,B,B,B,D,B,B,O,O,_],
    [_,_,O,D,B,O,O,B,O,O,D,B,B,B,O,_],
    [_,_,O,B,O,P,P,O,P,P,O,B,O,O,_,_],  // two legs with pink pads
    [_,_,_,O,O,P,P,O,P,P,O,O,_,_,_,_],
    [_,_,_,_,O,O,O,_,O,O,O,_,_,_,_,_],
  ];

  const w = sprite[0].length * PX;
  const h = sprite.length * PX;
  const discoColors = ["#FB7185", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#2DD4BF"];

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none", overflow: "hidden" }}>
      <style>{`
        @keyframes discoDim {
          0%   { opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes beamSwing {
          0%   { transform: rotate(var(--a)) scaleY(0.6); opacity: 0; }
          15%  { opacity: 0.55; }
          50%  { transform: rotate(calc(var(--a) + 28deg)) scaleY(1.1); }
          85%  { opacity: 0.55; }
          100% { transform: rotate(var(--a)) scaleY(0.6); opacity: 0; }
        }
        @keyframes ballSpin { to { transform: rotate(360deg); } }
        @keyframes ballDrop {
          0% { transform: translateX(-50%) translateY(-120px); opacity: 0; }
          15% { transform: translateX(-50%) translateY(0); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateX(-50%) translateY(-60px); opacity: 0; }
        }
        @keyframes catShow {
          0%   { opacity: 0; transform: translateY(60px) scale(0.5); }
          10%  { opacity: 1; transform: translateY(0) scale(1.15); }
          16%  { transform: translateY(0) scale(1); }
          90%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(30px) scale(0.7); }
        }
        /* The extravagant routine: bounce + sway + a full spin + wobble. */
        @keyframes catBoogie {
          0%   { transform: translateY(0) rotate(0deg); }
          8%   { transform: translateY(-26px) rotate(-12deg); }
          16%  { transform: translateY(0) rotate(0deg); }
          24%  { transform: translateY(-26px) rotate(12deg); }
          32%  { transform: translateY(0) rotate(0deg); }
          46%  { transform: translateY(-16px) rotate(360deg); }   /* spin! */
          54%  { transform: translateY(0) rotate(360deg); }
          62%  { transform: translateY(-22px) rotate(348deg); }
          70%  { transform: translateY(0) rotate(360deg); }
          78%  { transform: translateY(-14px) scale(1.08) rotate(372deg); }
          86%  { transform: translateY(0) rotate(360deg); }
          100% { transform: translateY(-8px) rotate(360deg); }
        }
        @keyframes catWaddle {
          0%,100% { transform: scaleX(1); }
          50%     { transform: scaleX(-1); }   /* face the other way */
        }
        @keyframes noteFloat {
          0%   { opacity: 0; transform: translateY(0) translateX(0) rotate(0deg); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-60px) translateX(20px) rotate(25deg); }
        }
        @keyframes floorPulse {
          0%,100% { opacity: 0.25; transform: translateX(-50%) scale(1); }
          50%     { opacity: 0.5; transform: translateX(-50%) scale(1.25); }
        }
      `}</style>

      {/* 1. Dim the rest of the UI */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,16,0.78)", animation: "discoDim 3s ease-in-out forwards" }} />

      {/* 2. Disco beams radiating from top center */}
      <div style={{ position: "absolute", top: 0, left: "50%", width: 0, height: 0 }}>
        {discoColors.map((c, i) => (
          <div key={i} style={{
            position: "absolute", top: 0, left: 0, width: 90, height: "150vh",
            transformOrigin: "top center", background: `linear-gradient(to bottom, ${c}cc, transparent 70%)`,
            filter: "blur(6px)", "--a": `${-65 + i * 26}deg`,
            animation: `beamSwing 1.5s ease-in-out infinite`, animationDelay: `${i * 0.12}s`,
          }} />
        ))}
      </div>

      {/* 3. Spinning disco ball */}
      <div style={{ position: "absolute", top: 18, left: "50%", animation: "ballDrop 3s ease-in-out forwards" }}>
        <div style={{ width: 4, height: 26, background: "var(--text-4)", margin: "0 auto" }} />
        <div style={{
          width: 46, height: 46, borderRadius: "50%", animation: "ballSpin 0.8s linear infinite",
          background: "radial-gradient(circle at 35% 30%, #fff, var(--text-2) 40%, var(--text-4) 75%)",
          backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 6px, transparent 6px 12px), radial-gradient(circle at 35% 30%, #fff, var(--text-2) 45%, var(--text-4) 78%)",
          boxShadow: "0 0 24px 6px rgba(148,163,184,0.6)",
        }} />
      </div>

      {/* 4. The cat, center stage */}
      <div style={{ position: "absolute", left: "50%", bottom: "18vh", transform: "translateX(-50%)", animation: "catShow 3s ease-in-out forwards" }}>
        {/* pulsing light pool on the floor */}
        <div style={{ position: "absolute", bottom: -18, left: "50%", width: w * 1.3, height: 18, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(45,212,191,0.6), transparent 70%)", animation: "floorPulse 0.5s ease-in-out infinite" }} />

        <div style={{ position: "relative", animation: "catWaddle 1.5s steps(1) infinite" }}>
          {/* floating notes */}
          <span style={{ position: "absolute", left: -30, top: 10, fontSize: 22, color: "#2DD4BF", animation: "noteFloat 1s ease-out infinite" }}>♪</span>
          <span style={{ position: "absolute", right: -26, top: -4, fontSize: 26, color: "#FBBF24", animation: "noteFloat 1s ease-out infinite", animationDelay: "0.3s" }}>♫</span>
          <span style={{ position: "absolute", left: -10, top: -20, fontSize: 18, color: "#FB7185", animation: "noteFloat 1s ease-out infinite", animationDelay: "0.6s" }}>♩</span>

          <div style={{ animation: "catBoogie 1.5s ease-in-out infinite", transformOrigin: "bottom center" }}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}>
              {sprite.map((row, y) =>
                row.map((c, x) => c ? (
                  <rect key={`${x}-${y}`} x={x * PX} y={y * PX} width={PX} height={PX} fill={c} />
                ) : null)
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Settings({ theme, onTheme }) {
  return (
    <Card title="Appearance">
      <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>
        Choose a theme. System follows your device's light or dark setting.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {THEME_OPTIONS.map((opt) => {
          const active = theme === opt.id;
          return (
            <button key={opt.id} onClick={() => onTheme(opt.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                background: active ? "var(--surface-2)" : "transparent",
                border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
              }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: opt.swatch, border: "1px solid var(--border)", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{opt.label}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-3)" }}>{opt.hint}</span>
              </span>
              {active && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Card({ title, children }) {
  return (
    <section style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
      padding: 18, position: "relative", overflow: "hidden",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    }}>
      {/* Rainbow top stripe — only paints in themes that define --rainbow (pride). */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--rainbow, transparent)" }} />
      <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--text-2)" }}>{title}</h2>
      {children}
    </section>
  );
}
