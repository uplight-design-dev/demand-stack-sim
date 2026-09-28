import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatHourLabel, formatMw } from "../lib/format";
import type { HourlyStackResult } from "@shared/types/demandStack";

export function BaselineChart({
  hourly,
  showResulting
}: {
  hourly: HourlyStackResult[];
  showResulting: boolean;
}) {
  const data = hourly.map((h) => ({
    hour: h.hour,
    hourLabel: formatHourLabel(h.hour),
    baseline: h.baselineMw,
    resulting: h.resultingLoadMw
  }));

  const peak = hourly.reduce((best, h) => (h.baselineMw > best.baselineMw ? h : best), hourly[0]);

  return (
    <div role="img" aria-label="Hourly load curve chart comparing baseline demand to the resulting demand stack load">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3e6ec" />
          <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} interval={2} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            label={{ value: "MW", angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatMw(value), name === "baseline" ? "Baseline" : "Resulting load"]}
            labelFormatter={(label) => `Hour: ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline"
            stroke="#14213d"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {showResulting && (
            <Line
              type="monotone"
              dataKey="resulting"
              name="Resulting load"
              stroke="#1f5eff"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <ReferenceDot x={peak.hour} y={peak.baselineMw} r={5} fill="#e0a422" stroke="none" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
