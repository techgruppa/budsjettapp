import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock("./supabaseClient", () => ({
  supabase: null,
  supabaseConfigError: ""
}));

beforeEach(() => {
  localStorage.clear();
});

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

test("positions weekdays in the five rows below each week heading", () => {
  const { container } = render(<App />);
  const weekCards = container.querySelectorAll(".bagCard");

  expect(weekCards).toHaveLength(4);
  weekCards.forEach((card) => {
    expect(
      Array.from(card.querySelectorAll(".tick-mark")).map((marker) => marker.style.top)
    ).toEqual(["10%", "30%", "50%", "70%", "90%"]);
    expect(
      Array.from(card.querySelectorAll(".grid-line")).map((line) => line.style.top)
    ).toEqual(["20%", "40%", "60%", "80%"]);
  });
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

test("allows replacing zero in an adjustment input and restores zero if left blank", () => {
  const { container } = render(<App />);
  const [adjustmentInput] = container.querySelectorAll(".adjust input");

  fireEvent.change(adjustmentInput, { target: { value: "" } });
  expect(adjustmentInput.value).toBe("");

  fireEvent.change(adjustmentInput, { target: { value: "1" } });
  expect(adjustmentInput.value).toBe("1");
  fireEvent.click(container.querySelector(".adjust button:last-child"));
  expect(screen.getByText("2001 kr")).toBeInTheDocument();

  fireEvent.change(adjustmentInput, { target: { value: "" } });
  fireEvent.blur(adjustmentInput);
  expect(adjustmentInput.value).toBe("0");
});

test("logs manual adjustments with the week, amount, timestamp, and comment", () => {
  const { container } = render(<App />);
  const adjustmentInput = container.querySelector(".adjust input");

  fireEvent.change(adjustmentInput, { target: { value: "12.34" } });
  fireEvent.change(screen.getByLabelText(/Kommentar til neste justering/i), {
    target: { value: "Lunsjsalg" }
  });
  fireEvent.click(container.querySelector(".adjust button:last-child"));

  expect(screen.getByText("Uke 1")).toBeInTheDocument();
  expect(screen.getByText("+12.34 kr")).toBeInTheDocument();
  expect(screen.getByText("Lunsjsalg")).toBeInTheDocument();
  expect(
    JSON.parse(localStorage.getItem("budget_adjustment_log"))
  ).toEqual([
    expect.objectContaining({
      weekId: 1,
      amount: 12.34,
      comment: "Lunsjsalg",
      timestamp: expect.any(String)
    })
  ]);
  expect(screen.getByLabelText(/Kommentar til neste justering/i)).toHaveValue("");
});

test("logs a negative adjustment using the selected week and keeps the comment optional", () => {
  const { container } = render(<App />);
  const adjustmentInputs = container.querySelectorAll(".adjust input");

  fireEvent.change(adjustmentInputs[1], { target: { value: "5.5" } });
  fireEvent.click(container.querySelectorAll(".adjust button:first-child")[1]);

  expect(screen.getByText("-5.5 kr")).toBeInTheDocument();
  expect(screen.getByText("Uke 2")).toBeInTheDocument();
  expect(
    JSON.parse(localStorage.getItem("budget_adjustment_log"))[0]
  ).toEqual(
    expect.objectContaining({
      weekId: 2,
      amount: -5.5,
      comment: ""
    })
  );
});

test("removing a logged adjustment reverses its balance changes and undo restores it", () => {
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 2000, current: 5 },
      { id: 2, budget: 2000, current: 10 }
    ])
  );

  const { container } = render(<App />);
  const adjustmentInputs = container.querySelectorAll(".adjust input");
  const decreaseButtons = container.querySelectorAll(".adjust button:first-child");

  fireEvent.change(adjustmentInputs[0], { target: { value: "12" } });
  fireEvent.click(decreaseButtons[0]);

  expect(screen.getByText("-12 kr")).toBeInTheDocument();
  expect(screen.getByText("0 kr")).toBeInTheDocument();
  expect(screen.getByText("3 kr")).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Fjern justering -12 kr for uke 1"
    })
  );

  expect(screen.queryByText("-12 kr")).not.toBeInTheDocument();
  expect(screen.getByText("5 kr")).toBeInTheDocument();
  expect(screen.getByText("10 kr")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Angre fjerning" }));

  expect(screen.getByText("-12 kr")).toBeInTheDocument();
  expect(screen.getByText("0 kr")).toBeInTheDocument();
  expect(screen.getByText("3 kr")).toBeInTheDocument();
});
