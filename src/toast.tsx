import { useSyncExternalStore } from "react";

let message = "";
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function toast(msg: string) {
  message = msg;
  listeners.forEach((l) => l());
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    message = "";
    listeners.forEach((l) => l());
  }, 2800);
}

export function Toaster() {
  const msg = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => message
  );
  return <div className={"toast" + (msg ? " show" : "")}>{msg}</div>;
}
