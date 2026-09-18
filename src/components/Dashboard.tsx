import { useEffect, useMemo, useState } from "react";
import { CFG, TYPE_LABEL } from "../config";
import { fmtDT, fmtDur } from "../format";
import { evaluate, statusOf } from "../rules";
import { currentShift, shiftIndex, useStore } from "../store";
import type { DeviceType, RecordEntry, State } from "../types";
import { Badge } from "./ui";

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function latestRecord(s: State, type: DeviceType, device: string): RecordEntry | null {
  let r: RecordEntry | null = null;
  for (const rec of s.records) {
    if (rec.deviceType === type && rec.device === device && (!r || rec.t > r.t)) r = rec;
  }
  return r;
}

function DeviceCard({ type, device, now }: { type: DeviceType; device: string; now: number }) {
  const s = useStore((x) => x);
  const r = latestRecord(s, type, device);
  const sh = currentShift();
  if (!r) {
    return (
      <div className="dev-card">
        <div className="dev-row1">
          <span className="dot" />
          <span className="dname">{device}</span>
          <span className="dstate">无记录</span>
        </div>
      </div>
    );
  }
  const curAnoms = s.anomalies.filter((a) => a.shiftId === sh.id);
  const hasSevere = curAnoms.some((a) => a.device === device && a.level === "severe" && !a.handled);
  const [cls, label] = statusOf(type, r.values);
  const badFields = new Set(evaluate(r).map((h) => h.field));

  return (
    <div className={"dev-card" + (hasSevere ? " has-severe" : "")}>
      <div className="dev-row1">
        <span className={"dot " + (hasSevere ? "severe" : cls)} />
        <span className="dname">{device}</span>
        <span className="dstate">
          {label} · {TYPE_LABEL[type]}
        </span>
      </div>
      <div className="dev-params">
        {CFG[type].fields.map((f) => {
          const raw = r.values[f.k];
          const val = f.type === "select" ? f.options?.find((o) => o[0] === raw)?.[1] : raw;
          return (
            <div key={f.k} className={"p" + (badFields.has(f.k) ? " bad" : "")}>
              <span className="k">{f.label}：</span>
              {val}
              {f.unit ? ` ${f.unit}` : ""}
            </div>
          );
        })}
      </div>
      <div className="dev-time">
        {fmtDT(r.t)}
        {r.shiftId !== sh.id ? " · 历史班数据" : ""} · {fmtDur(Math.max(0, now - r.t))}前
      </div>
    </div>
  );
}

export default function Dashboard({ go }: { go: (v: string) => void }) {
  const s = useStore((x) => x);
  const now = useNow();
  const sh = currentShift();
  const cur = useMemo(() => s.anomalies.filter((a) => a.shiftId === sh.id), [s, sh]);
  const sevU = cur.filter((a) => a.level === "severe" && !a.handled);
  const sevH = cur.filter((a) => a.level === "severe" && a.handled);
  const norU = cur.filter((a) => a.level === "normal" && !a.handled);
  const recs = s.records.filter((r) => r.shiftId === sh.id);
  const recent = [...recs].sort((a, b) => b.t - a.t).slice(0, 8);

  return (
    <>
      {sevU.length > 0 ? (
        <div className="banner red">
          <span>⚠️</span>
          <div className="grow">
            <b>当前班存在 {sevU.length} 项未处理严重异常</b>
            <div className="banner-sub">交接确认已被拦截，处理全部严重异常后方可交接；严重异常记录永久保留、级别不变。</div>
          </div>
          <button className="btn danger sm" onClick={() => go("handover")}>
            前往处理
          </button>
        </div>
      ) : (
        <div className="banner green">
          <span>✅</span>
          <div className="grow">
            <b>第 {shiftIndex(sh)} 班无未处理严重异常，具备交接条件</b>
            <div className="banner-sub">所有视图基于同一份本地数据实时同步。</div>
          </div>
          <button className="btn sm" onClick={() => go("handover")}>
            查看交接摘要
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <Kpi cls="severe" num={sevU.length} lbl="未处理严重异常" />
        <Kpi cls="normal" num={norU.length} lbl="未处理普通异常" />
        <Kpi cls="ok" num={sevH.length} lbl="已处理严重异常" />
        <Kpi cls="muted" num={recs.length} lbl="本班参数记录" />
      </div>

      <div className="panel">
        <h2>
          设备实时状态 <span className="sub">取各设备最近一次记录，越限参数标红</span>
        </h2>
        <div className="dev-grid">
          {(Object.keys(CFG) as DeviceType[]).map((type) =>
            CFG[type].devices.map((d) => <DeviceCard key={type + d} type={type} device={d} now={now} />)
          )}
        </div>
      </div>

      <div className="panel">
        <h2>本班最近记录</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>设备</th>
                <th>主要参数</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    本班暂无记录，请先到「参数录入」提交
                  </td>
                </tr>
              )}
              {recent.map((r) => {
                const ans = s.anomalies.filter((a) => a.recordId === r.id);
                return (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDT(r.t)}</td>
                    <td>{r.device}</td>
                    <td className="muted">
                      {CFG[r.deviceType].fields
                        .slice(0, 4)
                        .map((f) => {
                          const raw = r.values[f.k];
                          const val = f.type === "select" ? f.options?.find((o) => o[0] === raw)?.[1] : raw;
                          return `${f.label} ${val}${f.unit ?? ""}`;
                        })
                        .join("，")}
                    </td>
                    <td>
                      <div className="tags">
                        {ans.length === 0 && <Badge kind="muted">正常</Badge>}
                        {ans.map((a) => (
                          <Badge key={a.id} kind={a.level}>
                            {a.level === "severe" ? "严重" : "普通"}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Kpi({ cls, num, lbl }: { cls: string; num: number; lbl: string }) {
  return (
    <div className={"panel kpi " + cls}>
      <div className="num">{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}
