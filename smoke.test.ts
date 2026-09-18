import {
  addReading,
  createInitialState,
  doHandover,
  handleAnomaly,
  openSevereOfCurrentShift,
  shiftSummary,
} from "./src/model";

let s = createInitialState(1000);
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
};

// 1. 主机正常运转，无异常
let r = addReading(s, "main", { rpm: 500, lubeOil: 0.3, coolTemp: 80, fuel: 180, exhaust: 380 }, "");
s = r.state;
assert(r.anomalies.length === 0, "正常主机参数不触发异常");

// 2. 运转中滑油压力 < 0.1 → 严重
r = addReading(s, "main", { rpm: 500, lubeOil: 0.08, coolTemp: 80, fuel: 180, exhaust: 380 }, "");
s = r.state;
assert(r.anomalies.length === 1 && r.anomalies[0].level === "severe", "滑油压力0.08<0.1 触发严重异常");

// 3. 运转中冷却水温 > 95 → 严重
r = addReading(s, "main", { rpm: 500, lubeOil: 0.3, coolTemp: 97, fuel: 180, exhaust: 380 }, "");
s = r.state;
assert(r.anomalies.some((a) => a.level === "severe" && a.rule.includes("冷却水温")), "冷却水温97>95 触发严重异常");

// 4. 停转仍耗燃油 → 严重；停转时低压/高温不触发（规则限定运转中）
r = addReading(s, "main", { rpm: 0, lubeOil: 0.05, coolTemp: 99, fuel: 12, exhaust: 100 }, "");
s = r.state;
assert(r.anomalies.length === 1 && r.anomalies[0].rule.includes("停转"), "停转耗油触发严重异常，且停转时低压/高温不触发");

// 5. 普通异常：泵组压力偏低、发电机频率越限
r = addReading(s, "pump1", { pressure: 0.1, flow: 30, current: 20 }, "");
s = r.state;
assert(r.anomalies.length === 1 && r.anomalies[0].level === "normal", "泵组压力0.1 触发普通异常");
const normalId = r.anomalies[0].id;
r = addReading(s, "gen1", { voltage: 380, freq: 50.9, current: 100, power: 60 }, "");
s = r.state;
assert(r.anomalies.length === 1 && r.anomalies[0].level === "normal", "频率50.9 触发普通异常");

// 6. 有未处理严重异常 → 交接被拦截
let h = doHandover(s, "张三", "李四", "");
assert(!h.ok && h.blockers.length === 3, `交接被拦截（3条未处理严重），实际 ${h.blockers.length}`);

// 7. 处理全部严重异常后可交接；普通异常结转
for (const a of openSevereOfCurrentShift(s)) s = handleAnomaly(s, a.id, "张三", "已检修");
assert(openSevereOfCurrentShift(s).length === 0, "严重异常全部处理完");
h = doHandover(s, "张三", "李四", "一切正常");
assert(h.ok, "处理后交接成功");
s = h.state;
assert(s.shifts.length === 2 && s.currentShiftId !== s.shifts[0].id, "生成第 2 班");
assert(h.carried.length === 2, "2 条未处理普通异常结转到新班");
const carried = s.anomalies.find((a) => a.id === normalId)!;
assert(carried.shiftId === s.currentShiftId && carried.carriedFrom === "S1" && carried.status === "open", "结转异常归属新班并标记来源");

// 8. 严重异常保留且级别不变
const severe = s.anomalies.filter((a) => a.level === "severe");
assert(severe.length === 3 && severe.every((a) => a.status === "handled" && a.shiftId === "S1"), "严重异常保留在原班、级别不变、状态已处理");

// 9. 摘要数据
const sm1 = shiftSummary(s, "S1")!;
assert(
  sm1.readingCount === 6 && sm1.severeTotal === 3 && sm1.normalTotal === 0 && sm1.carriedOut.length === 2,
  "第1班摘要统计正确（普通异常已结转，计入 carriedOut）"
);
const sm2 = shiftSummary(s, s.currentShiftId)!;
assert(sm2.carriedIn.length === 2, "第2班摘要显示承接 2 条结转异常");

// 10. 新班无严重异常，可直接再交接
h = doHandover(s, "李四", "王五", "");
assert(h.ok, "新班无未处理严重异常，可再次交接");

console.log("\n全部断言通过");
