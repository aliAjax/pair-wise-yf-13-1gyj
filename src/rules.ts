import type { AnomalyLevel, DeviceType, RecordEntry } from "./types";

export interface RuleHit {
  level: AnomalyLevel;
  msg: string;
  detail: string;
  field: string;
}

type Vals = RecordEntry["values"];
const num = (v: Vals, k: string) => Number(v[k]);

/**
 * 严重异常规则（主机）：
 *  1) 运转（rpm>0）时滑油压力 < 0.10 MPa
 *  2) 运转（rpm>0）时冷却水温 > 95 ℃
 *  3) 停转（rpm=0）时燃油流量 > 0
 * 其余越限为普通异常。
 */
export function evaluate(rec: RecordEntry): RuleHit[] {
  const v = rec.values;
  const out: RuleHit[] = [];
  const add = (level: AnomalyLevel, field: string, msg: string, detail: string) =>
    out.push({ level, field, msg, detail });

  if (rec.deviceType === "main") {
    const rpm = num(v, "rpm");
    if (rpm > 0) {
      const oil = num(v, "oil");
      if (oil < 0.1) {
        add("severe", "oil", "主机运转中滑油压力过低",
          `转速 ${rpm} r/min，滑油压力 ${oil} MPa（运转时限值 ≥ 0.10 MPa）`);
      } else if (oil < 0.15) {
        add("normal", "oil", "主机滑油压力偏低",
          `滑油压力 ${oil} MPa，接近限值 0.10 MPa`);
      }
      const temp = num(v, "temp");
      if (temp > 95) {
        add("severe", "temp", "主机运转中冷却水温过高",
          `转速 ${rpm} r/min，冷却水温 ${temp} ℃（运转时限值 ≤ 95 ℃）`);
      } else if (temp > 90) {
        add("normal", "temp", "主机冷却水温偏高",
          `冷却水温 ${temp} ℃，接近限值 95 ℃`);
      }
      const exhaust = num(v, "exhaust");
      if (exhaust > 520) {
        add("normal", "exhaust", "主机排气温度偏高",
          `排气温度 ${exhaust} ℃（参考上限 520 ℃）`);
      }
    } else {
      const fuel = num(v, "fuel");
      if (fuel > 0) {
        add("severe", "fuel", "主机停转仍耗燃油",
          `转速 0 r/min，燃油流量 ${fuel} L/h，停转时限值为 0`);
      }
    }
  } else if (rec.deviceType === "gen") {
    const power = num(v, "power");
    if (power > 0) {
      const voltage = num(v, "voltage");
      if (voltage < 380 || voltage > 410) {
        add("normal", "voltage", "发电机电压越限",
          `电压 ${voltage} V（允许范围 380–410 V）`);
      }
      const frequency = num(v, "frequency");
      if (frequency < 49.5 || frequency > 50.5) {
        add("normal", "frequency", "发电机频率越限",
          `频率 ${frequency} Hz（允许范围 49.5–50.5 Hz）`);
      }
      const temp = num(v, "temp");
      if (temp > 90) {
        add("normal", "temp", "发电机冷却水温过高",
          `冷却水温 ${temp} ℃（限值 90 ℃）`);
      }
      const oil = num(v, "oil");
      if (oil < 0.25) {
        add("normal", "oil", "发电机滑油压力偏低",
          `滑油压力 ${oil} MPa（限值 0.25 MPa）`);
      }
    }
  } else if (rec.deviceType === "pump") {
    if (v.status === "run") {
      const pressure = num(v, "pressure");
      if (pressure < 0.15) {
        add("normal", "pressure", "泵组出口压力过低",
          `出口压力 ${pressure} MPa（运行限值 ≥ 0.15 MPa）`);
      }
      const flow = num(v, "flow");
      if (flow <= 0) {
        add("normal", "flow", "泵组运行但流量为零",
          `运行状态下流量 ${flow} m³/h`);
      }
    } else {
      const flow = num(v, "flow");
      if (flow > 0) {
        add("normal", "flow", "泵组停转但流量不为零",
          `停转状态下流量 ${flow} m³/h`);
      }
    }
  }

  return out;
}

export function statusOf(type: DeviceType, values: Vals): ["run" | "stop", string] {
  if (type === "main") return num(values, "rpm") > 0 ? ["run", "运转"] : ["stop", "停转"];
  if (type === "gen") return num(values, "power") > 0 ? ["run", "供电中"] : ["stop", "备用"];
  return values.status === "run" ? ["run", "运行"] : ["stop", "停转"];
}
