export type DeviceType = "main" | "gen" | "pump";
export type AnomalyLevel = "severe" | "normal";

export interface FieldDef {
  k: string;
  label: string;
  unit?: string;
  step?: number;
  type?: "number" | "select";
  options?: [string, string][];
  normal: number | string;
}

export interface DeviceTypeDef {
  label: string;
  devices: string[];
  fields: FieldDef[];
}

export interface Shift {
  id: string;
  start: number;
  end: number | null;
  leader: string;
  outgoing: string;
  incoming: string;
  remark: string;
}

export interface RecordEntry {
  id: string;
  shiftId: string;
  t: number;
  deviceType: DeviceType;
  device: string;
  values: Record<string, number | string>;
}

export interface Anomaly {
  id: string;
  shiftId: string;
  t: number;
  deviceType: DeviceType;
  device: string;
  recordId: string;
  level: AnomalyLevel;
  msg: string;
  detail: string;
  field: string;
  handled: boolean;
  handledAt: number | null;
  note: string;
  /** 普通异常由上一班结转而来 */
  carried: boolean;
  carriedFrom: string | null;
}

export interface State {
  seq: number;
  shifts: Shift[];
  records: RecordEntry[];
  anomalies: Anomaly[];
  currentShiftId: string;
}
