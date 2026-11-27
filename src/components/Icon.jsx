import React from 'react';
const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3',
  search: 'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  chart: 'M5 18v-6m7 6V6m7 12V9',
  check: 'm5 12 4 4L19 6',
  spark: 'm12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3',
  repeat: 'M17 3l4 4-4 4M3 11V7h18M7 21l-4-4 4-4m14 0v4H3',
};
export function Icon({ name, size = 20 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.chart}/></svg>;
}
