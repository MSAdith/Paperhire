import React, { useEffect, useRef, useState } from "react";

// Small, dependency-free charts for the admin dashboard.
// - One series per chart (visitors and sign-ups have different scales, so they
//   get separate charts rather than a dual axis); the title names the series.
// - 2px lines, recessive grid, hover crosshair + tooltip, and a visually hidden
//   data table so the numbers are available without the chart.

function useWidth(ref, fallback = 280) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function niceMax(max) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * pow >= max / 4) * pow;
  return Math.ceil(max / step) * step;
}

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export function LineChart({ data, valueKey, color, label, height = 200 }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [hover, setHover] = useState(null);

  const pad = { top: 12, right: 12, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d[valueKey])));
  const x = (i) => pad.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const points = data.map((d, i) => `${x(i)},${y(d[valueKey])}`).join(" ");
  const ticks = [0, max / 2, max];
  const xLabels = data.length ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.left) / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const total = data.reduce((n, d) => n + d[valueKey], 0);

  return (
    <div className="chart" ref={wrapRef}>
      <svg width={width} height={height} role="img" aria-label={`${label}: ${total} in total over ${data.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text key={i} x={x(i)} y={height - 8} className="chart-axis" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
            {shortDate(data[i].date)}
          </text>
        ))}
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && data[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="chart-crosshair" />
            <circle cx={x(hover)} cy={y(data[hover][valueKey])} r="5" fill={color} stroke="var(--white)" strokeWidth="2" />
          </g>
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(x(hover) - 60, 0), width - 128), top: Math.max(y(data[hover][valueKey]) - 56, 0) }}
          role="status"
        >
          <strong>{data[hover][valueKey]}</strong> {label.toLowerCase()}
          <span>{shortDate(data[hover].date)}</span>
        </div>
      )}
      <table className="visually-hidden">
        <caption>{label} per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>{label}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d[valueKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Horizontal bars with direct value labels: easy to read with long category names.
// stacked: label and value on one line, the bar underneath (for narrow cards).
// max: a fixed scale (e.g. 100 for percentages); otherwise bars scale to the largest value.
export function BarList({ items, label, stacked = false, emptyText = "No data yet.", format = (v) => v, max: fixedMax }) {
  const max = fixedMax || Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0 || (!fixedMax && items.every((i) => i.count === 0))) {
    return <p className="small grey">{emptyText}</p>;
  }
  return (
    <ul className={`bar-list ${stacked ? "bar-list-stacked" : ""}`} aria-label={label}>
      {items.map((item) => (
        <li key={item.label} className="bar-row" title={`${item.label}: ${format(item.count)}`}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="bar-value">{format(item.count)}</span>
        </li>
      ))}
    </ul>
  );
}
