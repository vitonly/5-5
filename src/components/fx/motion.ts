"use client";

/**
 * Гироскоп для «живых» карточек на телефоне.
 * Один общий слушатель deviceorientation на всю страницу; карточки подписываются.
 * На iOS нужен явный запрос разрешения по нажатию (DeviceOrientationEvent.requestPermission).
 */

export type Tilt = { beta: number; gamma: number };
type Listener = (t: Tilt) => void;
type IOSOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const FLAG = "startplus:motion";
const listeners = new Set<Listener>();
const stateListeners = new Set<() => void>();
let attached = false;
let granted = false;

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  const t = { beta: e.beta, gamma: e.gamma };
  listeners.forEach((l) => l(t));
}

function attach() {
  if (attached || typeof window === "undefined") return;
  window.addEventListener("deviceorientation", onOrientation);
  attached = true;
}

function readFlag() {
  try {
    return window.localStorage.getItem(FLAG);
  } catch {
    return null;
  }
}

function writeFlag(v: string) {
  try {
    window.localStorage.setItem(FLAG, v);
  } catch {
    /* ignore */
  }
}

export function isTouchOnly() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    "DeviceOrientationEvent" in window
  );
}

/** Нужно ли просить разрешение (iOS) и ещё не выдано. */
export function needsPermission() {
  if (!isTouchOnly() || granted) return false;
  const DOE = window.DeviceOrientationEvent as IOSOrientation;
  return typeof DOE.requestPermission === "function" && readFlag() !== "denied";
}

export async function requestMotion(): Promise<boolean> {
  const DOE = window.DeviceOrientationEvent as IOSOrientation;
  try {
    if (typeof DOE.requestPermission === "function") {
      const res = await DOE.requestPermission();
      if (res !== "granted") {
        writeFlag("denied");
        stateListeners.forEach((l) => l());
        return false;
      }
    }
    granted = true;
    writeFlag("granted");
    attach();
    stateListeners.forEach((l) => l());
    return true;
  } catch {
    return false;
  }
}

let initDone = false;
function init() {
  if (initDone || typeof window === "undefined") return;
  initDone = true;
  if (!isTouchOnly()) return;
  const DOE = window.DeviceOrientationEvent as IOSOrientation;
  if (typeof DOE.requestPermission !== "function") {
    // Android и др.: разрешение не нужно
    granted = true;
    attach();
    return;
  }
  // iOS: если уже разрешали раньше — тихо переспросим на первое касание (без диалога)
  if (readFlag() === "granted") {
    const once = () => {
      void requestMotion();
      window.removeEventListener("touchend", once);
    };
    window.addEventListener("touchend", once, { passive: true });
  }
}

export function subscribeTilt(l: Listener) {
  init();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function subscribeMotionState(l: () => void) {
  init();
  stateListeners.add(l);
  return () => {
    stateListeners.delete(l);
  };
}
