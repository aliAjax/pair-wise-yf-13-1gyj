import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import Entry from "./components/Entry";
import Handover from "./components/Handover";
import History from "./components/History";
import Timeline from "./components/Timeline";
import { fmtClock, fmtDT, fmtDur } from "./format";
import { currentShift, resetAll, shiftIndex, useStore } from "./store";
import { HandleModal } from "./HandleModal";
import { Toaster, toast } from "./toast";

const VIEWS = [
  ["dashboard", "值班看板"],
  ["entry", "参数录入"],
  ["history", "历史查询"],
  ["timeline", "异常时间线"],
  ["handover", "交接摘要"],
] as const;

type ViewName = (typeof VIEWS)[number][0];

function Header({ view, go }: { view: ViewName; go: (v: ViewName) => void }) {
  useStore((s) => s);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sh = currentShift();
  const severe = useStore((s) => s.anomalies.filter((a) => a.shiftId === sh.id && a.level === "severe" && !a.handled).length);

  const onReset = () => {
    if (window.confirm("将清空全部本地数据并重新生成演示数据，确定？")) {
      resetAll();
      toast("数据已重置为演示数据");
    }
  };

  return (
    <>
      <header>
        <h1>
          <span className="anchor">⚓</span> 船舶轮机值班台
        </h1>
        <div className="shift-hd">
          <span>
            当前班：<b>第 {shiftIndex(sh)} 班</b>
          </span>
          <span>
            值班轮机员：<b>{sh.leader || "—"}</b>
          </span>
          <span>
            起：<b>{fmtDT(sh.start)}</b>
          </span>
          <span>
            已历时：<b>{fmtDur(now - sh.start)}</b>
          </span>
          {severe > 0 ? (
            <span className="badge severe">未处理严重异常 {severe}</span>
          ) : (
            <span className="badge handled">无未处理严重异常</span>
          )}
        </div>
        <div className="clock">{fmtClock(now)}</div>
        <button className="btn sm" onClick={onReset} title="清空并重新生成演示数据">
          重置数据
        </button>
      </header>
      <nav>
        {VIEWS.map(([k, label]) => (
          <button key={k} className={view === k ? "active" : ""} onClick={() => go(k)}>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

export default function App() {
  const [view, setView] = useState<ViewName>("dashboard");
  const go = (v: string) => setView(v as ViewName);

  return (
    <>
      <Header view={view} go={setView} />
      <main>
        {view === "dashboard" && <Dashboard go={go} />}
        {view === "entry" && <Entry />}
        {view === "history" && <History />}
        {view === "timeline" && <Timeline />}
        {view === "handover" && <Handover go={go} />}
      </main>
      <HandleModal />
      <Toaster />
    </>
  );
}
