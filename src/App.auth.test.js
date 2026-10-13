import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

jest.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      }),
      getSession: jest.fn()
    },
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn()
  },
  supabaseConfigError: ""
}));

const mockedSupabase = jest.requireMock("./supabaseClient").supabase;

beforeEach(() => {
  localStorage.clear();
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null
  });
  mockedSupabase.from.mockReset();
  mockedSupabase.channel.mockReset();
});

test("requires invited users to sign in", async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  expect(screen.getByText(/Accounts are invite-only/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /sign up/i })).not.toBeInTheDocument();
});

test("loads, saves, and subscribes only to the signed-in user's budget", async () => {
  const userId = "user-123";
  const session = { user: { id: userId, email: "person@example.com" } };
  const snapshot = {
    totalBudget: "",
    weeks: [{ id: 1, budget: 2000, current: 2000 }],
    items: [],
    purchasedItems: [],
    history: [],
    adjustValues: [0],
    adjustmentLog: [],
    removedAdjustments: []
  };
  const maybeSingle = jest.fn().mockResolvedValue({
    data: { data: snapshot },
    error: null
  });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const channel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis()
  };
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session },
    error: null
  });
  mockedSupabase.from.mockReturnValue({ select, upsert });
  mockedSupabase.channel.mockReturnValue(channel);

  render(<App />);

  await waitFor(() => {
    expect(mockedSupabase.from).toHaveBeenCalledWith("user_budgets");
    expect(eq).toHaveBeenCalledWith("user_id", userId);
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        table: "user_budgets",
        filter: `user_id=eq.${userId}`
      }),
      expect.any(Function)
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: userId })
    );
  });
});
