import { create } from "zustand";

interface DrawerState {
  open: boolean;
  openDrawer:  () => void;
  close: () => void;
  toggle: () => void;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  open:       false,
  openDrawer: () => set({ open: true }),
  close:      () => set({ open: false }),
  toggle:     () => set((s) => ({ open: !s.open })),
}));
