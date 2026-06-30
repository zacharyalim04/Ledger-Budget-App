// Default data for a fresh user (local or cloud).
export const seed = {
  transactions: [
    { id: "1", type: "income", category: "Salary", amount: 4200, note: "Monthly pay", date: "2026-06-01", alloc: { Needs: 50, Wants: 30, Savings: 20 } },
    { id: "2", type: "expense", category: "Rent", amount: 1450, note: "June rent", date: "2026-06-02" },
    { id: "3", type: "expense", category: "Groceries", amount: 312, note: "Costco run", date: "2026-06-05" },
    { id: "4", type: "expense", category: "Transport", amount: 88, note: "Gas", date: "2026-06-07" },
    { id: "5", type: "expense", category: "Dining", amount: 64, note: "Ramen w/ team", date: "2026-06-09" },
    { id: "6", type: "income", category: "Freelance", amount: 600, note: "CAD side gig", date: "2026-06-12", alloc: { Needs: 50, Wants: 30, Savings: 20 } },
    { id: "7", type: "expense", category: "Groceries", amount: 142, note: "Mid-month", date: "2026-06-15" },
    { id: "8", type: "expense", category: "Entertainment", amount: 55, note: "Streaming + game", date: "2026-06-18" },
  ],
  budgets: [
    { category: "Rent", limit: 1500 },
    { category: "Groceries", limit: 500 },
    { category: "Transport", limit: 150 },
    { category: "Dining", limit: 200 },
    { category: "Entertainment", limit: 100 },
  ],
  categories: [
    { id: "c1", name: "Salary", kind: "income", bucket: null, color: "#34D399" },
    { id: "c2", name: "Freelance", kind: "income", bucket: null, color: "#2DD4BF" },
    { id: "c3", name: "Rent", kind: "expense", bucket: "Needs", color: "#60A5FA" },
    { id: "c4", name: "Groceries", kind: "expense", bucket: "Needs", color: "#3B82F6" },
    { id: "c5", name: "Transport", kind: "expense", bucket: "Needs", color: "#0EA5E9" },
    { id: "c6", name: "Health", kind: "expense", bucket: "Needs", color: "#6366F1" },
    { id: "c7", name: "Dining", kind: "expense", bucket: "Wants", color: "#FB7185" },
    { id: "c8", name: "Entertainment", kind: "expense", bucket: "Wants", color: "#F472B6" },
    { id: "c9", name: "Other", kind: "expense", bucket: "Wants", color: "#FBBF24" },
    { id: "c10", name: "Savings", kind: "expense", bucket: "Savings", color: "#34D399" },
  ],
};
