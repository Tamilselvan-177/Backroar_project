import { createContext, useCallback, useContext, useMemo, useState } from "react";

const DeleteConfirmContext = createContext(null);

/**
 * @typedef {{ title: string; description?: string; confirmLabel?: string }} DeleteConfirmOptions
 */

/**
 * Promise-based delete confirmation (modal card, not `window.confirm`).
 * Use from any route wrapped by `<DeleteConfirmProvider>` (see `Layout.jsx`).
 */
export function DeleteConfirmProvider({ children }) {
  const [open, setOpen] = useState(
    /** @type {null | (DeleteConfirmOptions & { resolve: (v: boolean) => void })} */ (null)
  );

  const requestConfirm = useCallback((/** @type {DeleteConfirmOptions} */ opts) => {
    return new Promise((resolve) => {
      setOpen({
        title: opts.title,
        description: opts.description ?? "",
        confirmLabel: opts.confirmLabel ?? "Delete",
        resolve,
      });
    });
  }, []);

  const finish = useCallback((/** @type {boolean} */ value) => {
    setOpen((cur) => {
      if (cur?.resolve) cur.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ requestConfirm }), [requestConfirm]);

  return (
    <DeleteConfirmContext.Provider value={value}>
      {children}
      {open ? (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) finish(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="delete-confirm-title" className="text-lg font-bold tracking-tight text-slate-900">
              {open.title}
            </h2>
            {open.description ? (
              <p className="mt-3 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{open.description}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => finish(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                onClick={() => finish(true)}
              >
                {open.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DeleteConfirmContext.Provider>
  );
}

export function useDeleteConfirm() {
  const ctx = useContext(DeleteConfirmContext);
  if (!ctx) {
    throw new Error("useDeleteConfirm must be used inside DeleteConfirmProvider");
  }
  return ctx.requestConfirm;
}
