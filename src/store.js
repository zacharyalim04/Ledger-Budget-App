// ---------------------------------------------------------------------------
// DATA STORE
// One interface, two backends. The UI never imports Supabase directly — it
// calls these functions. Flip from local to cloud by adding .env credentials.
//
//   load()                       -> { transactions, budgets, categories }
//   saveTransactions(list)       -> persists transactions
//   saveBudgets(list)            -> persists budgets
//   saveCategories(list)         -> persists categories
//
// In LOCAL mode everything is one JSON blob in localStorage, namespaced per
// user id (which is just "local" when signed out).
// In CLOUD mode each collection is a Supabase table row set, scoped to the
// authenticated user by Row Level Security.
// ---------------------------------------------------------------------------
import { supabase, CLOUD_ENABLED } from "./supabase.js";
import { seed } from "./seed.js";

const LS_KEY = "ledger:data";

// ---------- LOCAL backend ----------
const local = {
  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return structuredClone(seed);
      const parsed = JSON.parse(raw);
      return {
        transactions: parsed.transactions ?? seed.transactions,
        budgets: parsed.budgets ?? seed.budgets,
        categories: parsed.categories ?? seed.categories,
      };
    } catch {
      return structuredClone(seed);
    }
  },
  _save(partial) {
    const current = local.load();
    const next = { ...current, ...partial };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  },
  saveTransactions(transactions) { local._save({ transactions }); },
  saveBudgets(budgets) { local._save({ budgets }); },
  saveCategories(categories) { local._save({ categories }); },
};

// ---------- CLOUD backend (Supabase) ----------
// Tables: transactions, budgets, categories — each with a user_id column.
// RLS policies (see supabase-schema.sql) ensure users only see their own rows.
const cloud = {
  async load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { transactions: [], budgets: [], categories: [] };

    const [tx, bg, cat] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("budgets").select("*"),
      supabase.from("categories").select("*"),
    ]);

    // First-time user: seed their account with defaults.
    if ((cat.data ?? []).length === 0) {
      await cloud._seedNewUser(user.id);
      return cloud.load();
    }

    return {
      transactions: (tx.data ?? []).map(rowToTx),
      budgets: (bg.data ?? []).map(rowToBudget),
      categories: (cat.data ?? []).map(rowToCat),
    };
  },

  async _seedNewUser(userId) {
    const stamp = (rows) => rows.map((r) => ({ ...r, user_id: userId }));
    await supabase.from("categories").insert(stamp(seed.categories.map(catToRow)));
    await supabase.from("budgets").insert(stamp(seed.budgets.map(budgetToRow)));
    await supabase.from("transactions").insert(stamp(seed.transactions.map(txToRow)));
  },

  // Simple sync strategy: replace the user's rows with the current client state.
  // Fine for a personal budgeting app; swap to granular upserts later if needed.
  async saveTransactions(transactions) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transactions").delete().eq("user_id", user.id);
    if (transactions.length)
      await supabase.from("transactions").insert(transactions.map((t) => ({ ...txToRow(t), user_id: user.id })));
  },
  async saveBudgets(budgets) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("budgets").delete().eq("user_id", user.id);
    if (budgets.length)
      await supabase.from("budgets").insert(budgets.map((b) => ({ ...budgetToRow(b), user_id: user.id })));
  },
  async saveCategories(categories) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("categories").delete().eq("user_id", user.id);
    if (categories.length)
      await supabase.from("categories").insert(categories.map((c) => ({ ...catToRow(c), user_id: user.id })));
  },
};

// ---------- row <-> object mappers (cloud) ----------
const rowToTx = (r) => ({ id: r.id, type: r.type, category: r.category, amount: Number(r.amount), note: r.note, date: r.date, alloc: r.alloc ?? undefined });
const txToRow = (t) => ({ id: String(t.id), type: t.type, category: t.category, amount: t.amount, note: t.note ?? "", date: t.date, alloc: t.alloc ?? null });
const rowToBudget = (r) => ({ category: r.category, limit: Number(r.limit) });
const budgetToRow = (b) => ({ category: b.category, limit: b.limit });
const rowToCat = (r) => ({ id: r.id, name: r.name, kind: r.kind, bucket: r.bucket, color: r.color });
const catToRow = (c) => ({ id: String(c.id), name: c.name, kind: c.kind, bucket: c.bucket, color: c.color });

export const store = CLOUD_ENABLED ? cloud : local;
