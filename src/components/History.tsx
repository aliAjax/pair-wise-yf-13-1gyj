import { useMemo, useState } from "react";
import { CFG, TYPE_LABEL } from "../config";
import { fmtDT } from "../format";
import { currentShift, getShift, shiftIndex, useStore } from "../store";
import type { DeviceType } from "../types";
import { Badge } from "./ui";

export default function History() {
  const s = useStore((x) => x);
  const sh = currentShift();
  const [type, setType] = useState<DeviceType>("main");
  const [device, setDevice] = useState<string>(CFG.main.devices[0]);
  const [scope, setScope] = useState<"all" | "current">("all");

  const def = CFG[type];

  const changeType = (t: DeviceType) => {
    setType(t);
    setDevice(CFG[t].devices[0]);
  };

  const rows = useMemo(() => {
    let list = s.records.filter((r) => r.deviceType === type && r.device === device);
    if (scope === "current") list = list.filter((r) => r.shiftId === sh.id);
    return [...list].sort((a, b) => b.t - a.t);
  }, [s, type, device, scope, sh]);

  return (
    <div className="panel">
      <h2>
        按设备查询历史 <span className="sub">跨班次完整保留，严重异常记录不随交接删除</span>
      </h2>
      <div className="toolbar">
        <div className="fg">
          <label>设备类别</label>
          <select value={type} onChange={(e) => changeType(e.target.value as DeviceType)}>
            {(Object.keys(CFG) as DeviceType[]).map((k) => (
              <option key={k} value={k}>
                {CFG[k].label}
              </option>
            ))}
          </select>
        </div>
        <div className="fg">
          <label>设备</label>
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            {def.devices.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="fg">
          <label>班次范围</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "current")}>
            <option value="all">全部班次</option>
            <option value="current">仅当前班</option>
          </select>
        </div>
        <div className="fg">
          <label>&nbsp;</label>
          <span className="muted count-pill">共 {rows.length} 条</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>班次</th>
              {def.fields.map((f) => (
                <th key={f.k} className="num">
                  {f.label}
                </th>
              ))}
              <th>异常判定</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={def.fields.length + 3} className="empty">
                  {TYPE_LABEL[type]}「{device}」暂无{scope === "current" ? "本班" : ""}记录
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const ans = s.anomalies.filter((a) => a.recordId === r.id);
              const recSh = getShift(r.shiftId);
              return (
                <tr key={r.id}>
                  <td className="nowrap">{fmtDT(r.t)}</td>
                  <td className="muted">
                    第{recSh ? shiftIndex(recSh) : "?"}班{r.shiftId === sh.id ? "（当前）" : ""}
                  </td>
                  {def.fields.map((f) => {
                    const raw = r.values[f.k];
                    const bad = ans.some((a) => a.field === f.k);
                    const val = f.type === "select" ? f.options?.find((o) => o[0] === raw)?.[1] : raw;
                    return (
                      <td key={f.k} className={"num" + (bad ? " bad-cell" : "")}>
                        {val}
                        {f.unit ? ` ${f.unit}` : ""}
                      </td>
                    );
                  })}
                  <td>
                    <div className="tags">
                      {ans.length === 0 && <Badge kind="muted">正常</Badge>}
                      {ans.map((a) => (
                        <span key={a.id} title={`${a.msg}：${a.detail}`}>
                          <Badge kind={a.level}>
                            {a.level === "severe" ? "严重" : "普通"}
                            {a.handled ? " ✓" : ""}
                          </Badge>
                        </span>
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
  );
}
