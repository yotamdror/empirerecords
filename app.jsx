/* global React, ReactDOM, MapboxMap, Rat */

// Safari throws a SecurityError on localStorage access when "Block All
// Cookies" or Lockdown Mode is on; an uncaught throw here during the
// initial render (with no error boundary) would blank the whole app.
function readPanelPref() {
  try {
    return localStorage.getItem('er-panel') !== '0';
  } catch (_) {
    return true;
  }
}
function writePanelPref(value) {
  try {
    localStorage.setItem('er-panel', value ? '1' : '0');
  } catch (_) {}
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error('Empire Records crashed:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          Something went wrong loading Empire Records. Try reloading the page.
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [hovered, setHovered] = React.useState(null);
  const [pinned,  setPinned]  = React.useState(null);
  const [panelOpen, setPanelOpen] = React.useState(readPanelPref);

  const display = hovered || pinned;

  const togglePanel = () => {
    setPanelOpen(v => {
      const next = !v;
      writePanelPref(next);
      return next;
    });
  };

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          <h1>Empire Records</h1>
          <div className="sub">Apps, data &amp; New York-shaped experiments.</div>
        </div>
        <nav className="nav">
          <a href="/baconeggcheese/">BEC App</a>
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
                {s.link && (
                  <a
                    className="story-link"
                    href={s.link}
                    onClick={e => e.stopPropagation()}
                    target={s.link.startsWith('http') ? '_blank' : undefined}
                    rel={s.link.startsWith('http') ? 'noopener noreferrer' : undefined}
                  >
                    {s.linkLabel || 'Learn more →'}
                  </a>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <Rat/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App/></ErrorBoundary>
);
