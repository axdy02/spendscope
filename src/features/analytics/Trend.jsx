import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { money, monthName } from '../../lib/format.js';
export function Trend({ data }) {
  const reduced = useReducedMotion();
  if (!data.length) return <div className="chart-empty">Your monthly picture starts with your first CSV.<span>Import transactions to see how spending changes over time.</span></div>;
  const width = 650, height = 200, left = 55, top = 20, plotWidth = 575, plotHeight = 140;
  const maximum = Math.max(...data.map(row => row.amount_cents), 100);
  const point = (row, index) => [left + (data.length === 1 ? plotWidth / 2 : index / (data.length - 1) * plotWidth), top + plotHeight - row.amount_cents / maximum * plotHeight];
  const points = data.map(point);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const shownTicks = data.length <= 6 ? data : data.filter((_, index) => index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 5) === 0);
  return <>
    <svg className="trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Monthly spending in USD across ${data.length} months. Exact values are available in the table below.`}>
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - 15} y1={top + plotHeight * fraction} y2={top + plotHeight * fraction} stroke="#dcded6" strokeDasharray="3 6"/><text x={left - 10} y={top + plotHeight * fraction + 4} textAnchor="end" className="chart-label">${Math.round(maximum * (1 - fraction) / 100).toLocaleString('en-US')}</text></g>)}
      {points.length > 1 && <path d={`${path} L ${points.at(-1)[0]} ${top + plotHeight} L ${points[0][0]} ${top + plotHeight} Z`} fill="#174e48" opacity=".07"/>}
      <motion.path d={path} fill="none" stroke="#174e48" strokeWidth="3" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : .65 }}/>
      {points.map(([x, y], index) => <g key={data[index].month}><circle cx={x} cy={y} r="5" fill="#174e48" stroke="#fffdf8" strokeWidth="2"/><title>{monthName(data[index].month)}: {money(data[index].amount_cents)}</title></g>)}
      {shownTicks.map(row => <text key={row.month} x={point(row, data.indexOf(row))[0]} y={190} textAnchor="middle" className="chart-label">{monthName(row.month)}</text>)}
    </svg>
    <details className="chart-data"><summary>View monthly data</summary><table><caption className="sr-only">Monthly spending in USD</caption><thead><tr><th>Month</th><th>Total</th></tr></thead><tbody>{data.map(row => <tr key={row.month}><td>{monthName(row.month)}</td><td>{money(row.amount_cents)}</td></tr>)}</tbody></table></details>
  </>;
}
