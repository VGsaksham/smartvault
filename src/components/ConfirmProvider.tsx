'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type ConfirmApi = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback<ConfirmApi>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        destructive: options.destructive || false,
        resolve,
      });
    });
  }, []);

  const api = useMemo(() => confirm, [confirm]);

  const close = (value: boolean) => {
    if (!state) return;
    state.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          {/* top-pinned sheet */}
          <div className="pointer-events-auto mx-auto max-w-[720px] px-3 sm:px-4 pt-3">
            <div className="bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-[var(--border-default)] shadow-[var(--shadow-large)] rounded-[16px] overflow-hidden">
              <div className="px-4 sm:px-5 py-4 border-b border-[var(--border-subtle)]">
                <div className="text-[15px] font-bold text-[var(--text-primary)]">{state.title}</div>
                <div className="text-[13px] text-[var(--text-secondary)] mt-1">{state.message}</div>
              </div>
              <div className="px-4 sm:px-5 py-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => close(false)}
                  className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[13px] font-semibold text-[var(--text-secondary)]"
                >
                  {state.cancelText}
                </button>
                <button
                  onClick={() => close(true)}
                  className={`px-3 py-2 rounded-[10px] text-[13px] font-bold ${
                    state.destructive
                      ? 'bg-[#ff3b30] text-white'
                      : 'bg-[var(--text-primary)] text-[var(--bg-app)]'
                  }`}
                >
                  {state.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

