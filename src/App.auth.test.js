import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

jest.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      }),
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: null })
    }
  },
  supabaseConfigError: ""
}));

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
