/* global React */

function Rat() {
  const [run, setRun] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    function schedule() {
      if (cancelled) return;
      const delay = 18000 + Math.random() * 28000; // 18–46s
      window.__ratTimer = setTimeout(() => {
        setRun(r => r + 1);
        schedule();
      }, delay);
    }
    window.__ratTimer = setTimeout(() => {
      setRun(r => r + 1);
      schedule();
    }, 5000);
    return () => { cancelled = true; clearTimeout(window.__ratTimer); };
  }, []);

  return (
    <div className={`rat ${run > 0 ? 'run' : ''}`} key={run}>
      <svg width="64" height="22" viewBox="0 0 120 40" fill="none">
        <ellipse cx="55" cy="22" rx="34" ry="9" fill="var(--ink)" opacity="0.55"/>
        <ellipse cx="88" cy="20" rx="13" ry="8" fill="var(--ink)" opacity="0.55"/>
        <circle cx="84" cy="13" r="3.5" fill="var(--ink)" opacity="0.55"/>
        <circle cx="93" cy="19" r="1.1" fill="var(--bg)"/>
        <circle cx="101" cy="22" r="1.4" fill="var(--accent-2)"/>
        <line x1="100" y1="22" x2="112" y2="20" stroke="var(--ink)" strokeWidth="0.6" opacity="0.5"/>
        <line x1="100" y1="23" x2="112" y2="25" stroke="var(--ink)" strokeWidth="0.6" opacity="0.5"/>
        <path d="M 22 22 C 8 22 4 14 0 8" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.55"/>
        <g className="legs">
          <line x1="38" y1="30" x2="34" y2="36" stroke="var(--ink)" strokeWidth="1.5" opacity="0.55"/>
          <line x1="52" y1="30" x2="56" y2="36" stroke="var(--ink)" strokeWidth="1.5" opacity="0.55"/>
          <line x1="68" y1="30" x2="64" y2="36" stroke="var(--ink)" strokeWidth="1.5" opacity="0.55"/>
          <line x1="78" y1="30" x2="82" y2="36" stroke="var(--ink)" strokeWidth="1.5" opacity="0.55"/>
        </g>
      </svg>
    </div>
  );
}

window.Rat = Rat;
