// 船舶轮机值班台 —— 数据模型、异常规则与状态操作
// 数据仅保存在浏览器 localStorage，刷新后保留。

export type DeviceId = "main" | "gen1" | "gen2" | "pump1" | "pump2" | "pump3";
export type DeviceGroup = "main" | "gen" | "pump";
export type AnomalyLevel = "severe" | "normal";
export type AnomalyStatus = "open" | "handled";

export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  step?: number;
}

export interface DeviceDef {
  id: DeviceId;
  name: string;
  group: DeviceGroup;
  params: ParamDef[];
}

export interface Reading {
  id: string;
  ts: number;
  device: DeviceId;
  shiftId: string;
  values: Record<string, number>;
  note: string;
}

export interface Anomaly {
  id: string;
  ts: number;
  device: DeviceId;
  level: AnomalyLevel;
  status: AnomalyStatus;
  rule: string;
  message: string;
  readingId: string;
  shiftId: string; // 当前所属班次（普通异常结转后会更新）
  carriedFrom?: string; // 最初产生班次（仅结转的普通异常有）
  handledAt?: number;
  handledBy?: string;
  handleNote?: string;
}

export interface Shift {
  id: string;
  label: string;
  startTs: number;
  endTs?: number;
  closed: boolean;
  handoverBy?: string; // 交班人
  takeoverBy?: string; // 接班人
  note?: string; // 交接备注
}

export interface AppState {
  seq: number;
  currentShiftId: string;
  shifts: Shift[];
  readings: Reading[];
  anomalies: Anomaly[];
}

const GEN_PARAMS: ParamDef[] = [
  { key: "voltage", label: "电压", unit: "V" },
  { key: "freq", label: "频率", unit: "Hz", step: 0.1 },
  { key: "current", label: "电流", unit: "A" },
  { key: "power", label: "功率", unit: "kW" },
];

const PUMP_PARAMS: ParamDef[] = [
  { key: "pressure", label: "出口压力", unit: "MPa", step: 0.01 },
  { key: "flow", label: "流量", unit: "m³/h" },
  { key: "current", label: "电流", unit: "A" },
];

export const DEVICES: DeviceDef[] = [
  {
    id: "main",
    name: "主机",
    group: "main",
    params: [
      { key: "rpm", label: "转速", unit: "r/min" },
      { key: "lubeOil", label: "滑油压力", unit: "MPa", step: 0.01 },
      { key: "coolTemp", label: "冷却水温", unit: "℃" },
      { key: "fuel", label: "燃油消耗", unit: "L/h" },
      { key: "exhaust", label: "排烟温度", unit: "℃" },
    ],
  },
  { id: "gen1", name: "1号发电机", group: "gen", params: GEN_PARAMS },
  { id: "gen2", name: "2号发电机", group: "gen", params: GEN_PARAMS },
  { id: "pump1", name: "1号泵组", group: "pump", params: PUMP_PARAMS },
  { id: "pump2", name: "2号泵组", group: "pump", params: PUMP_PARAMS },
  { id: "pump3", name: "3号泵组", group: "pump", params: PUMP_PARAMS },
];

export const deviceById = (id: DeviceId): DeviceDef =>
  DEVICES.find((d) => d.id === id) ?? DEVICES[0];

// ---------------- 异常判定规则 ----------------

export interface RuleHit {
  level: AnomalyLevel;
  rule: string;
  message: string;
}

export const SEVERE_RULES_TEXT = [
  "主机运转中滑油压力 < 0.10 MPa → 严重异常",
  "主机运转中冷却水温 > 95 ℃ → 严重异常",
  "主机停转（转速为 0）仍消耗燃油 → 严重异常",
];

