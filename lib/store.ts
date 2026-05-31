"use client";

import { create } from "zustand";
import { Swimmer, Session, MLResults } from "@/types";

/**
 * Zustand store for global application state.
 * Chosen over Redux for simplicity and minimal boilerplate
 * in a single-user dashboard context.
 */
interface AppState {
  // Selection state
  selectedSwimmer: Swimmer | null;
  selectedSession: Session | null;
  selectedMLResults: MLResults | null;

  // UI state
  sidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSelectedSwimmer: (swimmer: Swimmer | null) => void;
  setSelectedSession: (session: Session | null) => void;
  setSelectedMLResults: (results: MLResults | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSwimmer: null,
  selectedSession: null,
  selectedMLResults: null,
  sidebarOpen: false,
  isLoading: false,
  error: null,

  setSelectedSwimmer: (swimmer) => set({ selectedSwimmer: swimmer }),
  setSelectedSession: (session) => set({ selectedSession: session }),
  setSelectedMLResults: (results) => set({ selectedMLResults: results }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
