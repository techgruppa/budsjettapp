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
  expect(screen.getByText(/Versjon 1\.3\.6/i)).toBeInTheDocument();
  expect(screen.getByText(/Local-only mode/i)).toBeInTheDocument();
  expect(
    Array.from(container.querySelectorAll(".adjust input")).map((input) => input.value)
  ).toEqual(["0", "0", "0", "0"]);
});

test("renders cloud status and version beneath the week cards", () => {
  const { container } = render(<App />);
  const weekCards = container.querySelector(".bags");
  const lastWeekCard = weekCards.querySelector(".bagCard:last-of-type");
  const cloudStatus = weekCards.querySelector(".cloudStatus");
  const footer = weekCards.querySelector(".appFooter");

  expect(lastWeekCard.nextElementSibling).toBe(cloudStatus);
  expect(cloudStatus.nextElementSibling).toBe(footer);
  expect(container.querySelector("main").contains(weekCards)).toBe(true);
});

test("places budget actions inline at the top of the budget cards", () => {
  const { container } = render(<App />);
  const toolbar = container.querySelector(".budgetToolbar");
  const weekCards = container.querySelector(".bagCard");

  expect(toolbar.nextElementSibling).toBe(weekCards);
  expect(toolbar.querySelectorAll("button")).toHaveLength(4);
  expect(toolbar).toContainElement(screen.getByRole("button", { name: "← Angre" }));
  expect(toolbar).toContainElement(screen.getByRole("button", { name: "Gjenta" }));
  expect(toolbar).toContainElement(screen.getByRole("button", { name: "Arkiv og arkivering" }));
  expect(toolbar).toContainElement(screen.getByRole("button", { name: "Start på nytt 🔄" }));
  expect(screen.getByRole("button", { name: "← Angre" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Gjenta" })).toBeDisabled();
});

test("redo reapplies the last undone purchase", () => {
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([{ id: 1, budget: 100, current: 100 }])
  );
  localStorage.setItem(
    "budget_items",
    JSON.stringify([{ name: "Brød", price: "20" }])
  );

  const { container } = render(<App />);
  const undoButton = screen.getByRole("button", { name: "← Angre" });
  const redoButton = screen.getByRole("button", { name: "Gjenta" });

  fireEvent.click(screen.getByRole("button", { name: /Registrer kjøp/ }));
  expect(screen.getByText("80 kr")).toBeInTheDocument();
  expect(screen.getByText("Brød")).toBeInTheDocument();

  fireEvent.click(undoButton);
  expect(screen.getByText("100 kr")).toBeInTheDocument();
  expect(container.querySelector(".addedItemsList")).toHaveTextContent("Brød");
  expect(redoButton).toBeEnabled();

  fireEvent.click(redoButton);
  expect(screen.getByText("80 kr")).toBeInTheDocument();
  expect(screen.getByText("Brød")).toBeInTheDocument();
  expect(redoButton).toBeDisabled();
});

test("creates a named checkpoint without changing the active budget", () => {
  localStorage.setItem("budget_total", JSON.stringify("8000"));
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([{ id: 1, budget: 8000, current: 6200 }])
  );
  localStorage.setItem(
    "budget_items",
    JSON.stringify([{ name: "Melk", price: "25" }])
  );
  localStorage.setItem(
    "budget_purchased_items",
    JSON.stringify([{ name: "Brød", price: "40" }])
  );
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Arkiv og arkivering" }));
  fireEvent.change(screen.getByLabelText("Navn på arkivpunkt"), {
    target: { value: "Oktoberbudsjett" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Lagre" }));

  const [archive] = JSON.parse(localStorage.getItem("budget_archives"));
  expect(archive.name).toBe("Oktoberbudsjett");
  expect(archive.budget).toMatchObject({
    totalBudget: "8000",
    weeks: [{ id: 1, budget: 8000, current: 6200 }],
    items: [{ name: "Melk", price: "25" }],
    purchasedItems: [{ name: "Brød", price: "40" }]
  });
  expect(screen.getByPlaceholderText("Totalbeløp...").value).toBe("8000");
  expect(screen.getByText("Melk")).toBeInTheDocument();
  expect(screen.getByText("Brød")).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Oktoberbudsjett")).toBeInTheDocument();
  expect(screen.getByText(/1 registrerte kjøp/)).toBeInTheDocument();
});

test("restores an archived budget and archives the active budget first", () => {
  const archive = {
    id: "archive-1",
    archivedAt: "2026-01-01T12:00:00.000Z",
    budget: {
      totalBudget: "6000",
      weeks: [{ id: 1, budget: 6000, current: 4500 }],
      items: [],
      purchasedItems: [{ name: "Frukt", price: "30" }],
      history: [],
      adjustValues: [0],
      adjustmentLog: [],
      removedAdjustments: []
    }
  };
  localStorage.setItem("budget_total", JSON.stringify("3000"));
  localStorage.setItem("budget_archives", JSON.stringify([archive]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Arkiv og arkivering" }));
  fireEvent.click(screen.getByRole("button", { name: /Gjenopprett arkiv/ }));

  expect(screen.getByPlaceholderText("Totalbeløp...").value).toBe("6000");
  expect(screen.getByText(/Frukt/)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("budget_archives"))).toHaveLength(2);
  expect(
    JSON.parse(localStorage.getItem("budget_archives"))[0].budget.totalBudget
  ).toBe("3000");

  confirmSpy.mockRestore();
});

test("deletes only the selected archive after confirmation", () => {
  const firstArchive = {
    id: "archive-1",
    archivedAt: "2026-01-01T12:00:00.000Z",
    budget: { totalBudget: "6000", purchasedItems: [] }
  };
  const secondArchive = {
    id: "archive-2",
    archivedAt: "2026-02-01T12:00:00.000Z",
    budget: { totalBudget: "9000", purchasedItems: [] }
  };
  localStorage.setItem(
    "budget_archives",
    JSON.stringify([firstArchive, secondArchive])
  );
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Arkiv og arkivering" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Slett arkiv/ })[0]);

  expect(confirmSpy).toHaveBeenCalledWith(
    "Slette dette arkivpunktet permanent?"
  );
  expect(JSON.parse(localStorage.getItem("budget_archives"))).toEqual([
    secondArchive
  ]);
  expect(screen.queryByText(/Totalbudsjett: 6000 kr/)).not.toBeInTheDocument();
  expect(screen.getByText(/Totalbudsjett: 9000 kr/)).toBeInTheDocument();

  confirmSpy.mockRestore();
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

test("adds a comment by editing a logged adjustment", () => {
  const { container } = render(<App />);
  const adjustmentInput = container.querySelector(".adjust input");

  fireEvent.change(adjustmentInput, { target: { value: "12.34" } });
  fireEvent.click(container.querySelector(".adjust button:last-child"));

  expect(screen.getByText("Uke 1")).toBeInTheDocument();
  expect(screen.getByText("+12.34 kr")).toBeInTheDocument();
  expect(screen.getByText("Klikk for å legge til kommentar")).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Rediger kommentar for justering 12.34 kr for uke 1"
    })
  );
  fireEvent.change(screen.getByLabelText("Kommentar"), {
    target: { value: "Lunsjsalg" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Lagre" }));

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
  expect(
    screen.queryByText("Klikk for å legge til kommentar")
  ).not.toBeInTheDocument();
});

test("cancels editing a logged adjustment comment without changing it", () => {
  localStorage.setItem(
    "budget_adjustment_log",
    JSON.stringify([
      {
        id: "adjustment-1",
        timestamp: "2026-10-09T12:00:00.000Z",
        weekId: 1,
        amount: 10,
        comment: "Existing comment"
      }
    ])
  );

  render(<App />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Rediger kommentar for justering 10 kr for uke 1"
    })
  );
  fireEvent.change(screen.getByLabelText("Kommentar"), {
    target: { value: "Changed comment" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));

  expect(screen.getByText("Existing comment")).toBeInTheDocument();
  expect(screen.queryByText("Changed comment")).not.toBeInTheDocument();
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

test("colors incoming and outgoing adjustment entries green and red", () => {
  const { container } = render(<App />);
  const adjustmentInputs = container.querySelectorAll(".adjust input");

  fireEvent.change(adjustmentInputs[0], { target: { value: "8" } });
  fireEvent.click(container.querySelector(".adjust button:last-child"));
  fireEvent.change(adjustmentInputs[1], { target: { value: "5" } });
  fireEvent.click(container.querySelectorAll(".adjust button:first-child")[1]);

  const entries = container.querySelectorAll(".adjustmentLogEntry");
  expect(entries).toHaveLength(2);
  expect(container.querySelector(".adjustmentCreditEntry")).toBeInTheDocument();
  expect(container.querySelector(".adjustmentDebitEntry")).toBeInTheDocument();
});

test("the shared undo and redo buttons restore a removed adjustment", () => {
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
  expect(screen.queryByRole("button", { name: "Angre fjerning" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "← Angre" }));

  expect(screen.getByText("-12 kr")).toBeInTheDocument();
  expect(screen.getByText("0 kr")).toBeInTheDocument();
  expect(screen.getByText("3 kr")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Gjenta" }));

  expect(screen.queryByText("-12 kr")).not.toBeInTheDocument();
  expect(screen.getByText("5 kr")).toBeInTheDocument();
  expect(screen.getByText("10 kr")).toBeInTheDocument();
});
