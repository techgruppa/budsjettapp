import React, { useState, useEffect, useRef } from "react";
import Bag from "./components/Bag";
import { supabase, supabaseConfigError } from "./supabaseClient";
import packageInfo from "../package.json";
import "./App.css";

const serializeSnapshot = (snapshot) => {
  if (Array.isArray(snapshot)) {
    return `[${snapshot.map(serializeSnapshot).join(",")}]`;
  }

  if (snapshot && typeof snapshot === "object") {
    return `{${Object.keys(snapshot)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeSnapshot(snapshot[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(snapshot);
};

const roundCurrency = (amount) =>
  Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

const normalizeMoneyInput = (value) => {
  if (value === "") return "";

  const amount = Number(value);
  return Number.isFinite(amount) ? String(roundCurrency(amount)) : "";
};

const applyManualAdjustment = (weeks, index, amount) => {
  const newWeeks = weeks.map((week) => ({ ...week }));
  let remaining = roundCurrency(amount);

  if (remaining < 0) {
    remaining = Math.abs(remaining);

    for (let i = index; i < newWeeks.length; i++) {
      if (remaining <= 0) break;

      const available = newWeeks[i].current;
      if (available >= remaining) {
        newWeeks[i].current = roundCurrency(available - remaining);
        remaining = 0;
      } else {
        newWeeks[i].current = 0;
        remaining = roundCurrency(remaining - available);
      }
    }
  } else {
    newWeeks[index].current = roundCurrency(newWeeks[index].current + remaining);
  }

  return newWeeks;
};

export default function App() {
  const [session, setSession] = useState(null);
  const userId = session?.user?.id;
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(
    () => /type=(invite|recovery)/i.test(window.location.hash)
  );
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(supabase ? "loading" : "local");
  const [cloudError, setCloudError] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeWarning, setRealtimeWarning] = useState("");
  const [cloudLoadRetry, setCloudLoadRetry] = useState(0);
  const [cloudSaveRetry, setCloudSaveRetry] = useState(0);
  const authenticatedUserIdRef = useRef(null);
  const localBudgetRef = useRef(null);
  const skipNextCloudSaveRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const saveRevisionRef = useRef(0);

  const [totalBudget, setTotalBudget] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_total");
      return saved ? normalizeMoneyInput(JSON.parse(saved)) : "";
    } catch (e) {
      return "";
    }
  });

  const [weeks, setWeeks] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_weeks");
      const loadedWeeks = saved ? JSON.parse(saved) : [
        { id: 1, budget: 2000, current: 2000 },
        { id: 2, budget: 2000, current: 2000 },
        { id: 3, budget: 2000, current: 2000 },
        { id: 4, budget: 2000, current: 2000 }
      ];
      return loadedWeeks.map((week) => ({
        ...week,
        budget: roundCurrency(week.budget),
        current: roundCurrency(week.current)
      }));
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

  const [adjustmentLog, setAdjustmentLog] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_adjustment_log");
      const entries = saved ? JSON.parse(saved) : [];
      return Array.isArray(entries) ? entries : [];
    } catch (e) {
      return [];
    }
  });
  const [editingAdjustmentId, setEditingAdjustmentId] = useState(null);
  const [adjustmentCommentDraft, setAdjustmentCommentDraft] = useState("");
  const [removedAdjustments, setRemovedAdjustments] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_removed_adjustments");
      const entries = saved ? JSON.parse(saved) : [];
      return Array.isArray(entries) ? entries : [];
    } catch (e) {
      return [];
    }
  });

  const [adjustValues, setAdjustValues] = useState(() => {
    try {
      const saved = localStorage.getItem("budget_adjust_values");
      if (saved) {
        return JSON.parse(saved).map((value) =>
          value === 100 ? 0 : roundCurrency(value)
        );
      }
    } catch (e) { }
    try {
      const savedWeeks = localStorage.getItem("budget_weeks");
      const loadedWeeks = savedWeeks ? JSON.parse(savedWeeks) : null;
      if (loadedWeeks) {
        return loadedWeeks.map(() => 0);
      }
    } catch (e) { }
    return [0, 0, 0, 0];
  });

  const budgetSnapshot = {
    totalBudget,
    weeks,
    items,
    purchasedItems,
    history,
    adjustValues,
    adjustmentLog,
    removedAdjustments
  };
  localBudgetRef.current = budgetSnapshot;

  const applyBudgetSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("The shared budget data is invalid.");
    }

    const loadedWeeks = (Array.isArray(snapshot.weeks)
      ? snapshot.weeks
      : [
          { id: 1, budget: 2000, current: 2000 },
          { id: 2, budget: 2000, current: 2000 },
          { id: 3, budget: 2000, current: 2000 },
          { id: 4, budget: 2000, current: 2000 }
        ]).map((week) => ({
          ...week,
          budget: roundCurrency(week.budget),
          current: roundCurrency(week.current)
        }));

    setTotalBudget(normalizeMoneyInput(snapshot.totalBudget ?? ""));
    setWeeks(loadedWeeks);
    setItems(
      Array.isArray(snapshot.items)
        ? snapshot.items.map((item) => ({
            ...item,
            price: normalizeMoneyInput(item.price ?? "") || "0"
          }))
        : []
    );
    setPurchasedItems(
      Array.isArray(snapshot.purchasedItems)
        ? snapshot.purchasedItems.map((item) => ({
            ...item,
            price: normalizeMoneyInput(item.price ?? "") || "0"
          }))
        : []
    );
    setHistory(Array.isArray(snapshot.history) ? snapshot.history : []);
    setAdjustmentLog(
      Array.isArray(snapshot.adjustmentLog) ? snapshot.adjustmentLog : []
    );
    setRemovedAdjustments(
      Array.isArray(snapshot.removedAdjustments) ? snapshot.removedAdjustments : []
    );
    setAdjustValues(
      Array.isArray(snapshot.adjustValues)
        ? snapshot.adjustValues.map((value) =>
            value === 100 ? 0 : roundCurrency(value)
          )
        : loadedWeeks.map(() => 0)
    );
  };

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        const nextUserId = nextSession?.user?.id || null;
        if (authenticatedUserIdRef.current !== nextUserId) {
          authenticatedUserIdRef.current = nextUserId;
          setCloudReady(false);
          setCloudStatus(nextSession ? "loading" : "signedOut");
          setCloudError("");
          setRealtimeConnected(false);
          setRealtimeWarning("");
        }
        setSession(nextSession);
        if (_event === "PASSWORD_RECOVERY") setPasswordSetupRequired(true);
        if (_event === "SIGNED_OUT") setPasswordSetupRequired(false);
      }
    );

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(`Could not restore your sign-in: ${error.message}`);
      } else {
        authenticatedUserIdRef.current = data.session?.user?.id || null;
        setSession(data.session);
        if (!data.session) setPasswordSetupRequired(false);
      }
      setAuthLoading(false);
    }).catch((error) => {
      if (!active) return;
      setAuthError(`Could not restore your sign-in: ${error.message}`);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      setCloudReady(false);
      return undefined;
    }

    let active = true;
    let channel;
    setCloudReady(false);
    setCloudStatus("loading");
    setCloudError("");

    const loadSharedBudget = async () => {
      try {
        let { data: row, error } = await supabase
          .from("shared_budget")
          .select("data")
          .eq("id", "kitchen")
          .maybeSingle();

        if (error) throw error;

        if (!row) {
          const { data: inserted, error: insertError } = await supabase
            .from("shared_budget")
            .insert({ id: "kitchen", data: localBudgetRef.current })
            .select("data")
            .single();

          if (insertError?.code === "23505") {
            const { data: existing, error: reloadError } = await supabase
              .from("shared_budget")
              .select("data")
              .eq("id", "kitchen")
              .single();
            if (reloadError) throw reloadError;
            row = existing;
          } else {
            if (insertError) throw insertError;
            row = inserted;
          }
        }

        if (!active) return;
        applyBudgetSnapshot(row.data);
        setCloudReady(true);
        setCloudStatus("saved");

        channel = supabase
          .channel("shared-kitchen-budget")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "shared_budget",
              filter: "id=eq.kitchen"
            },
            (payload) => {
              const remoteData = payload.new?.data;
              if (
                !active ||
                !remoteData ||
                serializeSnapshot(remoteData) === serializeSnapshot(localBudgetRef.current)
              ) {
                return;
              }

              try {
                skipNextCloudSaveRef.current = true;
                applyBudgetSnapshot(remoteData);
                setCloudStatus("saved");
                setCloudError("");
              } catch (error) {
                setCloudError(`Could not apply shared changes: ${error.message}`);
                setCloudStatus("error");
              }
            }
          )
          .subscribe((status, error) => {
            if (!active) return;
            setRealtimeConnected(status === "SUBSCRIBED");
            if (status === "SUBSCRIBED") {
              setRealtimeWarning("");
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setRealtimeWarning(
                `Live updates are unavailable: ${error?.message || status}. Reload to get the latest shared changes.`
              );
            }
          });
      } catch (error) {
        if (!active) return;
        setCloudError(`Could not load the shared budget: ${error.message}`);
        setCloudStatus("error");
      }
    };

    loadSharedBudget();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, cloudLoadRetry]);

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

  useEffect(() => {
    localStorage.setItem("budget_adjustment_log", JSON.stringify(adjustmentLog));
  }, [adjustmentLog]);

  useEffect(() => {
    localStorage.setItem(
      "budget_removed_adjustments",
      JSON.stringify(removedAdjustments)
    );
  }, [removedAdjustments]);

  useEffect(() => {
    if (!supabase || !userId || !cloudReady) return undefined;

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return undefined;
    }

    const revision = ++saveRevisionRef.current;
    const snapshot = {
      totalBudget,
      weeks,
      items,
      purchasedItems,
      history,
      adjustValues,
      adjustmentLog,
      removedAdjustments
    };
    setCloudStatus("syncing");
    setCloudError("");

    const timeout = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          const { error } = await supabase
            .from("shared_budget")
            .upsert({
              id: "kitchen",
              data: snapshot,
              updated_at: new Date().toISOString()
            });
          if (error) throw error;

          if (saveRevisionRef.current === revision) {
            setCloudStatus("saved");
          }
        })
        .catch((error) => {
          if (saveRevisionRef.current === revision) {
            setCloudStatus("error");
            setCloudError(`Could not save the shared budget: ${error.message}`);
          }
        });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [
    userId,
    cloudReady,
    totalBudget,
    weeks,
    items,
    purchasedItems,
    history,
    adjustValues,
    adjustmentLog,
    removedAdjustments,
    cloudSaveRetry
  ]);

  const signIn = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthBusy(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) setAuthError(`Could not sign in: ${error.message}`);
    } catch (error) {
      setAuthError(`Could not sign in: ${error.message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const requestPasswordReset = async () => {
    setAuthError("");
    setAuthMessage("");
    if (!authEmail.trim()) {
      setAuthError("Enter your email address first.");
      return;
    }

    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        authEmail.trim(),
        { redirectTo: window.location.origin + window.location.pathname }
      );
      if (error) {
        setAuthError(`Could not request a password reset: ${error.message}`);
      } else {
        setAuthMessage("If that account exists, a password reset email has been sent.");
      }
    } catch (error) {
      setAuthError(`Could not request a password reset: ${error.message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setCloudError(`Could not sign out: ${error.message}`);
    } catch (error) {
      setCloudError(`Could not sign out: ${error.message}`);
    }
  };

  const saveNewPassword = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setAuthError(`Could not save your password: ${error.message}`);
      } else {
        setPasswordSetupRequired(false);
        setNewPassword("");
        window.history.replaceState(null, "", window.location.pathname);
        setAuthMessage("Your password is set.");
      }
    } catch (error) {
      setAuthError(`Could not save your password: ${error.message}`);
    } finally {
      setAuthBusy(false);
    }
  };

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
    return roundCurrency(sum + (parseFloat(item.price) || 0));
  }, 0);

  // ✅ total handlede varer
  const purchasedTotal = (purchasedItems || []).reduce((sum, item) => {
    return roundCurrency(sum + (parseFloat(item.price) || 0));
  }, 0);

  const handleAddItem = (e) => {
    if (e) e.preventDefault();
    if (!newItem.name.trim()) return;



    const priceVal = parseFloat(normalizeMoneyInput(newItem.price)) || 0;
    setItems([...(items || []), { name: newItem.name.trim(), price: priceVal.toString() }]);
    setNewItem({ name: "", price: "" });
  };


  function addToCart(name, price) {
    if (!name.trim()) return;

    const newItemObj = {
      name: name,
      price: (parseFloat(normalizeMoneyInput(price)) || 0).toString()
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
        newWeeks[i].current = roundCurrency(newWeeks[i].current - remaining);
        remaining = 0;
      } else {
        newWeeks[i].current = 0;
        remaining = roundCurrency(remaining - available);
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
        return { ...w, current: roundCurrency(w.current + remaining) };
      }
      return { ...w };
    });

    setWeeks(newWeeks);
  };

  // ✅ +- med flyt
  const adjustWeek = (index, amount) => {
    const roundedAmount = roundCurrency(amount);
    if (!roundedAmount) return;

    const newWeeks = applyManualAdjustment(weeks, index, roundedAmount);
    const changes = newWeeks.flatMap((week, weekIndex) => {
      const delta = roundCurrency(week.current - weeks[weekIndex].current);
      return delta === 0 ? [] : [{ weekId: week.id, delta }];
    });

    setWeeks(newWeeks);
    setAdjustmentLog([
      ...adjustmentLog,
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        weekId: weeks[index].id,
        amount: roundedAmount,
        comment: "",
        changes
      }
    ]);
  };

  const editAdjustmentComment = (entry) => {
    setEditingAdjustmentId(entry.id);
    setAdjustmentCommentDraft(entry.comment || "");
  };

  const saveAdjustmentComment = (event, entryId) => {
    event.preventDefault();
    setAdjustmentLog((entries) =>
      entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, comment: adjustmentCommentDraft.trim() }
          : entry
      )
    );
    setEditingAdjustmentId(null);
    setAdjustmentCommentDraft("");
  };

  const cancelAdjustmentComment = () => {
    setEditingAdjustmentId(null);
    setAdjustmentCommentDraft("");
  };

  const removeAdjustment = (entryId) => {
    const entry = adjustmentLog.find((adjustment) => adjustment.id === entryId);
    if (!entry) return;

    const entryIndex = weeks.findIndex((week) => week.id === entry.weekId);
    if (entryIndex < 0) return;

    const changes = Array.isArray(entry.changes)
      ? entry.changes
      : applyManualAdjustment(weeks, entryIndex, entry.amount).flatMap(
          (week, weekIndex) => {
            const delta = roundCurrency(week.current - weeks[weekIndex].current);
            return delta === 0 ? [] : [{ weekId: week.id, delta }];
          }
        );

    setWeeks((currentWeeks) =>
      currentWeeks.map((week) => {
        const change = changes.find((item) => item.weekId === week.id);
        return change
          ? { ...week, current: roundCurrency(week.current - change.delta) }
          : week;
      })
    );
    setAdjustmentLog((entries) =>
      entries.filter((adjustment) => adjustment.id !== entryId)
    );
    setRemovedAdjustments((removed) => [...removed, { entry, changes }]);
  };

  const undoRemoveAdjustment = () => {
    const removed = removedAdjustments[removedAdjustments.length - 1];
    if (!removed) return;

    setWeeks((currentWeeks) =>
      currentWeeks.map((week) => {
        const change = removed.changes.find((item) => item.weekId === week.id);
        return change
          ? { ...week, current: roundCurrency(week.current + change.delta) }
          : week;
      })
    );
    setAdjustmentLog((entries) => [...entries, removed.entry]);
    setRemovedAdjustments((entries) => entries.slice(0, -1));
  };

  const updateAdjustValue = (index, value) => {
    const newValues = [...adjustValues];
    newValues[index] =
      value === "" ? "" : Number(normalizeMoneyInput(value)) || 0;
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
      setAdjustValues([0, 0, 0, 0]);
      setAdjustmentLog([]);
      setEditingAdjustmentId(null);
      setAdjustmentCommentDraft("");
      setRemovedAdjustments([]);
    }
  };

  if (supabase && authLoading) {
    return (
      <main className="authPage">
        <section className="authPanel" aria-live="polite">
          <h1>Kjøkkenbudsjett</h1>
          <p>Checking your sign-in...</p>
        </section>
      </main>
    );
  }

  if (supabase && !session) {
    return (
      <main className="authPage">
        <section className="authPanel">
          <h1>Kjøkkenbudsjett</h1>
          <p>Sign in to access the shared kitchen budget.</p>
          {supabaseConfigError && (
            <p className="authError" role="alert">{supabaseConfigError}</p>
          )}
          {authError && <p className="authError" role="alert">{authError}</p>}
          {authMessage && <p className="authMessage" role="status">{authMessage}</p>}
          <form onSubmit={signIn}>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="username"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              required
            />
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete="current-password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <button
            type="button"
            className="textAuthButton"
            onClick={requestPasswordReset}
            disabled={authBusy}
          >
            Forgot password?
          </button>
          <p className="authHint">
            Accounts are invite-only. Ask a budget administrator for access.
          </p>
        </section>
      </main>
    );
  }

  if (supabase && session && passwordSetupRequired) {
    return (
      <main className="authPage">
        <section className="authPanel">
          <h1>Set your password</h1>
          <p>Choose a password for your kitchen budget account.</p>
          {authError && <p className="authError" role="alert">{authError}</p>}
          <form onSubmit={saveNewPassword}>
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength="8"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Saving..." : "Set password"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (supabase && session && !cloudReady) {
    return (
      <main className="authPage">
        <section className="authPanel" aria-live="polite">
          <h1>Kjøkkenbudsjett</h1>
          {cloudError ? (
            <>
              <p className="authError" role="alert">{cloudError}</p>
              <button onClick={() => setCloudLoadRetry((retry) => retry + 1)}>
                Retry loading shared budget
              </button>
              <button className="secondaryAuthButton" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <p>Loading shared budget...</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="app">

      {/* ✅ HANDLELISTE */}
      <div className="panel">

        <div className="budgetInput">
          <label>Sett totalbudsjett: 💰</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalBudget}
              onChange={(e) =>
                setTotalBudget(normalizeMoneyInput(e.target.value))
              }
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
              min="0"
              step="0.01"
              value={newItem.price}
              onChange={(e) =>
                setNewItem({
                  ...newItem,
                  price: normalizeMoneyInput(e.target.value)
                })
              }
              placeholder="kr"
            />
            <button type="submit" style={{ display: 'none' }}>Legg til</button>
          </div>
        </form>
        <button
          className="addToCartBtn"
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
                <span className="itemPrice">{roundCurrency(item.price)} kr</span>
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
                <span className="itemPrice">{roundCurrency(item.price)} kr</span>
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
                <div className="grid-line" style={{ top: '20%' }}></div>
                <div className="grid-line" style={{ top: '40%' }}></div>
                <div className="grid-line" style={{ top: '60%' }}></div>
                <div className="grid-line" style={{ top: '80%' }}></div>
              </div>

              <h3>Uke {week.id} 🪙</h3>

              <Bag fillPercent={percent} color={color} />

              <div className="card-ticks">
                <div className="tick-mark" style={{ top: '10%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Mandag</span>
                </div>
                <div className="tick-mark" style={{ top: '30%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Tirsdag</span>
                </div>
                <div className="tick-mark" style={{ top: '50%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Onsdag</span>
                </div>
                <div className="tick-mark" style={{ top: '70%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Torsdag</span>
                </div>
                <div className="tick-mark" style={{ top: '90%' }}>
                  <div className="tick-line"></div>
                  <span className="tick-label">Fredag</span>
                </div>
              </div>

              <div className="amount">
                {roundCurrency(week.current)} kr
              </div>

              <div className="adjust">
                <button onClick={() => adjustWeek(i, -adjustValues[i])}>
                  -
                </button>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustValues[i]}
                  onChange={(e) =>
                    updateAdjustValue(i, e.target.value)
                  }
                  onBlur={(e) => {
                    if (e.target.value === "") updateAdjustValue(i, "0");
                  }}
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

      <section className="adjustmentLog" aria-labelledby="adjustment-log-title">
        <h2 id="adjustment-log-title">Inn og Ut</h2>
        <button
          className="undoAdjustmentBtn"
          onClick={undoRemoveAdjustment}
          disabled={removedAdjustments.length === 0}
        >
          Angre fjerning
        </button>
        {adjustmentLog.length === 0 ? (
          <p className="emptyListText">Ingen manuelle justeringer ennå.</p>
        ) : (
          <ol className="adjustmentLogEntries">
            {[...adjustmentLog]
              .sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp))
              .map((entry) => (
                <li key={entry.id} className="adjustmentLogEntry">
                  <div className="adjustmentLogEntryHeader">
                    <button
                      type="button"
                      className="adjustmentEntryDetails"
                      onClick={() => editAdjustmentComment(entry)}
                      aria-label={`Rediger kommentar for justering ${entry.amount} kr for uke ${entry.weekId}`}
                    >
                      <span className="adjustmentEntrySummary">
                        <strong>Uke {entry.weekId}</strong>
                        <span className={entry.amount >= 0 ? "adjustmentCredit" : "adjustmentDebit"}>
                          {entry.amount > 0 ? "+" : ""}
                          {roundCurrency(entry.amount)} kr
                        </span>
                      </span>
                      <time dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleString("nb-NO")}
                      </time>
                      {entry.comment ? (
                        <span className="adjustmentEntryComment">{entry.comment}</span>
                      ) : (
                        <span className="adjustmentCommentPrompt">Klikk for å legge til kommentar</span>
                      )}
                    </button>
                    <button
                      className="removeAdjustmentBtn"
                      onClick={() => removeAdjustment(entry.id)}
                      aria-label={`Fjern justering ${entry.amount} kr for uke ${entry.weekId}`}
                      title="Fjern justering og tilbakefør beløpet"
                    >
                      ×
                    </button>
                  </div>
                  {editingAdjustmentId === entry.id && (
                    <form
                      className="adjustmentCommentEditor"
                      onSubmit={(event) => saveAdjustmentComment(event, entry.id)}
                    >
                      <label htmlFor={`adjustment-comment-${entry.id}`}>Kommentar</label>
                      <textarea
                        id={`adjustment-comment-${entry.id}`}
                        value={adjustmentCommentDraft}
                        onChange={(event) => setAdjustmentCommentDraft(event.target.value)}
                        placeholder="F.eks. lunsjsalg"
                        maxLength="200"
                        autoFocus
                      />
                      <div>
                        <button type="submit">Lagre</button>
                        <button type="button" onClick={cancelAdjustmentComment}>
                          Avbryt
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
          </ol>
        )}
      </section>

      </main>
      <section className="cloudStatus" aria-live="polite">
        {supabase ? (
          <>
            <span>
              Shared budget · {session.user.email} ·{" "}
              {cloudStatus === "syncing"
                ? "Saving..."
                : cloudStatus === "error"
                  ? "Sync error"
                  : realtimeConnected
                    ? "Synced"
                    : "Saved · live updates reconnecting"}
            </span>
            {cloudError && <span className="cloudError" role="alert">{cloudError}</span>}
            {realtimeWarning && (
              <span className="cloudError" role="status">{realtimeWarning}</span>
            )}
            {cloudStatus === "error" && (
              <button onClick={() => setCloudSaveRetry((retry) => retry + 1)}>
                Retry sync
              </button>
            )}
            <button
              className="secondaryAuthButton"
              onClick={signOut}
              disabled={cloudStatus === "syncing"}
            >
              Sign out
            </button>
          </>
        ) : (
          <span>
            {supabaseConfigError
              ? supabaseConfigError
              : "Local-only mode: configure Supabase to share this budget across devices."}
          </span>
        )}
      </section>
      <footer className="appFooter">
        &copy; {new Date().getFullYear()} Techgruppa
        <span aria-hidden="true"> &middot; </span>
        Versjon {packageInfo.version}
      </footer>
    </>
  );
}
