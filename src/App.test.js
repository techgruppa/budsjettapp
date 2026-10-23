import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock("./supabaseClient", () => ({
  supabase: null,
  supabaseConfigError: ""
}));

beforeEach(() => {
  localStorage.clear();
});

const mockAudioPlayback = () => {
  const play = jest.fn().mockResolvedValue(undefined);
  const instances = [];
  const AudioConstructor = jest
    .spyOn(window, "Audio")
    .mockImplementation((src) => {
      const audio = { src, volume: 1, play };
      instances.push(audio);
      return audio;
    });

  return { AudioConstructor, instances, play };
};

test('renders budget app', () => {
  const { container } = render(<App />);
  const element = screen.getByText(/Sett totalbudsjett:/i);
  expect(element).toBeInTheDocument();
  expect(screen.getByText(/Versjon 1\.3\.6/i)).toBeInTheDocument();
  expect(screen.getByText(/Kun lokal lagring/i)).toBeInTheDocument();
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
  const leftGroup = toolbar.querySelector(".budgetToolbarLeft");
  const rightGroup = toolbar.querySelector(".budgetToolbarRight");
  const weekCards = container.querySelector(".bagCard");

  expect(toolbar.nextElementSibling).toBe(weekCards);
  expect(leftGroup.querySelectorAll("button")).toHaveLength(3);
  expect(rightGroup.querySelectorAll("button")).toHaveLength(1);
  expect(leftGroup).toContainElement(screen.getByRole("button", { name: "← Angre" }));
  expect(leftGroup).toContainElement(screen.getByRole("button", { name: "Gjenta →" }));
  expect(leftGroup).toContainElement(screen.getByRole("button", { name: "Arkiv og arkivering" }));
  expect(rightGroup).toContainElement(screen.getByRole("button", { name: "Start på nytt 🔄" }));
  expect(screen.getByRole("button", { name: "← Angre" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Gjenta →" })).toBeDisabled();
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
  const redoButton = screen.getByRole("button", { name: "Gjenta →" });

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

test("plays the buzzer when a purchase exceeds the current week's balance", () => {
  const { AudioConstructor, instances, play } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([{ id: 1, budget: 100, current: 40 }])
  );
  localStorage.setItem(
    "budget_items",
    JSON.stringify([{ name: "Storhandel", price: "50" }])
  );

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Registrer kjøp/ }));

  expect(AudioConstructor).toHaveBeenCalledWith(
    expect.stringContaining("/sounds/buzzer.mp3")
  );
  expect(instances[0].volume).toBe(1);
  expect(play).toHaveBeenCalledTimes(1);
  AudioConstructor.mockRestore();
});

test("plays the buzzer when a purchase spills into a later week's budget", () => {
  const { AudioConstructor, play } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 100, current: 40 },
      { id: 2, budget: 100, current: 100 }
    ])
  );
  localStorage.setItem(
    "budget_items",
    JSON.stringify([{ name: "Ukentlig handel", price: "50" }])
  );

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Registrer kjøp/ }));

  expect(AudioConstructor).toHaveBeenCalledWith(
    expect.stringContaining("/sounds/buzzer.mp3")
  );
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.getByText("90 kr")).toBeInTheDocument();
  AudioConstructor.mockRestore();
});

test("does not play the buzzer when a purchase fits the remaining budget", () => {
  const { AudioConstructor } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([{ id: 1, budget: 100, current: 100 }])
  );
  localStorage.setItem(
    "budget_items",
    JSON.stringify([{ name: "Liten handel", price: "25" }])
  );

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Registrer kjøp/ }));

  expect(AudioConstructor).not.toHaveBeenCalled();
  AudioConstructor.mockRestore();
});

test("plays the buzzer when a card subtraction exceeds the remaining budget", () => {
  const { play, AudioConstructor } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 100, current: 20 },
      { id: 2, budget: 100, current: 10 }
    ])
  );

  const { container } = render(<App />);
  const adjustmentInput = container.querySelector(".adjust input");
  const subtractButton = container.querySelector(".adjust button:first-child");
  fireEvent.change(adjustmentInput, { target: { value: "40" } });
  fireEvent.click(subtractButton);

  expect(AudioConstructor).toHaveBeenCalledWith(
    expect.stringContaining("/sounds/buzzer.mp3")
  );
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("0 kr")).toHaveLength(2);
  AudioConstructor.mockRestore();
});

