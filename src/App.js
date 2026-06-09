import React, { useState, useEffect } from "react";
import Bag from "./components/Bag";
import "./App.css";

export default function App() {


  const [totalBudget, setTotalBudget] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_total");
      return saved ? JSON.parse(saved) : "";
    } catch (e) {
      return "";
    }
  });

  const [weeks, setWeeks] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_weeks");
      return saved ? JSON.parse(saved) : [
        { id: 1, budget: 2000, current: 2000 },
        { id: 2, budget: 2000, current: 2000 },
        { id: 3, budget: 2000, current: 2000 },
        { id: 4, budget: 2000, current: 2000 }
      ];
    } catch (e) {
      return [
        { id: 1, budget: 2000, current: 2000 },
        { id: 2, budget: 2000, current: 2000 },
        { id: 3, budget: 2000, current: 2000 },
        { id: 4, budget: 2000, current: 2000 }
      ];
    }
  });

  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_items");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [purchasedItems, setPurchasedItems] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_purchased_items");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [newItem, setNewItem] = useState({ name: "", price: "" });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_history");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [adjustValues, setAdjustValues] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_adjust_values");
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    try {
      const savedWeeks = localStorage.getItem("budget_weeks");
      const loadedWeeks = savedWeeks ? JSON.parse(savedWeeks) : null;
      if (loadedWeeks) {
        return loadedWeeks.map(() => 100);
      }
    } catch (e) { }
    return [100, 100, 100, 100];
  });

  useEffect(() => {
    localStorage.setItem("budget_total", JSON.stringify(totalBudget));
  }, [totalBudget]);

  useEffect(() => {
    localStorage.setItem("budget_weeks", JSON.stringify(weeks));
  }, [weeks]);

  useEffect(() => {
    localStorage.setItem("budget_items", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("budget_purchased_items", JSON.stringify(purchasedItems));
  }, [purchasedItems]);

  useEffect(() => {
    localStorage.setItem("budget_history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("budget_adjust_values", JSON.stringify(adjustValues));
  }, [adjustValues]);

  // ✅ fordel budsjett på sekker
  const distributeBudget = () => {
    const total = parseFloat(totalBudget);
    if (!total || total <= 0) return;

    const perWeek = Math.floor(total / weeks.length);

    const newWeeks = weeks.map((w) => ({
      ...w,
      budget: perWeek,
      current: perWeek
    }));

    setWeeks(newWeeks);
  };

  // ✅ total handleliste
  const total = (items || []).reduce((sum, item) => {
    return sum + (parseFloat(item.price) || 0);
  }, 0);

  // ✅ total handlede varer
  const purchasedTotal = (purchasedItems || []).reduce((sum, item) => {
    return sum + (parseFloat(item.price) || 0);
  }, 0);

  const handleAddItem = (e) => {
    if (e) e.preventDefault();
    if (!newItem.name.trim()) return;



    const priceVal = parseFloat(newItem.price) || 0;
    setItems([...(items || []), { name: newItem.name.trim(), price: priceVal.toString() }]);
    setNewItem({ name: "", price: "" });
  };


  function addToCart(name, price) {
    if (!name.trim()) return;

    const newItemObj = {
      name: name,
      price: (parseFloat(price) || 0).toString()
    };

    setItems([...(items || []), newItemObj]);

    setNewItem({ name: "", price: "" }); // tøm input
  }



  const removeItem = (index) => {
    const newItems = (items || []).filter((_, i) => i !== index);
    setItems(newItems);
  };

  // ✅ trekk fra sekker (flyter videre)
  const applyTransaction = () => {
    let remaining = total;
    const newWeeks = weeks.map(w => ({ ...w }));

    for (let i = 0; i < newWeeks.length; i++) {
      if (remaining <= 0) break;

      const available = newWeeks[i].current;

      if (available >= remaining) {
        newWeeks[i].current -= remaining;
        remaining = 0;
      } else {
        newWeeks[i].current = 0;
        remaining -= available;
      }
    }

    setHistory([
      ...history,
      {
        weeks: weeks.map(w => ({ ...w })),
        items: [...(items || [])],
        purchasedItems: [...(purchasedItems || [])]
      }
    ]);

    setWeeks(newWeeks);
    setPurchasedItems([...(purchasedItems || []), ...(items || [])]); // ✅ flytt til kjøpt
    setItems([]);
  };

  // ✅ undo
  const undo = () => {
    if (history.length === 0) return;

    const prev = history[history.length - 1];

    setWeeks(prev.weeks || []);
    setItems(prev.items || []);
    setPurchasedItems(prev.purchasedItems || []);

    setHistory(history.slice(0, -1));

  };

  // ✅ overfør rest til neste uke
  const transferToNextWeek = (index) => {
    if (index >= weeks.length - 1) return;

    const remaining = weeks[index].current;
    if (remaining <= 0) return;

    // Lagre til historikk for undo
    setHistory([
      ...history,
      {
        weeks: weeks.map(w => ({ ...w })),
        items: [...(items || [])],
        purchasedItems: [...(purchasedItems || [])]
      }
    ]);

    const newWeeks = weeks.map((w, i) => {
      if (i === index) {
        return { ...w, current: 0 };
      }
      if (i === index + 1) {
        return { ...w, current: w.current + remaining };
      }
      return { ...w };
    });

    setWeeks(newWeeks);
  };

  // ✅ +- med flyt
  const adjustWeek = (index, amount) => {
    const newWeeks = weeks.map(w => ({ ...w }));

    let remaining = amount;

    if (amount < 0) {
      remaining = Math.abs(amount);

      for (let i = index; i < newWeeks.length; i++) {
        if (remaining <= 0) break;

        const available = newWeeks[i].current;

        if (available >= remaining) {
          newWeeks[i].current -= remaining;
          remaining = 0;
        } else {
          newWeeks[i].current = 0;
          remaining -= available;
        }
      }
    } else {
      newWeeks[index].current += amount;
    }

    setWeeks(newWeeks);
  };

  const updateAdjustValue = (index, value) => {
    const newValues = [...adjustValues];
    newValues[index] = Number(value);
    setAdjustValues(newValues);
  };

  // ✅ Nullstill all data og start på nytt
  const resetAll = () => {
    if (window.confirm("Er du sikker på at du vil slette all data og starte på nytt?")) {
      setTotalBudget("");
      setWeeks([
        { id: 1, budget: 2000, current: 2000 },
        { id: 2, budget: 2000, current: 2000 },
        { id: 3, budget: 2000, current: 2000 },
        { id: 4, budget: 2000, current: 2000 }
      ]);
      setItems([]);
      setPurchasedItems([]);
      setHistory([]);
      setAdjustValues([100, 100, 100, 100]);
    }
  };

  return (
    <div className="app">

      {/* ✅ HANDLELISTE */}
      <div className="panel">

        <div className="budgetInput">
          <label>Sett totalbudsjett: 💰</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="number"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              placeholder="Totalbeløp..."
            />
            <button onClick={distributeBudget}>
              Fordel budsjett
            </button>
          </div>
        </div>

        <h2>Nytt innkjøp 📝</h2>

        {/* Inputfelt for å legge til nye varer */}
        <form onSubmit={handleAddItem} className="addItemForm">
          <div className="row">
            <input
              className="itemNameInput"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Hva skal kjøpes inn?..."
              required
            />
            <input
              className="itemPriceInput"
              type="number"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
              placeholder="kr"
            />
            <button type="submit" style={{ display: 'none' }}>Legg til</button>
          </div>
        </form>
        <button
          onClick={() => addToCart(newItem.name, newItem.price)}
        >
          Legg i handleliste 🛒
        </button>





        {/* Liste over varer lagt til i handlelisten */}
        <div className="addedItemsList">
          {items.length === 0 ? (
            <div className="emptyListText">Handlelisten er tom. Skriv inn en vare ovenfor.</div>
          ) : (
            items.map((item, i) => (
              <div key={i} className="addedItemRow">
                <span className="itemName">{item.name}</span>
                <span className="itemPrice">{item.price} kr</span>
                <button
                  className="removeItemBtn"
                  onClick={() => removeItem(i)}
                  title="Fjern vare"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="totalDisplay">Totalt: {total} kr</div>

        <button className="primaryBtn" onClick={applyTransaction}>
          Registrer kjøp 💳
        </button>

        {/* ✅ KJØPTE VARER */}
        <h3>Handlede varer ✅</h3>
        <div className="addedItemsList">
          {purchasedItems.length === 0 ? (
            <div className="emptyListText">
              Ingen varer er registrert som handlet ennå.
            </div>
          ) : (
            purchasedItems.map((item, i) => (
              <div key={i} className="addedItemRow">
                <span className="itemName">{item.name}</span>
                <span className="itemPrice">{item.price} kr</span>
              </div>
            ))
          )}
        </div>

        <div className="totalDisplay">Totalt handlet: {purchasedTotal} kr</div>

        <div className="navButtons">
          <button onClick={undo}>← Angre</button>
        </div>
        <button className="resetBtn" onClick={resetAll}>
          Start på nytt 🔄
        </button>
      </div>

      {/* ✅ SEKKER */}
      <div className="bags">
        {weeks.map((week, i) => {
          const percent = Math.max(0, (week.current / week.budget) * 100);
          const fillPercent = Math.min(100, percent);

          const color =
            week.current <= 0
              ? "red"
              : percent < 40
                ? "gold"
                : "green";

          const statusClass =
            color === "red"
              ? "status-red"
              : color === "gold"
                ? "status-yellow"
                : "status-green";

          const statusColor =
            color === "red"
              ? "hsl(0, 90%, 82%)"
              : color === "gold"
                ? "hsl(45, 100%, 78%)"
                : "hsl(140, 75%, 80%)";

          const cardStyle = {
            backgroundImage: `radial-gradient(rgba(30, 41, 59, 0.08) 15%, transparent 16%), linear-gradient(to top, ${statusColor} ${fillPercent}%, #ffffff ${fillPercent}%)`
          };

          return (
            <div key={i} className={`bagCard ${statusClass}`} style={cardStyle}>
              {/* Diskret rutenett/linjer for ukedager */}
              <div className="card-grid-lines">
                <div className="grid-line" style={{ top: '16.7%' }}></div>
                <div className="grid-line" style={{ top: '33.3%' }}></div>
                <div className="grid-line" style={{ top: '50%' }}></div>
                <div className="grid-line" style={{ top: '66.7%' }}></div>
                <div className="grid-line" style={{ top: '83.3%' }}></div>
              </div>

              <h3>Uke {week.id} 🪙</h3>

              <Bag fillPercent={percent} color={color} />

              <div className="card-ticks">
                <div className="tick-mark" style={{ top: '16.7%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Mandag</span>
                </div>
                <div className="tick-mark" style={{ top: '33.3%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Tirsdag</span>
                </div>
                <div className="tick-mark" style={{ top: '50%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Onsdag</span>
                </div>
                <div className="tick-mark" style={{ top: '66.7%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Torsdag</span>
                </div>
                <div className="tick-mark" style={{ top: '83.3%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Fredag</span>
                </div>
              </div>

              <div className="amount">
                {week.current} kr
              </div>

              <div className="adjust">
                <button onClick={() => adjustWeek(i, -adjustValues[i])}>
                  -
                </button>

                <input
                  type="number"
                  min="1"
                  value={adjustValues[i]}
                  onChange={(e) =>
                    updateAdjustValue(i, e.target.value)
                  }
                />

                <button onClick={() => adjustWeek(i, adjustValues[i])}>
                  +
                </button>
              </div>

              {i < weeks.length - 1 && week.current > 0 && (
                <button
                  className="transferBtn"
                  onClick={() => transferToNextWeek(i)}
                >
                  Overfør rest ({week.current} kr) →
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}