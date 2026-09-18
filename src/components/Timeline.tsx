import { useMemo, useState } from "react";
import { TYPE_LABEL } from "../config";
import { fmtDT } from "../format";
import { currentShift, getShift, shiftIndex, useStore } from "../store";
import type { AnomalyLevel } from "../types";
import { AnomalyCard } from "./ui";

export default function Timeline() {
  const s = useStore((x) => x);
  const sh = currentShift();
  const [level, setLevel] = useState<"all" | AnomalyLevel>("all");
  const [stateFilter, setStateFilter] = useState<"all" | "unhandled" | "handled" | "carried">("all");
  const [scope, setScope] = useState<"all" | "current" | "past">("all");

  const list = useMemo(() => {
    let l = s.anomalies.slice();
    if (level !== "all") l = l.filter((a) => a.level === level);
    if (stateFilter === "unhandled") l = l.filter((a) => !a.handled);
    if (stateFilter === "handled") l = l.filter((a) => a.handled);
    if (stateFilter === "carried") l = l.filter((a) => a.carried);
    if (scope === "current") l = l.filter((a) => a.shiftId === sh.id);
    if (scope === "past") l = l.filter((a) => a.shiftId !== sh.id);
    return l.sort((a, b) => b.t - a.t);
  }, [s, level, stateFilter, scope, sh]);

  return (
    <div className="panel">
      <h2>
        异常时间线 <span className="sub">按时间倒序；严重异常永久保留，级别始终不变</span>
      </h2>
      <div className="toolbar">
        <div className="fg">
          <label>级别</label>
          <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="all">全部</option>
            <option value="severe">严重</option>
            <option value="normal">普通</option>
          </select>
        </div>
        <div className="fg">
          <label>处理状态</label>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}>
            <option value="all">全部</option>
            <option value="unhandled">未处理</option>
            <option value="handled">已处理</option>
            <option value="carried">已结转</option>
          </select>
        </div>
        <div className="fg">
          <label>班次</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="all">全部班次</option>
            <option value="current">当前班</option>
            <option value="past">历史班</option>
          </select>
        </div>
        <div className="fg">
          <label>&nbsp;</label>
          <span className="muted count-pill">{list.length} 项</span>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty-block">没有符合条件的异常记录</div>
      ) : (
        <div className="timeline">
          {list.map((a) => {
            const ownSh = getShift(a.shiftId);
            return (
              <div key={a.id} className={"tl-wrap " + a.level + (a.handled ? " handled" : "")}>
                <div className="tl-meta">
                  <span className="tl-time">{fmtDT(a.t)}</span>
                  <span className="muted">
                    {TYPE_LABEL[a.deviceType]}
                  </span>
                  <span className="muted" style={{ marginLeft: "auto" }}>
                    归属第{ownSh ? shiftIndex(ownSh) : "?"}班{a.shiftId === sh.id ? "（当前）" : ""}
                  </span>
                </div>
                <AnomalyCard a={a} compact />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