test("does not play the buzzer when a card subtraction fits the selected week's balance", () => {
  const { AudioConstructor } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 100, current: 50 },
      { id: 2, budget: 100, current: 30 }
    ])
  );

  const { container } = render(<App />);
  const adjustmentInput = container.querySelector(".adjust input");
  const subtractButton = container.querySelector(".adjust button:first-child");
  fireEvent.change(adjustmentInput, { target: { value: "40" } });
  fireEvent.click(subtractButton);

  expect(AudioConstructor).not.toHaveBeenCalled();
  expect(screen.getByText("10 kr")).toBeInTheDocument();
  expect(screen.getByText("30 kr")).toBeInTheDocument();
  AudioConstructor.mockRestore();
});

test("plays applause when transferring a positive remaining balance", () => {
  const { AudioConstructor, play } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 100, current: 25 },
      { id: 2, budget: 100, current: 40 }
    ])
  );

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Overfør rest/ }));

  expect(AudioConstructor).toHaveBeenCalledWith(
    expect.stringContaining("/sounds/applause.mp3")
  );
  expect(play).toHaveBeenCalledTimes(1);
  AudioConstructor.mockRestore();
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

test("moves the archive window by dragging its title bar", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Arkiv og arkivering" }));

  const dialog = screen.getByRole("dialog", { name: "Arkiv og arkivering" });
  const header = dialog.querySelector(".archiveModalHeader");
  const initialTransform = dialog.style.transform;

  fireEvent.mouseDown(screen.getByRole("heading", { name: "Arkiv og arkivering" }), {
    button: 0,
    clientX: 200,
    clientY: 150
  });
  fireEvent.mouseMove(document, { clientX: 260, clientY: 190 });

  expect(dialog.style.transform).not.toBe(initialTransform);
  expect(header).toHaveClass("isDragging");

  fireEvent.mouseUp(document);
  expect(header).not.toHaveClass("isDragging");
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

test("keeps the transfer-button space after transferring a week's balance", () => {
  const { AudioConstructor } = mockAudioPlayback();
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 100, current: 20 },
      { id: 2, budget: 100, current: 50 }
    ])
  );

  const { container } = render(<App />);
  const firstSlot = container.querySelector(".bagCard .transferSlot");

  expect(firstSlot.querySelector(".transferBtn")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Overfør rest/ }));

  expect(firstSlot).toBeInTheDocument();
  expect(firstSlot).toHaveClass("transferSlot");
  expect(firstSlot.querySelector(".transferBtn")).not.toBeInTheDocument();
  expect(firstSlot.querySelector("span")).toBeInTheDocument();
  AudioConstructor.mockRestore();
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

test("adds an Inn og Ut entry from its form and supports undo and redo", () => {
  localStorage.setItem(
    "budget_weeks",
    JSON.stringify([
      { id: 1, budget: 100, current: 50 },
      { id: 2, budget: 100, current: 40 }
    ])
  );

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Legg til post" }));
  fireEvent.change(screen.getByLabelText("Uke"), {
    target: { value: "2" }
  });
  fireEvent.change(screen.getByLabelText("Beløp (+ inn, − ut)"), {
    target: { value: "-15.25" }
  });
  fireEvent.change(screen.getByLabelText("Kommentar (valgfritt)"), {
    target: { value: "Kjøp av kaffe" }
  });
  const addPostButtons = screen.getAllByRole("button", { name: "Legg til post" });
  fireEvent.click(addPostButtons[addPostButtons.length - 1]);

  expect(screen.getByText("-15.25 kr")).toBeInTheDocument();
  expect(screen.getByText("Kjøp av kaffe")).toBeInTheDocument();
  expect(screen.getByText("24.75 kr")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "← Angre" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "← Angre" }));
  expect(screen.queryByText("-15.25 kr")).not.toBeInTheDocument();
  expect(screen.getByText("40 kr")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Gjenta →" }));
  expect(screen.getByText("-15.25 kr")).toBeInTheDocument();
  expect(screen.getByText("24.75 kr")).toBeInTheDocument();
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
  const { AudioConstructor } = mockAudioPlayback();
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

  fireEvent.click(screen.getByRole("button", { name: "Gjenta →" }));

  expect(screen.queryByText("-12 kr")).not.toBeInTheDocument();
  expect(screen.getByText("5 kr")).toBeInTheDocument();
  expect(screen.getByText("10 kr")).toBeInTheDocument();
  AudioConstructor.mockRestore();
});
