import { useState } from "react";
import { CFG } from "../config";
import { toLocalInput } from "../format";
import { addRecord } from "../store";
import type { DeviceType } from "../types";
import { toast } from "../toast";

export default function Entry() {
  const [type, setType] = useState<DeviceType>("main");
  const [device, setDevice] = useState<string>(CFG.main.devices[0]);
  const [time, setTime] = useState<string>(toLocalInput(new Date()));
  const [values, setValues] = useState<Record<string, string>>({});

  const def = CFG[type];

  const changeType = (t: DeviceType) => {
    setType(t);
    setDevice(CFG[t].devices[0]);
    setValues({});
  };

  const fillNormal = () => {
    const next: Record<string, string> = {};
    def.fields.forEach((f) => (next[f.k] = String(f.normal)));
    setValues(next);
  };

  const submit = () => {
    const t = time ? new Date(time).getTime() : Date.now();
    if (!Number.isFinite(t)) {
      toast("记录时间无效");
      return;
    }
    const parsed: Record<string, number | string> = {};
    for (const f of def.fields) {
      const raw = values[f.k];
      if (f.type === "select") {
        parsed[f.k] = raw || String(f.normal);
        continue;
      }
      const n = Number(raw);
      if (raw === undefined || raw.trim() === "" || !Number.isFinite(n)) {
        toast(`请填写「${f.label}」`);
        return;
      }
      parsed[f.k] = n;
    }
    const hits = addRecord(type, device, t, parsed);
    if (hits.length === 0) {
      toast("已提交，参数正常");
    } else {
      const sev = hits.filter((h) => h.level === "severe").length;
      const nor = hits.length - sev;
      toast(`已提交，触发 ${sev ? `${sev} 项严重` : ""}${sev && nor ? "、" : ""}${nor ? `${nor} 项普通` : ""}异常`);
    }
    setValues({});
    setTime(toLocalInput(new Date()));
  };

  return (
    <>
      <div className="banner blue">
        <div>
          <b>自动判定规则</b>
          <div className="rule-hint">
            · 主机<b className="sev">运转</b>（转速 &gt; 0）时：滑油压力 &lt; <b className="sev">0.10 MPa</b> 或 冷却水温 &gt; <b className="sev">95 ℃</b>，记<b className="sev">严重异常</b>；
            <br />· 主机<b className="sev">停转</b>（转速 = 0）仍有燃油流量（&gt; 0），记<b className="sev">严重异常</b>；
            <br />· 发电机 / 泵组参数越限记普通异常。严重异常不可删除、级别不可更改，处理后仍永久保留。
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>新增参数记录</h2>
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
            <label>记录时间</label>
            <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="fg">
            <label>&nbsp;</label>
            <button className="btn sm" onClick={fillNormal}>
              填入正常值
            </button>
          </div>
        </div>

        <div className="form-grid">
          {def.fields.map((f) => (
            <label className="fld" key={f.k}>
              <span>
                {f.label}
                {f.unit ? `（${f.unit}）` : ""}
              </span>
              {f.type === "select" ? (
                <select value={values[f.k] ?? String(f.normal)} onChange={(e) => setValues({ ...values, [f.k]: e.target.value })}>
                  {f.options?.map((o) => (
                    <option key={o[0]} value={o[0]}>
                      {o[1]}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step={f.step ?? 1}
                  placeholder="输入读数"
                  value={values[f.k] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.k]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>

        <div className="gap" />
        <button className="btn primary" onClick={submit}>
          提交记录
        </button>
      </div>
    </>
  );
}
