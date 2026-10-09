import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock("./supabaseClient", () => ({
  supabase: null,
  supabaseConfigError: ""
}));

test('renders budget app', () => {
  const { container } = render(<App />);
  const element = screen.getByText(/Sett totalbudsjett:/i);
  expect(element).toBeInTheDocument();
  expect(screen.getByText(/Versjon 0\.1\.0/i)).toBeInTheDocument();
  expect(screen.getByText(/Local-only mode/i)).toBeInTheDocument();
  expect(
    Array.from(container.querySelectorAll(".adjust input")).map((input) => input.value)
  ).toEqual(["0", "0", "0", "0"]);
});

test("migrates the old manual adjustment default to zero", () => {
  localStorage.setItem(
    "budget_adjust_values",
    JSON.stringify([100, 100, 100, 100])
  );
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([{ id: 1, budget: 100.999, current: 12.345 }])
  );

  const { container } = render(<App />);

  expect(
    Array.from(container.querySelectorAll(".adjust input")).map((input) => input.value)
  ).toEqual(["0"]);
  expect(screen.getByText("12.35 kr")).toBeInTheDocument();
});

test("limits entered budget, purchase, and adjustment amounts to two decimals", () => {
  const { container } = render(<App />);
  const [adjustmentInput] = container.querySelectorAll(".adjust input");
  const budgetInput = screen.getByPlaceholderText("Totalbeløp...");
  const priceInput = container.querySelector(".itemPriceInput");

  fireEvent.change(budgetInput, { target: { value: "123.456" } });
  fireEvent.change(priceInput, { target: { value: "4.567" } });
  fireEvent.change(adjustmentInput, { target: { value: "8.999" } });

  expect(budgetInput.value).toBe("123.46");
  expect(priceInput.value).toBe("4.57");
  expect(adjustmentInput.value).toBe("9");
});
