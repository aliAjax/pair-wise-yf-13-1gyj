import { useEffect, useState } from "react";
import { fmtDT, fmtDur } from "../format";
import {
  anomaliesOfShift,
  confirmHandover,
  currentShift,
  HandoverBlockedError,
  shiftIndex,
  useStore,
} from "../store";
import type { Shift } from "../types";
import { toast } from "../toast";
import { AnomalyCard, Badge } from "./ui";

export default function Handover({ go }: { go: (v: string) => void }) {
  const s = useStore((x) => x);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sh = currentShift();
  const cur = s.anomalies.filter((a) => a.shiftId === sh.id);
  const sevU = cur.filter((a) => a.level === "severe" && !a.handled);
  const sevH = cur.filter((a) => a.level === "severe" && a.handled);
  const norU = cur.filter((a) => a.level === "normal" && !a.handled);
  const norH = cur.filter((a) => a.level === "normal" && a.handled);
  const recs = s.records.filter((r) => r.shiftId === sh.id);
  const cnt = (t: string) => recs.filter((r) => r.deviceType === t).length;

  const [outgoing, setOutgoing] = useState(sh.outgoing || sh.leader || "");
  const [incoming, setIncoming] = useState("");
  const [remark, setRemark] = useState("");

  const doHandover = () => {
    if (!outgoing.trim() || !incoming.trim()) {
      toast("请填写交班与接班轮机员姓名");
      return;
    }
    if (outgoing.trim() === incoming.trim()) {
      toast("交班与接班轮机员不能为同一人");
      return;
    }
    try {
      confirmHandover(outgoing.trim(), incoming.trim(), remark.trim());
      setIncoming("");
      setRemark("");
      toast("交接完成，已开启新一班");
      go("dashboard");
    } catch (e) {
      if (e instanceof HandoverBlockedError) toast(e.message);
    }
  };

  const past = s.shifts.filter((x) => x.end !== null).sort((a, b) => (b.end as number) - (a.end as number));

  return (
    <>
      {sevU.length > 0 ? (
        <div className="banner red">
          <span>🚫</span>
          <div className="grow">
            <b>交接确认已拦截</b>
            <div className="banner-sub">
              当前班还有 {sevU.length} 项严重异常未处理。处理后方可交接；严重异常永久保留、级别不变。
            </div>
          </div>
        </div>
      ) : (
        <div className="banner green">
          <span>✅</span>
          <div className="grow">
            <b>严重异常均已处理，可以交接</b>
            <div className="banner-sub">未处理的普通异常（{norU.length} 项）将在确认交接时自动结转下一班。</div>
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="panel">
          <h2>
            当前班交接摘要 <span className="sub">第 {shiftIndex(sh)} 班 · {fmtDT(sh.start)} 起</span>
          </h2>
          <table className="summary-table">
            <tbody>
              <tr><td className="muted">值班轮机员</td><td>{sh.leader || "—"}</td></tr>
              <tr><td className="muted">本班时长</td><td>{fmtDur(now - sh.start)}</td></tr>
              <tr>
                <td className="muted">参数记录</td>
                <td>共 {recs.length} 条（主机 {cnt("main")} · 发电机 {cnt("gen")} · 泵组 {cnt("pump")}）</td>
              </tr>
              <tr>
                <td className="muted">严重异常</td>
                <td>
                  <Badge kind="severe">未处理 {sevU.length}</Badge> <Badge kind="handled">已处理 {sevH.length}</Badge>{" "}
                  <span className="lock-hint inline">永久保留</span>
                </td>
              </tr>
              <tr>
                <td className="muted">普通异常</td>
                <td>
                  <Badge kind="normal">未处理 {norU.length}（结转下一班）</Badge>{" "}
                  <Badge kind="handled">已处理 {norH.length}</Badge>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="gap" />
          <h3 className="sub-title">本班严重异常清单（始终保留）</h3>
          {cur.filter((a) => a.level === "severe").length === 0 ? (
            <div className="empty-block">本班未发生严重异常</div>
          ) : (
            cur.filter((a) => a.level === "severe").map((a) => <AnomalyCard key={a.id} a={a} />)
          )}

          {norU.length > 0 && (
            <>
              <div className="gap" />
              <h3 className="sub-title">待结转普通异常</h3>
              {norU.map((a) => (
                <AnomalyCard key={a.id} a={a} />
              ))}
            </>
          )}
        </div>

        <div>
          <div className="panel">
            <h2>交接确认</h2>
            {sevU.length > 0 && (
              <div className="block-list">
                {sevU.map((a) => (
                  <div key={a.id} className="block-item">
                    <Badge kind="severe">严重 · 未处理</Badge>
                    <b>{a.msg}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {fmtDT(a.t)} · {a.device} · {a.detail}
                    </div>
                    <div className="an-actions">
                      <button className="btn danger sm" onClick={() => go("timeline")}>
                        去时间线处理
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <label className="fld">
              <span>交班轮机员</span>
              <input value={outgoing} onChange={(e) => setOutgoing(e.target.value)} placeholder="姓名" />
            </label>
            <label className="fld">
              <span>接班轮机员</span>
              <input value={incoming} onChange={(e) => setIncoming(e.target.value)} placeholder="姓名" />
            </label>
            <label className="fld">
              <span>交接备注</span>
              <textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="运转情况、遗留事项等" />
            </label>
            <button className="btn primary" disabled={sevU.length > 0} onClick={doHandover}>
              {sevU.length > 0 ? `交接被拦截（${sevU.length} 项严重异常未处理）` : "确认交接，开启下一班"}
            </button>
            <div className="lock-hint" style={{ marginTop: 8 }}>
              🔒 存在未处理严重异常时按钮锁定；严重异常处理后也永久保留在历史中。
            </div>
          </div>

          <div className="panel">
            <h2>历史交接记录</h2>
            {past.length === 0 && <div className="empty-block">暂无历史交接记录</div>}
            {past.map((p) => (
              <PastShift key={p.id} sh={p} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PastShift({ sh }: { sh: Shift }) {
  const all = anomaliesOfShift(sh);
  const sev = all.filter((a) => a.level === "severe");
  const carried = all.filter((a) => a.carriedFrom === sh.id);
  const recs = useStore((st) => st.records.filter((r) => r.shiftId === sh.id));
  return (
    <details className="past-item">
      <summary>
        <b>第 {shiftIndex(sh)} 班</b>
        <span className="muted">
          {fmtDT(sh.start)} → {fmtDT(sh.end as number)}
        </span>
        <Badge kind="severe">严重 {sev.length}</Badge>
        <Badge kind="carried">结转 {carried.length}</Badge>
        <span className="muted" style={{ marginLeft: "auto" }}>
          {sh.outgoing} → {sh.incoming}
        </span>
      </summary>
      <div className="past-body">
        <div className="muted" style={{ fontSize: 12.5 }}>
          记录 {recs.length} 条；严重异常 {sev.length} 项（均已处理并永久保留）；普通异常结转 {carried.length} 项。
        </div>
        {sh.remark && <div style={{ marginTop: 6 }}>备注：{sh.remark}</div>}
        {sev.map((a) => (
          <div key={a.id} className="past-sev">
            <Badge kind="severe">严重</Badge> <b>{a.msg}</b>{" "}
            <span className="muted" style={{ fontSize: 12 }}>
              {fmtDT(a.t)} · {a.device}
            </span>
            <div className="an-note">✓ {a.note}</div>
          </div>
        ))}
        {carried.length > 0 && (
          <div className="tags" style={{ marginTop: 6 }}>
            {carried.map((a) => (
              <Badge key={a.id} kind="normal">
                {a.msg}（已结转）
              </Badge>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
