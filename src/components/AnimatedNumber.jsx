import React, { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { money } from '../lib/format.js';
export function AnimatedNumber({ value, currency = false }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { setShown(value); previous.current = value; return; }
    const controls = animate(previous.current, value, { duration: .48, ease: 'easeOut', onUpdate: latest => setShown(Math.round(latest)) });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <><span aria-hidden="true">{currency ? money(shown) : shown.toLocaleString('en-US')}</span><span className="sr-only">{currency ? money(value) : value.toLocaleString('en-US')}</span></>;
}
