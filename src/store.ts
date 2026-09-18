import { useSyncExternalStore } from "react";
import { seed } from "./seed";
import { evaluate } from "./rules";
import type { Anomaly, DeviceType, RecordEntry, Shift, State } from "./types";

const STORE_KEY = "marine_erduty_state_v1";

let state: State;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("持久化失败", e);
  }
}

function makeId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}_${Math.random().toString(36).slice(2, 7)}`;
}

function load() {
  let loaded: State | null = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) loaded = JSON.parse(raw) as State;
  } catch (e) {
    console.warn("读取本地数据失败", e);
  }
  if (loaded && Array.isArray(loaded.shifts) && loaded.currentShiftId) {
    state = loaded;
  } else {
    // seed 需要自增 id，先建立空 state 再填充
    state = { seq: 0, shifts: [], records: [], anomalies: [], currentShiftId: "" };
    state = seed(Date.now(), makeId);
    persist();
  }
}

load();

/* ---------------- 选择器 ---------------- */

export function getState(): State {
  return state;
}

export function currentShift(): Shift {
  return state.shifts.find((s) => s.id === state.currentShiftId) as Shift;
}

/** 班次序号（按开始时间） */
export function shiftIndex(sh: Shift): number {
  return [...state.shifts].sort((a, b) => a.start - b.start).indexOf(sh) + 1;
}

export function getShift(id: string): Shift | undefined {
  return state.shifts.find((s) => s.id === id);
}

/** 该班次名下的异常（含曾归属、已转出的结转异常） */
export function anomaliesOfShift(sh: Shift): Anomaly[] {
  return state.anomalies.filter((a) => a.shiftId === sh.id || a.carriedFrom === sh.id);
}

/* ---------------- 动作 ---------------- */

/** 新增一条参数记录，自动判定异常；返回本条触发的异常 */
export function addRecord(
  deviceType: DeviceType,
  device: string,
  t: number,
  values: Record<string, number | string>
): Anomaly[] {
  const sh = currentShift();
  const rec: RecordEntry = {
    id: makeId("rec"),
    shiftId: sh.id,
    t,
    deviceType,
    device,
    values,
  };
  state.records.push(rec);
  const hits = evaluate(rec);
  const created: Anomaly[] = hits.map((hit) => ({
    id: makeId("an"),
    shiftId: sh.id,
    t,
    deviceType,
    device,
    recordId: rec.id,
    level: hit.level,
    msg: hit.msg,
    detail: hit.detail,
    field: hit.field,
    handled: false,
    handledAt: null,
    note: "",
    carried: false,
    carriedFrom: null,
  }));
  state.anomalies.push(...created);
  persist();
  emit();
  return created;
}

/** 处理异常：仅能置为已处理；严重异常级别与记录永久保留 */
export function handleAnomaly(id: string, note: string) {
  const a = state.anomalies.find((x) => x.id === id);
  if (!a || a.handled) return;
  a.handled = true;
  a.handledAt = Date.now();
  a.note = note;
  persist();
  emit();
}

export class HandoverBlockedError extends Error {}

/** 交接确认：未处理严重异常时拦截；未处理普通异常结转下一班 */
export function confirmHandover(outgoing: string, incoming: string, remark: string) {
  const sh = currentShift();
  const severeUnhandled = state.anomalies.filter(
    (a) => a.shiftId === sh.id && a.level === "severe" && !a.handled
  );
  if (severeUnhandled.length > 0) {
    throw new HandoverBlockedError(`还有 ${severeUnhandled.length} 项严重异常未处理，交接被拦截`);
  }

  sh.end = Date.now();
  sh.outgoing = outgoing;
  sh.incoming = incoming;
  sh.remark = remark;

  const next: Shift = {
    id: makeId("sh"),
    start: Date.now(),
    end: null,
    leader: incoming,
    outgoing: "",
    incoming: "",
    remark: "",
  };
  state.shifts.push(next);

  // 普通异常可结转；严重异常始终留在原班且必须已处理
  state.anomalies.forEach((a) => {
    if (a.shiftId === sh.id && a.level === "normal" && !a.handled) {
      a.shiftId = next.id;
      a.carried = true;
      a.carriedFrom = sh.id;
    }
  });

  state.currentShiftId = next.id;
  persist();
  emit();
}

export function resetAll() {
  localStorage.removeItem(STORE_KEY);
  state = { seq: 0, shifts: [], records: [], anomalies: [], currentShiftId: "" };
  state = seed(Date.now(), makeId);
  persist();
  emit();
}

/* ---------------- React 订阅 ---------------- */

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 全局状态钩子：任何动作后所有视图同步刷新 */
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state)
  );
}

export { evaluate };
