import type { ReactNode } from "react";
import type { Anomaly } from "../types";
import { fmtDT } from "../format";
import { openHandle } from "../HandleModal";

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={"badge " + kind}>{children}</span>;
}

/** 交接页 / 时间线共用的异常条目 */
export function AnomalyCard({ a, compact }: { a: Anomaly; compact?: boolean }) {
  return (
    <div className={"an-card " + a.level + (a.handled ? " handled" : "")}>
      <div className="an-head">
        <Badge kind={a.level}>{a.level === "severe" ? "● 严重异常" : "● 普通异常"}</Badge>
        <b>{a.msg}</b>
        {a.carried && <Badge kind="carried">上一班结转</Badge>}
        {a.handled ? <Badge kind="handled">已处理</Badge> : (
          <Badge kind={a.level === "severe" ? "severe" : "normal"}>未处理</Badge>
        )}
        <span className="muted an-time">{fmtDT(a.t)} · {a.device}</span>
      </div>
      {!compact && <div className="an-detail">{a.detail}</div>}
      {a.handled ? (
        <div className="an-note">
          ✓ {fmtDT(a.handledAt!)} 处理：<b>{a.note}</b>
          {a.level === "severe" && <span className="lock-hint inline">级别保留，不可删除 / 降级</span>}
        </div>
      ) : (
        <div className="an-actions">
          <button className={"btn sm " + (a.level === "severe" ? "danger" : "")} onClick={() => openHandle(a.id)}>
            处理并填写措施
          </button>
        </div>
      )}
    </div>
  );
}
