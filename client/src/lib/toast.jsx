import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext({ success: () => {}, error: () => {} });

const DURATION_MS = { success: 2600, error: 5000 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (type, message) => {
      if (!message) return;
      const id = nextId.current++;
      setToasts((list) => [...list.filter((t) => t.message !== message), { id, type, message }].slice(-3));
      setTimeout(() => dismiss(id), DURATION_MS[type]);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ success: (m) => push("success", m), error: (m) => push("error", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === "error" ? "alert" : "status"}>
            <span className="toast-dot" aria-hidden="true" />
            <span>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
