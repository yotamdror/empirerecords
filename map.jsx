/* global React, mapboxgl */

// Convert SVG viewBox coordinates [0..1000] to geographic lat/lng.
// NYC bounds: W -74.257, E -73.700, N 40.916, S 40.495
const svgToLng = x => -74.257 + (x / 1000) * 0.557;
const svgToLat = y => 40.916 - (y / 1000) * 0.421;

const NYC_BOROUGHS_URL =
  'https://data.cityofnewyork.us/api/geospatial/7t3b-ywvw?method=export&type=GeoJSON';

function applyStory(map, activeStory) {
  if (!activeStory) {
    map.flyTo({ center: [-73.980, 40.720], zoom: 10.2, duration: 900 });
    map.setFilter('borough-active', ['==', ['get', 'boro_name'], '']);
    map.getSource('story-points').setData({ type: 'FeatureCollection', features: [] });
    map.setPaintProperty('story-dots', 'circle-opacity', 0);
    map.setPaintProperty('story-rings', 'circle-opacity', 0);
    return;
  }

  const borough = window.BOROUGHS[activeStory.borough];
  const geoName = window.BOROUGH_GEOJSON_NAME[activeStory.borough];

  map.setFilter('borough-active',
    geoName
      ? ['==', ['get', 'boro_name'], geoName]
      : ['==', ['get', 'boro_name'], '']
  );

  map.flyTo({
    center: borough.center,
    zoom: borough.zoom,
    duration: 900,
    // offset left so the active borough doesn't hide under the right panel
    offset: [-100, 0],
  });

  const features = activeStory.points.map(([x, y]) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [svgToLng(x), svgToLat(y)] },
    properties: {},
  }));
  map.getSource('story-points').setData({ type: 'FeatureCollection', features });
  map.setPaintProperty('story-dots', 'circle-opacity', 1);
  map.setPaintProperty('story-rings', 'circle-opacity', 0.45);
}

function MapboxMap({ activeStory }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const [loaded, setLoaded] = React.useState(false);
  const pendingStory = React.useRef(activeStory);
  pendingStory.current = activeStory;

  React.useEffect(() => {
    if (!window.MAPBOX_TOKEN || window.MAPBOX_TOKEN === 'pk.YOUR_TOKEN_HERE') {
      console.warn('Empire Records: add your Mapbox token to config.js');
    }

    mapboxgl.accessToken = window.MAPBOX_TOKEN || '';

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      bounds: [[-74.27, 40.49], [-73.68, 40.92]],
      fitBoundsOptions: {
        padding: { top: 40, bottom: 40, left: 40, right: 440 }
      },
      minZoom: 9,
      maxZoom: 16,
      attributionControl: false,
    });

    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.on('load', () => {
      // Soften land to cream
      try { map.setPaintProperty('land', 'background-color', '#f4efe2'); } catch (_) {}
      try { map.setPaintProperty('background', 'background-color', '#f4efe2'); } catch (_) {}

      // Borough fill layer (cream overlay, covers Mapbox base land color)
      map.addSource('nyc-boroughs', {
        type: 'geojson',
        data: NYC_BOROUGHS_URL,
      });

      map.addLayer({
        id: 'borough-fill',
        type: 'fill',
        source: 'nyc-boroughs',
        paint: { 'fill-color': '#ede7d4', 'fill-opacity': 0.82 },
      });

      // Active borough highlight (indigo)
      map.addLayer({
        id: 'borough-active',
        type: 'fill',
        source: 'nyc-boroughs',
        paint: { 'fill-color': '#5b4af0', 'fill-opacity': 0.88 },
        filter: ['==', ['get', 'boro_name'], ''],
      });

      // Borough outline
      map.addLayer({
        id: 'borough-outline',
        type: 'line',
        source: 'nyc-boroughs',
        paint: { 'line-color': '#0f1a3a', 'line-width': 1.2 },
      });

      // Story point rings (outer glow)
      map.addSource('story-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'story-rings',
        type: 'circle',
        source: 'story-points',
        paint: {
          'circle-radius': 12,
          'circle-color': 'transparent',
          'circle-stroke-color': '#5b4af0',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0,
          'circle-opacity-transition': { duration: 400, delay: 0 },
        },
      });

      // Story point dots (inner fill)
      map.addLayer({
        id: 'story-dots',
        type: 'circle',
        source: 'story-points',
        paint: {
          'circle-radius': 5,
          'circle-color': '#5b4af0',
          'circle-opacity': 0,
          'circle-opacity-transition': { duration: 400, delay: 0 },
        },
      });

      setLoaded(true);
      // Apply any story that became active before the map finished loading
      if (pendingStory.current) {
        applyStory(map, pendingStory.current);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  React.useEffect(() => {
    if (!loaded || !mapRef.current) return;
    applyStory(mapRef.current, activeStory);
  }, [activeStory, loaded]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

window.MapboxMap = MapboxMap;
