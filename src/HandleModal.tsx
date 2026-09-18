import { useSyncExternalStore } from "react";
import { getState, handleAnomaly } from "./store";
import { toast } from "./toast";

let anomalyId: string | null = null;
let note = "";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function openHandle(id: string) {
  anomalyId = id;
  note = "";
  emit();
}

function close() {
  anomalyId = null;
  note = "";
  emit();
}

export function HandleModal() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => anomalyId
  );
  if (!anomalyId) return null;
  const a = getState().anomalies.find((x) => x.id === anomalyId);
  if (!a || a.handled) {
    close();
    return null;
  }

  const confirm = () => {
    const n = note.trim();
    if (!n) {
      toast("请填写处理措施 / 结果");
      return;
    }
    handleAnomaly(a.id, n);
    close();
    toast("已标记处理，记录保留在时间线中");
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <h3>{a.level === "severe" ? "处理严重异常" : "处理普通异常"}</h3>
        <div className="modal-head">
          <span className={"badge " + a.level}>{a.level === "severe" ? "严重异常" : "普通异常"}</span>
          <b>{a.msg}</b>
        </div>
        <p className="muted modal-detail">{a.detail}</p>
        <label className="fld">
          <span>处理措施 / 结果（必填）</span>
          <textarea
            rows={3}
            autoFocus
            value={note}
            placeholder="例如：降低负荷、清洗滑油滤器，压力恢复至 0.28 MPa"
            onChange={(e) => {
              note = e.target.value;
              emit();
            }}
          />
        </label>
        {a.level === "severe" ? (
          <div className="lock-hint">🔒 确认处理后该严重异常仍永久保留，级别不变，不可删除。</div>
        ) : (
          <div className="lock-hint">普通异常若不处理，交接时将结转下一班。</div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            取消
          </button>
          <button className={"btn " + (a.level === "severe" ? "danger" : "primary")} onClick={confirm}>
            确认处理
          </button>
        </div>
      </div>
    </div>
  );
}
