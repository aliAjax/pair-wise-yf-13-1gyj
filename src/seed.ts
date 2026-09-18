import { evaluate } from "./rules";
import type { Anomaly, DeviceType, RecordEntry, Shift, State } from "./types";

/** 首次打开时生成两班演示数据：上一班（已交接）+ 当前班（有一项未处理严重异常） */
export function seed(now: number, makeId: (p: string) => string): State {
  const H = 3600000;
  const state: State = { seq: 0, shifts: [], records: [], anomalies: [], currentShiftId: "" };
  const nextId = makeId; // 闭包内部使用的 id 生成器由 store 注入

  const s1: Shift = {
    id: nextId("sh"),
    start: now - 26 * H,
    end: now - 18 * H,
    leader: "王建国",
    outgoing: "王建国",
    incoming: "李大海",
    remark: "主机运转平稳，参数正常，交接齐全。",
  };
  const s2: Shift = {
    id: nextId("sh"),
    start: now - 6 * H,
    end: null,
    leader: "李大海",
    outgoing: "",
    incoming: "",
    remark: "",
  };
  state.shifts.push(s1, s2);
  state.currentShiftId = s2.id;

  const rec = (
    sh: Shift,
    offsetMs: number,
    deviceType: DeviceType,
    device: string,
    values: Record<string, number | string>
  ): RecordEntry => {
    const r: RecordEntry = {
      id: nextId("rec"),
      shiftId: sh.id,
      t: now + offsetMs,
      deviceType,
      device,
      values,
    };
    state.records.push(r);
    evaluate(r).forEach((hit) => {
      const a: Anomaly = {
        id: nextId("an"),
        shiftId: sh.id,
        t: r.t,
        deviceType,
        device,
        recordId: r.id,
        level: hit.level,
        msg: hit.msg,
        detail: hit.detail,
        field: hit.field,
        handled: false,
        handledAt: null,
        note: "",
        carried: false,
        carriedFrom: null,
      };
      state.anomalies.push(a);
    });
    return r;
  };

  const mark = (sh: Shift, pred: (a: Anomaly) => boolean, note: string, afterMin: number) => {
    const a = state.anomalies.find((x) => x.shiftId === sh.id && pred(x));
    if (a) {
      a.handled = true;
      a.handledAt = a.t + afterMin * 60000;
      a.note = note;
    }
  };

  /* ---------- 上一班 ---------- */
  rec(s1, -25.5 * H, "main", "1号主机", { rpm: 1200, oil: 0.28, temp: 81, fuel: 86, exhaust: 425 });
  rec(s1, -24.8 * H, "gen", "1号发电机", { power: 320, voltage: 400, frequency: 50, temp: 74, oil: 0.36 });
  rec(s1, -23.2 * H, "pump", "主滑油泵", { status: "run", pressure: 0.11, flow: 19, current: 17 }); // 普通异常 → 结转
  rec(s1, -21.4 * H, "main", "1号主机", { rpm: 1180, oil: 0.26, temp: 97.2, fuel: 88, exhaust: 505 }); // 严重 → 已处理
  mark(s1, (a) => a.msg.includes("冷却水温过高"), "降低主机负荷、加大冷却水量，水温恢复至 86 ℃", 25);
  rec(s1, -19.2 * H, "main", "1号主机", { rpm: 1200, oil: 0.27, temp: 84, fuel: 85, exhaust: 430 });

  /* ---------- 当前班 ---------- */
  rec(s2, -5.5 * H, "main", "1号主机", { rpm: 1200, oil: 0.27, temp: 83, fuel: 85, exhaust: 430 });
  rec(s2, -5.2 * H, "gen", "1号发电机", { power: 330, voltage: 401, frequency: 50, temp: 76, oil: 0.34 });
  rec(s2, -4.8 * H, "pump", "主机海水泵", { status: "run", pressure: 0.28, flow: 46, current: 22 });
  rec(s2, -3.6 * H, "gen", "2号发电机", { power: 0, voltage: 0, frequency: 0, temp: 42, oil: 0 });
  rec(s2, -2.6 * H, "main", "1号主机", { rpm: 0, oil: 0.02, temp: 45, fuel: 1.4, exhaust: 120 }); // 严重：停转耗油 → 已处理
  mark(s2, (a) => a.msg.includes("停转仍耗燃油"), "关闭燃油进油阀，排查喷油泵内漏，已隔离", 18);
  rec(s2, -2.1 * H, "gen", "1号发电机", { power: 340, voltage: 426, frequency: 50.1, temp: 80, oil: 0.33 }); // 普通，未处理
  rec(s2, -1.6 * H, "main", "1号主机", { rpm: 1150, oil: 0.07, temp: 89, fuel: 84, exhaust: 440 }); // 严重：滑油低压 → 未处理（拦截交接）
  rec(s2, -0.8 * H, "pump", "燃油供给泵", { status: "run", pressure: 0.4, flow: 12, current: 9.5 });
  rec(s2, -0.3 * H, "main", "1号主机", { rpm: 1160, oil: 0.08, temp: 90, fuel: 84, exhaust: 438 }); // 严重：滑油低压 → 未处理

  // 上一班未处理的普通异常结转当前班
  state.anomalies.forEach((a) => {
    if (a.shiftId === s1.id && a.level === "normal" && !a.handled) {
      a.shiftId = s2.id;
      a.carried = true;
      a.carriedFrom = s1.id;
      a.t = s2.start + 60000;
    }
  });

  return state;
}
