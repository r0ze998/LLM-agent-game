// F17: Event Notification Store
import { create } from 'zustand';

export interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  color: string;
  timestamp: number;
  dismissed: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'dismissed'>) => void;
  dismiss: (id: string) => void;
  clearOld: () => void;
}

let nextId = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (n) =>
    set((s) => {
      const notification: Notification = {
        ...n,
        id: `notif-${++nextId}`,
        timestamp: Date.now(),
        dismissed: false,
      };
      // Keep max 5 active
      const active = [...s.notifications.filter((x) => !x.dismissed), notification].slice(-5);
      return { notifications: active };
    }),

  dismiss: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, dismissed: true } : n,
      ),
    })),

  clearOld: () =>
    set((s) => ({
      notifications: s.notifications.filter(
        (n) => !n.dismissed && Date.now() - n.timestamp < 10000,
      ),
    })),
}));