export function evaluateReading(
  device: DeviceDef,
  v: Record<string, number>
): RuleHit[] {
  const hits: RuleHit[] = [];

  if (device.group === "main") {
    const running = v.rpm > 0;
    if (running && v.lubeOil < 0.1) {
      hits.push({
        level: "severe",
        rule: "主机滑油压力过低",
        message: `主机运转中（${v.rpm} r/min）滑油压力 ${v.lubeOil} MPa，低于 0.10 MPa`,
      });
    }
    if (running && v.coolTemp > 95) {
      hits.push({
        level: "severe",
        rule: "主机冷却水温过高",
        message: `主机运转中（${v.rpm} r/min）冷却水温 ${v.coolTemp} ℃，高于 95 ℃`,
      });
    }
    if (!running && v.fuel > 0) {
      hits.push({
        level: "severe",
        rule: "主机停转仍耗燃油",
        message: `主机停转（转速 0 r/min）仍消耗燃油 ${v.fuel} L/h`,
      });
    }
    if (running && v.exhaust > 450) {
      hits.push({
        level: "normal",
        rule: "主机排烟温度偏高",
        message: `排烟温度 ${v.exhaust} ℃，高于 450 ℃`,
      });
    }
  }

  if (device.group === "gen") {
    if (v.voltage < 361 || v.voltage > 399) {
      hits.push({
        level: "normal",
        rule: "发电机电压越限",
        message: `电压 ${v.voltage} V，超出 380 V ± 5% 范围`,
      });
    }
    if (v.freq < 49.5 || v.freq > 50.5) {
      hits.push({
        level: "normal",
        rule: "发电机频率越限",
        message: `频率 ${v.freq} Hz，超出 49.5 ~ 50.5 Hz 范围`,
      });
    }
  }

  if (device.group === "pump") {
    if (v.pressure < 0.2) {
      hits.push({
        level: "normal",
        rule: "泵组出口压力偏低",
        message: `出口压力 ${v.pressure} MPa，低于 0.20 MPa`,
      });
    }
    if (v.current > 45) {
      hits.push({
        level: "normal",
        rule: "泵组电流偏高",
        message: `电流 ${v.current} A，高于 45 A`,
      });
    }
  }

  return hits;
}

// ---------------- 状态操作 ----------------

export function createInitialState(now: number = Date.now()): AppState {
  const shift: Shift = { id: "S1", label: "第 1 班", startTs: now, closed: false };
  return { seq: 2, currentShiftId: shift.id, shifts: [shift], readings: [], anomalies: [] };
}

export function currentShift(s: AppState): Shift {
  return s.shifts.find((x) => x.id === s.currentShiftId) ?? s.shifts[s.shifts.length - 1];
}

export interface AddResult {
  state: AppState;
  reading: Reading;
  anomalies: Anomaly[];
}

export function addReading(
  s: AppState,
  device: DeviceId,
  values: Record<string, number>,
  note: string,
  ts: number = Date.now()
): AddResult {
  let seq = s.seq;
  const reading: Reading = {
    id: `R${seq++}`,
    ts,
    device,
    shiftId: s.currentShiftId,
    values,
    note: note.trim(),
  };
  const hits = evaluateReading(deviceById(device), values);
  const anomalies: Anomaly[] = hits.map((h) => ({
    id: `A${seq++}`,
    ts,
    device,
    level: h.level,
    status: "open",
    rule: h.rule,
    message: h.message,
    readingId: reading.id,
    shiftId: s.currentShiftId,
  }));
  return {
    state: {
      ...s,
      seq,
      readings: [...s.readings, reading],
      anomalies: [...s.anomalies, ...anomalies],
    },
    reading,
    anomalies,
  };
}

export function handleAnomaly(
  s: AppState,
  anomalyId: string,
  by: string,
  note: string
): AppState {
  const now = Date.now();
  return {
    ...s,
    anomalies: s.anomalies.map((a) =>
      a.id === anomalyId && a.status === "open"
        ? { ...a, status: "handled", handledAt: now, handledBy: by.trim(), handleNote: note.trim() }
        : a
    ),
  };
}

/** 当前班未处理的严重异常 —— 存在时交接被拦截 */
export function openSevereOfCurrentShift(s: AppState): Anomaly[] {
  return s.anomalies.filter(
    (a) => a.level === "severe" && a.status === "open" && a.shiftId === s.currentShiftId
  );
}

