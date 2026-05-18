"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartDataPoint {
  label: string;
  value?: number;
  balance?: number;
  change?: number;
}

interface ChartCardProps {
  title: string;
  type: "area" | "bar";
  color: string;
  data: ChartDataPoint[];
  dataKey?: string;
  domain?: [number, number];
  chartKey?: number;
  baseValue?: number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isBalance = d && "balance" in d && d.balance !== undefined;
  const val = isBalance ? d.balance : d.value;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-0.5 font-semibold text-zinc-100">{label}</p>
      <p className="text-zinc-300">
        {isBalance ? "Balance" : "Amount"}:{" "}
        <span className="font-medium text-white">RM {Number(val).toFixed(2)}</span>
      </p>
      {isBalance && d.change !== undefined && (
        <p
          className={`mt-0.5 ${
            d.change >= 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          {d.change >= 0
            ? `Added: +RM ${d.change.toFixed(2)}`
            : `Reduced: -RM ${Math.abs(d.change).toFixed(2)}`}
        </p>
      )}
    </div>
  );
}

export default function ChartCard({ title, type, color, data, dataKey = "value", domain, chartKey, baseValue }: ChartCardProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-[#1f2c33]">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {title}
        </h3>
        <div className="flex h-52 items-center justify-center">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            No data yet
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-[#1f2c33]">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <div className="h-52 min-w-0">
        {ready ? (
          <ResponsiveContainer width="100%" height="100%">
            {type === "area" ? (
              <AreaChart data={data} key={chartKey}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.3} />
                <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#a1a1aa" fontSize={11} domain={domain} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  fill={color}
                  fillOpacity={0.5}
                  baseValue={baseValue}
                  dot={{ r: 3, fill: color }}
                />
              </AreaChart>
            ) : type === "bar" ? (
              <BarChart data={data} key={chartKey}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.3} />
                <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#a1a1aa" fontSize={11} domain={domain} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : null}
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
          </div>
        )}
      </div>
    </div>
  );
}
