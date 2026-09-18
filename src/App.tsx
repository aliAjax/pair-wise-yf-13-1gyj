import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  addReading,
  Anomaly,
  AppState,
  clearState,
  createInitialState,
  currentShift,
  DEVICES,
  DeviceId,
  deviceById,
  doHandover,
  fmtDuration,
  fmtTime,
  fmtValues,
  handleAnomaly,
  loadState,
  openSevereOfCurrentShift,
  saveState,
  SEVERE_RULES_TEXT,
  shiftSummary,
  STORAGE_KEY,
} from "./model";

type Tab = "dashboard" | "entry" | "history" | "timeline" | "handover";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "机舱看板" },
  { id: "entry", label: "参数录入" },
  { id: "history", label: "历史查询" },
  { id: "timeline", label: "异常时间线" },
  { id: "handover", label: "交接班" },
];

function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? createInitialState());
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "warn" | "err" } | null>(null);
  const [now, setNow] = useState(Date.now());

  // 任何状态变化立即写入 localStorage，刷新后保留
  useEffect(() => saveState(state), [state]);

  // 多标签页之间保持同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const s = loadState();
        if (s) setState(s);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 看板时钟 / 班次时长
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const shift = currentShift(state);
  const openSevere = openSevereOfCurrentShift(state);
  const openAnomalyCount = state.anomalies.filter(
    (a) => a.status === "open" && a.shiftId === state.currentShiftId
  ).length;

  const notify = (text: string, kind: "ok" | "warn" | "err" = "ok") => setToast({ text, kind });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `轮机值班数据_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const resetAll = () => {
    if (!window.confirm("确定清空全部本地数据并重新开始吗？此操作不可恢复。")) return;
    clearState();
    setState(createInitialState());
    notify("已清空本地数据，重新开始第 1 班", "warn");
  };

  const loadDemo = () => {
    let s = state;
    const base = Date.now() - 6 * 60000;
    const demo: [DeviceId, Record<string, number>, string][] = [
      ["main", { rpm: 520, lubeOil: 0.32, coolTemp: 78, fuel: 185, exhaust: 382 }, "正常运行工况"],
      ["gen1", { voltage: 388, freq: 50.0, current: 120, power: 78 }, ""],
      ["pump1", { pressure: 0.35, flow: 42, current: 28 }, ""],
      ["main", { rpm: 480, lubeOil: 0.08, coolTemp: 82, fuel: 170, exhaust: 395 }, "滑油压力突降"],
      ["pump2", { pressure: 0.12, flow: 18, current: 31 }, "出口压力偏低"],
      ["gen2", { voltage: 392, freq: 50.9, current: 96, power: 60 }, ""],
      ["main", { rpm: 0, lubeOil: 0, coolTemp: 45, fuel: 12, exhaust: 60 }, "主机停车后仍有燃油读数"],
    ];
    demo.forEach(([dev, values, note], i) => {
      s = addReading(s, dev, values, note, base + i * 60000).state;
    });
    setState(s);
    notify("已生成 7 条演示记录（含 2 条严重异常、2 条普通异常），可测试交接拦截", "warn");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>船舶轮机值班台</h1>
          <p className="sub">
            当前班次：<b>{shift.label}</b> · 开始于 {fmtTime(shift.startTs)} · 已值班{" "}
            {fmtDuration(shift.startTs, now)}
          </p>
        </div>
        <div className="top-actions">
          <button onClick={loadDemo}>演示数据</button>
          <button onClick={exportJson}>导出 JSON</button>
          <button className="danger-outline" onClick={resetAll}>
            清空数据
          </button>
        </div>
      </header>

      {openSevere.length > 0 && (
        <div className="banner severe-banner">
          ⚠ 当前班有 {openSevere.length} 条未处理严重异常，交接班已被拦截，请先在「异常时间线」中处理。
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "timeline" && openAnomalyCount > 0 && (
              <span className="badge">{openAnomalyCount}</span>
            )}
          </button>
        ))}
      </nav>

      <main>
        {tab === "dashboard" && <Dashboard state={state} now={now} goTimeline={() => setTab("timeline")} />}
        {tab === "entry" && <Entry state={state} setState={setState} notify={notify} />}
        {tab === "history" && <History state={state} />}
        {tab === "timeline" && <Timeline state={state} setState={setState} notify={notify} />}
        {tab === "handover" && (
          <Handover state={state} setState={setState} notify={notify} now={now} />
        )}
      </main>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

/* ---------------- 看板 ---------------- */

function Dashboard({ state, now, goTimeline }: { state: AppState; now: number; goTimeline: () => void }) {
  const shift = currentShift(state);
  const summary = shiftSummary(state, state.currentShiftId)!;
  const openSevere = openSevereOfCurrentShift(state);

  const latestByDevice = DEVICES.map((d) => {
    const list = state.readings.filter((r) => r.device === d.id);
    return { device: d, reading: list[list.length - 1] as (typeof list)[0] | undefined };
  });

  const deviceStatus = (id: DeviceId) => {
    const open = state.anomalies.filter((a) => a.device === id && a.status === "open");
    if (open.some((a) => a.level === "severe")) return "severe";
    if (open.length > 0) return "warn";
    return "ok";
  };

  return (
    <section>
      <div className="stat-grid">
        <div className="stat">
          <small>当前班次</small>
          <strong>{shift.label}</strong>
          <span>开始 {fmtTime(shift.startTs)} · 已值班 {fmtDuration(shift.startTs, now)}</span>
        </div>
        <div className="stat">
          <small>本班记录</small>
          <strong>{summary.readingCount}</strong>
          <span>条参数记录</span>
        </div>
        <div className={`stat ${openSevere.length > 0 ? "stat-severe" : ""}`}>
          <small>未处理严重异常</small>
          <strong>{openSevere.length}</strong>
          <span>{openSevere.length > 0 ? "交接已被拦截" : "无"}</span>
        </div>
        <div className={`stat ${summary.normalOpen.length > 0 ? "stat-warn" : ""}`}>
          <small>未处理普通异常</small>
          <strong>{summary.normalOpen.length}</strong>
          <span>交接时将自动结转</span>
        </div>
      </div>

      <h2 className="section-title">设备最新状态</h2>
      <div className="device-grid">
        {latestByDevice.map(({ device, reading }) => (
          <article key={device.id} className={`device-card ${deviceStatus(device.id)}`}>
            <header>
              <h3>{device.name}</h3>
              <span className={`dot ${deviceStatus(device.id)}`} />
            </header>
            {reading ? (
              <>
                <ul>
                  {device.params.map((p) => (
                    <li key={p.key}>
                      <span>{p.label}</span>
                      <b>
                        {reading.values[p.key]} {p.unit}
                      </b>
                    </li>
                  ))}
                </ul>
                <footer>
                  {fmtTime(reading.ts)} · {state.shifts.find((s) => s.id === reading.shiftId)?.label}
                </footer>
              </>
            ) : (
              <p className="empty">本船次暂无记录</p>
            )}
          </article>
        ))}
      </div>

      {openSevere.length > 0 && (
        <>
          <h2 className="section-title">待处理严重异常</h2>
          <div className="severe-list">
            {openSevere.map((a) => (
              <div key={a.id} className="severe-item">
                <span>
                  <b>{deviceById(a.device).name}</b> · {a.message}
                  <em>{fmtTime(a.ts)}</em>
                </span>
                <button className="primary" onClick={goTimeline}>
                  去处理
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------- 参数录入 ---------------- */

function Entry({
  state,
  setState,
  notify,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  notify: (t: string, k?: "ok" | "warn" | "err") => void;
}) {
  const [deviceId, setDeviceId] = useState<DeviceId>("main");
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const device = deviceById(deviceId);

  const submit = () => {
    const parsed: Record<string, number> = {};
    for (const p of device.params) {
      const raw = (values[p.key] ?? "").trim();
      const num = Number(raw);
      if (raw === "" || Number.isNaN(num)) {
        notify(`请填写有效的「${p.label}」数值`, "err");
        return;
      }
      parsed[p.key] = num;
    }
    const result = addReading(state, deviceId, parsed, note);
    setState(result.state);
    setValues({});
    setNote("");
    const severe = result.anomalies.filter((a) => a.level === "severe");
    const normal = result.anomalies.filter((a) => a.level === "normal");
    if (severe.length > 0) {
      notify(
        `已保存，触发 ${severe.length} 条严重异常：${severe.map((a) => a.rule).join("；")}。处理前交接将被拦截。`,
        "err"
      );
    } else if (normal.length > 0) {
      notify(`已保存，触发 ${normal.length} 条普通异常：${normal.map((a) => a.rule).join("；")}`, "warn");
    } else {
      notify(`${device.name} 参数已保存，未触发异常`);
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>参数录入 · {currentShift(state).label}</p>
          <h2>记录设备参数</h2>
        </div>
      </div>
      <div className="chips">
        {DEVICES.map((d) => (
          <button
            key={d.id}
            className={d.id === deviceId ? "chip active" : "chip"}
            onClick={() => {
              setDeviceId(d.id);
              setValues({});
            }}
          >
            {d.name}
          </button>
        ))}
      </div>
      <div className="field-grid">
        {device.params.map((p) => (
          <label key={p.key}>
            <span>
              {p.label}（{p.unit}）
            </span>
            <input
              type="number"
              step={p.step ?? 1}
              value={values[p.key] ?? ""}
              placeholder={`填写${p.label}`}
              onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
            />
          </label>
        ))}
        <label className="span2">
          <span>备注（可选）</span>
          <input value={note} placeholder="巡检说明、工况备注…" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="form-footer">
        <button className="primary" onClick={submit}>
          保存记录
        </button>
        <div className="rules">
          <b>严重异常判定：</b>
          {SEVERE_RULES_TEXT.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 历史查询 ---------------- */

function History({ state }: { state: AppState }) {
  const [filter, setFilter] = useState<DeviceId | "all">("all");
  const list = useMemo(
    () =>
      state.readings
        .filter((r) => filter === "all" || r.device === filter)
        .slice()
        .sort((a, b) => b.ts - a.ts),
    [state.readings, filter]
  );

  const anomaliesOf = (readingId: string) => state.anomalies.filter((a) => a.readingId === readingId);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>按设备查询</p>
          <h2>历史记录（{list.length} 条）</h2>
        </div>
      </div>
      <div className="chips">
        <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>
          全部设备
        </button>
        {DEVICES.map((d) => (
          <button
            key={d.id}
            className={filter === d.id ? "chip active" : "chip"}
            onClick={() => setFilter(d.id)}
          >
            {d.name}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="empty">暂无记录，请先在「参数录入」中填写。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>班次</th>
                <th>设备</th>
                <th>参数读数</th>
                <th>触发异常</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const dev = deviceById(r.device);
                const ans = anomaliesOf(r.id);
                return (
                  <tr key={r.id}>
                    <td>{fmtTime(r.ts)}</td>
                    <td>{state.shifts.find((s) => s.id === r.shiftId)?.label ?? r.shiftId}</td>
                    <td>{dev.name}</td>
                    <td>{fmtValues(dev, r.values)}</td>
                    <td>
                      {ans.length === 0
                        ? "—"
                        : ans.map((a) => (
                            <span key={a.id} className={`tag ${a.level}`}>
                              {a.rule}
                            </span>
                          ))}
                    </td>
                    <td>{r.note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------------- 异常时间线 ---------------- */

function Timeline({
  state,
  setState,
  notify,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  notify: (t: string, k?: "ok" | "warn" | "err") => void;
}) {
  const [levelFilter, setLevelFilter] = useState<"all" | "severe" | "normal">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "handled">("all");
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [handler, setHandler] = useState("");
  const [handleNote, setHandleNote] = useState("");

  const list = useMemo(
    () =>
      state.anomalies
        .filter((a) => levelFilter === "all" || a.level === levelFilter)
        .filter((a) => statusFilter === "all" || a.status === statusFilter)
        .slice()
        .sort((a, b) => b.ts - a.ts),
    [state.anomalies, levelFilter, statusFilter]
  );

  const confirmHandle = (a: Anomaly) => {
    if (!handler.trim()) {
      notify("请填写处理人", "err");
      return;
    }
    setState(handleAnomaly(state, a.id, handler, handleNote));
    setHandlingId(null);
    setHandler("");
    setHandleNote("");
    notify(
      a.level === "severe"
        ? `严重异常「${a.rule}」已处理，记录永久保留且级别不变`
        : `普通异常「${a.rule}」已处理`
    );
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>全部班次</p>
          <h2>异常时间线（{list.length} 条）</h2>
        </div>
        <div className="filters">
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}>
            <option value="all">全部级别</option>
            <option value="severe">仅严重</option>
            <option value="normal">仅普通</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">全部状态</option>
            <option value="open">未处理</option>
            <option value="handled">已处理</option>
          </select>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty">暂无符合条件的异常记录。</p>
      ) : (
        <div className="timeline">
          {list.map((a) => (
            <article key={a.id} className={`event ${a.level} ${a.status}`}>
              <div className="event-head">
                <span className={`tag ${a.level}`}>{a.level === "severe" ? "严重异常" : "普通异常"}</span>
                <b>{a.rule}</b>
                <span className="meta">
                  {deviceById(a.device).name} · {fmtTime(a.ts)} ·{" "}
                  {state.shifts.find((s) => s.id === a.shiftId)?.label ?? a.shiftId}
                </span>
                {a.carriedFrom && (
                  <span className="tag carried">
                    自{state.shifts.find((s) => s.id === a.carriedFrom)?.label ?? a.carriedFrom}结转
                  </span>
                )}
                <span className={`tag status-${a.status}`}>{a.status === "open" ? "未处理" : "已处理"}</span>
              </div>
              <p className="event-msg">{a.message}</p>
              {a.status === "handled" && (
                <p className="handled-info">
                  已由 {a.handledBy} 于 {a.handledAt ? fmtTime(a.handledAt) : ""} 处理
                  {a.handleNote ? `：${a.handleNote}` : ""}
                  {a.level === "severe" && <em>（严重异常永久保留，级别不变）</em>}
                </p>
              )}
              {a.status === "open" &&
                (handlingId === a.id ? (
                  <div className="handle-form">
                    <input
                      placeholder="处理人姓名"
                      value={handler}
                      onChange={(e) => setHandler(e.target.value)}
                    />
                    <input
                      placeholder="处理措施（可选）"
                      value={handleNote}
                      onChange={(e) => setHandleNote(e.target.value)}
                    />
                    <button className="primary" onClick={() => confirmHandle(a)}>
                      确认处理
                    </button>
                    <button onClick={() => setHandlingId(null)}>取消</button>
                  </div>
                ) : (
                  <button
                    className="primary"
                    onClick={() => {
                      setHandlingId(a.id);
                      setHandler("");
                      setHandleNote("");
                    }}
                  >
                    标记已处理
                  </button>
                ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- 交接班 ---------------- */

function Handover({
  state,
  setState,
  notify,
  now,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  notify: (t: string, k?: "ok" | "warn" | "err") => void;
  now: number;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");

  const summary = shiftSummary(state, state.currentShiftId)!;
  const blockers = openSevereOfCurrentShift(state);
  const blocked = blockers.length > 0;
  const pastShifts = state.shifts.filter((s) => s.closed).slice().reverse();

  const confirm = () => {
    if (!from.trim() || !to.trim()) {
      notify("请填写交班人和接班人", "err");
      return;
    }
    const result = doHandover(state, from, to, note);
    if (!result.ok) {
      notify(`交接被拦截：还有 ${result.blockers.length} 条未处理严重异常`, "err");
      return;
    }
    setState(result.state);
    setFrom("");
    setTo("");
    setNote("");
    notify(
      `交接完成，已进入下一班。${result.carried.length > 0 ? `${result.carried.length} 条未处理普通异常已结转。` : "无结转异常。"}`
    );
  };

  return (
    <section>
      <div className="panel">
        <div className="heading">
          <div>
            <p>交接摘要 · 与看板、时间线实时同步</p>
            <h2>
              {summary.shift.label}（当前班）摘要
            </h2>
          </div>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <small>值班时长</small>
            <strong>{fmtDuration(summary.shift.startTs, now)}</strong>
            <span>开始于 {fmtTime(summary.shift.startTs)}</span>
          </div>
          <div className="stat">
            <small>参数记录</small>
            <strong>{summary.readingCount}</strong>
            <span>
              {summary.byDevice.map((x) => `${x.device.name} ${x.count}`).join(" · ") || "暂无"}
            </span>
          </div>
          <div className={`stat ${summary.severeOpen.length > 0 ? "stat-severe" : ""}`}>
            <small>严重异常</small>
            <strong>
              {summary.severeHandled}/{summary.severeTotal}
            </strong>
            <span>已处理/总数（未处理将拦截交接）</span>
          </div>
          <div className={`stat ${summary.normalOpen.length > 0 ? "stat-warn" : ""}`}>
            <small>普通异常</small>
            <strong>
              {summary.normalHandled}/{summary.normalTotal}
            </strong>
            <span>已处理/总数（未处理 {summary.normalOpen.length} 条将结转）</span>
          </div>
        </div>

        {summary.carriedIn.length > 0 && (
          <p className="carry-info">
            本班承接上一班结转的普通异常 {summary.carriedIn.length} 条：
            {summary.carriedIn.map((a) => `${deviceById(a.device).name}「${a.rule}」`).join("、")}
          </p>
        )}

        {blocked ? (
          <div className="banner severe-banner">
            <b>交接被拦截：</b>以下 {blockers.length} 条严重异常未处理，处理完成后才能交接 —
            {blockers.map((a) => (
              <span key={a.id} className="blocker">
                {deviceById(a.device).name}「{a.rule}」（{fmtTime(a.ts)}）
              </span>
            ))}
          </div>
        ) : (
          <div className="banner ok-banner">✓ 当前班无未处理严重异常，可以交接。</div>
        )}

        {summary.normalOpen.length > 0 && (
          <div className="banner warn-banner">
            以下 {summary.normalOpen.length} 条普通异常未处理，交接后将自动结转到下一班：
            {summary.normalOpen.map((a) => (
              <span key={a.id} className="blocker">
                {deviceById(a.device).name}「{a.rule}」
              </span>
            ))}
          </div>
        )}

        <div className="handover-form">
          <label>
            <span>交班人</span>
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="交班轮机员" />
          </label>
          <label>
            <span>接班人</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="接班轮机员" />
          </label>
          <label className="span2">
            <span>交接备注</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="设备工况、待办事项…" />
          </label>
          <button className="primary big" disabled={blocked} onClick={confirm}>
            {blocked ? "有未处理严重异常，无法交接" : "确认交接，开始下一班"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="heading">
          <div>
            <p>历史班次</p>
            <h2>过往交接（{pastShifts.length}）</h2>
          </div>
        </div>
        {pastShifts.length === 0 ? (
          <p className="empty">尚无已完成的交接。</p>
        ) : (
          <div className="shift-list">
            {pastShifts.map((sh) => {
              const sm = shiftSummary(state, sh.id)!;
              return (
                <article key={sh.id} className="shift-card">
                  <header>
                    <b>{sh.label}</b>
                    <span>
                      {fmtTime(sh.startTs)} ~ {sh.endTs ? fmtTime(sh.endTs) : ""} ·{" "}
                      {sh.endTs ? fmtDuration(sh.startTs, sh.endTs) : ""}
                    </span>
                  </header>
                  <p>
                    记录 {sm.readingCount} 条 · 严重异常 {sm.severeTotal} 条（全部已处理）· 普通异常{" "}
                    {sm.normalTotal} 条（处理 {sm.normalHandled} 条
                    {sm.carriedOut.length > 0 ? `，结转下一班 ${sm.carriedOut.length} 条` : ""}）
                  </p>
                  <p>
                    交班 {sh.handoverBy} → 接班 {sh.takeoverBy}
                    {sh.note ? ` · 备注：${sh.note}` : ""}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default App;