export interface HandoverResult {
  ok: boolean;
  state: AppState;
  blockers: Anomaly[];
  carried: Anomaly[];
}

export function doHandover(
  s: AppState,
  handoverBy: string,
  takeoverBy: string,
  note: string
): HandoverResult {
  const blockers = openSevereOfCurrentShift(s);
  if (blockers.length > 0) {
    return { ok: false, state: s, blockers, carried: [] };
  }
  const now = Date.now();
  const oldShiftId = s.currentShiftId;
  const newShiftId = `S${s.seq}`;
  const newShift: Shift = {
    id: newShiftId,
    label: `第 ${s.shifts.length + 1} 班`,
    startTs: now,
    closed: false,
  };
  // 普通异常可结转到新班；严重异常不存在未处理的（已被拦截），已处理的保留原班次、级别不变
  const carried = s.anomalies.filter(
    (a) => a.level === "normal" && a.status === "open" && a.shiftId === oldShiftId
  );
  const state: AppState = {
    ...s,
    seq: s.seq + 1,
    currentShiftId: newShiftId,
    shifts: [
      ...s.shifts.map((sh) =>
        sh.id === oldShiftId
          ? {
              ...sh,
              closed: true,
              endTs: now,
              handoverBy: handoverBy.trim(),
              takeoverBy: takeoverBy.trim(),
              note: note.trim(),
            }
          : sh
      ),
      newShift,
    ],
    anomalies: s.anomalies.map((a) =>
      a.level === "normal" && a.status === "open" && a.shiftId === oldShiftId
        ? { ...a, shiftId: newShiftId, carriedFrom: a.carriedFrom ?? oldShiftId }
        : a
    ),
  };
  return { ok: true, state, blockers: [], carried };
}

// ---------------- 班次摘要（看板 / 交接共用，保证同步） ----------------

export interface ShiftSummary {
  shift: Shift;
  readingCount: number;
  byDevice: { device: DeviceDef; count: number }[];
  severeTotal: number;
  severeHandled: number;
  severeOpen: Anomaly[];
  normalTotal: number;
  normalHandled: number;
  normalOpen: Anomaly[]; // 当前班未处理普通异常（交接时将结转）
  carriedIn: Anomaly[]; // 从上一班结转进来的普通异常
  carriedOut: Anomaly[]; // 本班产生、已结转到后续班的普通异常
}

export function shiftSummary(s: AppState, shiftId: string): ShiftSummary | null {
  const shift = s.shifts.find((x) => x.id === shiftId);
  if (!shift) return null;
  const readings = s.readings.filter((r) => r.shiftId === shiftId);
  const inShift = s.anomalies.filter((a) => a.shiftId === shiftId);
  const severe = inShift.filter((a) => a.level === "severe");
  const normal = inShift.filter((a) => a.level === "normal");
  return {
    shift,
    readingCount: readings.length,
    byDevice: DEVICES.map((d) => ({
      device: d,
      count: readings.filter((r) => r.device === d.id).length,
    })).filter((x) => x.count > 0),
    severeTotal: severe.length,
    severeHandled: severe.filter((a) => a.status === "handled").length,
    severeOpen: severe.filter((a) => a.status === "open"),
    normalTotal: normal.length,
    normalHandled: normal.filter((a) => a.status === "handled").length,
    normalOpen: normal.filter((a) => a.status === "open"),
    carriedIn: inShift.filter((a) => a.carriedFrom),
    carriedOut: s.anomalies.filter((a) => a.carriedFrom === shiftId && a.shiftId !== shiftId),
  };
}

// ---------------- 本地持久化 ----------------

const STORAGE_KEY = "erw-console-v1";

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.shifts) || parsed.shifts.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 存储满或被禁用时静默失败，页面内状态仍可用
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export { STORAGE_KEY };

// ---------------- 格式化 ----------------

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDuration(from: number, to: number): string {
  const mins = Math.max(0, Math.round((to - from) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`;
}

export function fmtValues(device: DeviceDef, values: Record<string, number>): string {
  return device.params.map((p) => `${p.label} ${values[p.key]} ${p.unit}`).join("，");
}
