/* global React, ReactDOM, MapboxMap, Rat */

function App() {
  const [hovered, setHovered] = React.useState(null);
  const [pinned,  setPinned]  = React.useState(null);
  const [panelOpen, setPanelOpen] = React.useState(
    () => localStorage.getItem('er-panel') !== '0'
  );

  const display = hovered || pinned;

  const togglePanel = () => {
    setPanelOpen(v => {
      const next = !v;
      localStorage.setItem('er-panel', next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          <h1>Empire Records</h1>
          <div className="sub">Musings, data &amp; minor delusions from New York.</div>
        </div>
        <nav className="nav">
          <a className="active">Index</a>
          <a>Archive</a>
          <a>BEC App</a>
          <a>About</a>
        </nav>
      </header>

      <div className="main">
        <section className="map-pane">
          <div className="map-stage">
            <MapboxMap activeStory={display} />
          </div>
          <div className="map-caption">
            <span className="dot"/>
            {display ? (
              <>
                <strong>{display.title}</strong>
                <span>· {display.neighborhood}</span>
              </>
            ) : (
              <span>Hover an entry to locate it.</span>
            )}
          </div>
        </section>

        <aside className={`list-pane ${panelOpen ? '' : 'collapsed'}`}>
          <button
            className="list-toggle"
            onClick={togglePanel}
            title={panelOpen ? 'Hide index' : 'Show index'}>
            {panelOpen ? '›' : '‹'}
          </button>

          <div className="list-head">
            <div className="title">
              The Index
              <span className="count">{window.STORIES.length} entries</span>
            </div>
          </div>

          <div className="scroll">
            {window.STORIES.map(s => (
              <div
                key={s.id}
                className={`story ${pinned?.id === s.id ? 'active' : ''} ${s.pinned ? 'pinned' : ''}`}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPinned(p => p?.id === s.id ? null : s)}>
                <div className="kicker">
                  <span className="tag">{s.tag}</span>
                  <span className="sep"/>
                  <span>{s.neighborhood}</span>
                  <span className="sep"/>
                  <span>{s.date}</span>
                </div>
                <h3>{s.title}</h3>
                <p className="tagline">{s.tagline}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <Rat/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
