import type { DeviceType, DeviceTypeDef } from "./types";

export const CFG: Record<DeviceType, DeviceTypeDef> = {
  main: {
    label: "主机",
    devices: ["1号主机"],
    fields: [
      { k: "rpm", label: "转速", unit: "r/min", step: 1, normal: 1200 },
      { k: "oil", label: "滑油压力", unit: "MPa", step: 0.01, normal: 0.28 },
      { k: "temp", label: "冷却水温", unit: "℃", step: 0.1, normal: 82 },
      { k: "fuel", label: "燃油流量", unit: "L/h", step: 0.1, normal: 86 },
      { k: "exhaust", label: "排气温度", unit: "℃", step: 1, normal: 425 },
    ],
  },
  gen: {
    label: "发电机",
    devices: ["1号发电机", "2号发电机", "3号发电机"],
    fields: [
      { k: "power", label: "功率", unit: "kW", step: 1, normal: 320 },
      { k: "voltage", label: "电压", unit: "V", step: 1, normal: 400 },
      { k: "frequency", label: "频率", unit: "Hz", step: 0.1, normal: 50 },
      { k: "temp", label: "冷却水温", unit: "℃", step: 0.1, normal: 75 },
      { k: "oil", label: "滑油压力", unit: "MPa", step: 0.01, normal: 0.35 },
    ],
  },
  pump: {
    label: "泵组",
    devices: ["主滑油泵", "主机海水泵", "燃油供给泵"],
    fields: [
      {
        k: "status",
        label: "运行状态",
        type: "select",
        options: [
          ["run", "运行"],
          ["stop", "停转"],
        ],
        normal: "run",
      },
      { k: "pressure", label: "出口压力", unit: "MPa", step: 0.01, normal: 0.32 },
      { k: "flow", label: "流量", unit: "m³/h", step: 0.1, normal: 22 },
      { k: "current", label: "电流", unit: "A", step: 0.1, normal: 18 },
    ],
  },
};

export const TYPE_LABEL: Record<DeviceType, string> = {
  main: "主机",
  gen: "发电机",
  pump: "泵组",
};
