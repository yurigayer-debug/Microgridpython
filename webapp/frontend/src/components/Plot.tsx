import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import type { Colors } from "../theme";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Trace = Record<string, any>;
export type Layout = Record<string, any>;

const CONFIG = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d"] };

export function Plot({ data, layout, className = "chart" }: { data: Trace[]; layout: Layout; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) Plotly.react(ref.current, data, layout, CONFIG);
  }, [data, layout]);
  useEffect(() => {
    const el = ref.current;
    return () => { if (el) Plotly.purge(el); };
  }, []);
  return <div ref={ref} className={className} />;
}

/** Layout base: eixos e grade recessivos, um único eixo Y, legenda horizontal abaixo. */
export function baseLayout(c: Colors, extra: Layout = {}): Layout {
  const axis = { gridcolor: c.grid, linecolor: c.grid, zeroline: false, tickfont: { color: c.text2 } };
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, sans-serif", size: 12, color: c.text2 },
    margin: { l: 60, r: 14, t: 10, b: 44 },
    legend: { orientation: "h", y: -0.2, font: { color: c.text2 } },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.grid, font: { color: c.text } },
    separators: ",.",
    ...extra,
    xaxis: { ...axis, ...(extra.xaxis || {}) },
    yaxis: { ...axis, ...(extra.yaxis || {}) },
  };
}
