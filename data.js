// Empire Records — story manifest + borough definitions
// SVG-space points [x, y] in a 0..1000 viewBox are converted to lat/lng in map.jsx.
// NYC bounding box: W -74.257, E -73.700, N 40.916, S 40.495

window.BOROUGHS = {
  manhattan:    { id: "manhattan",    name: "Manhattan",     center: [-74.006, 40.728], zoom: 12.5 },
  bronx:        { id: "bronx",        name: "The Bronx",     center: [-73.880, 40.840], zoom: 12.0 },
  queens:       { id: "queens",       name: "Queens",        center: [-73.830, 40.728], zoom: 11.5 },
  brooklyn:     { id: "brooklyn",     name: "Brooklyn",      center: [-73.944, 40.650], zoom: 12.0 },
  statenisland: { id: "statenisland", name: "Staten Island", center: [-74.155, 40.580], zoom: 12.0 },
  citywide:     { id: "citywide",     name: "Citywide",      center: [-73.980, 40.720], zoom: 10.2 },
};

// Borough name as it appears in the NYC Open Data GeoJSON (boro_name property)
window.BOROUGH_GEOJSON_NAME = {
  manhattan:    "Manhattan",
  bronx:        "Bronx",
  queens:       "Queens",
  brooklyn:     "Brooklyn",
  statenisland: "Staten Island",
  citywide:     null,
};

// Stories are ordered as they'll appear in the scroll list.
// points: [svgX, svgY] in a 1000x1000 viewBox matching NYC geography.
window.STORIES = [
  {
    id: "bec",
    pinned: true,
    kicker: "Now Live",
    title: "BEC — The Bacon, Egg & Cheese Engine",
    tagline: "A pocket oracle for the city's only acceptable breakfast. Finds the nearest BEC, bagel, or slice — ranked by how many minutes away it is.",
    date: "2026",
    tag: "App",
    borough: "citywide",
    points: [
      [485, 410], [520, 470], [610, 690], [690, 360], [275, 790], [555, 150]
    ],
    neighborhood: "Five Boroughs",
    link: "/baconeggcheese/",
    linkLabel: "Get the app →"
  },
  {
    id: "about",
    kicker: "Dispatch",
    title: "About Me",
    tagline: "I build small, specific things for New York — apps, data, and the occasional bit. This is where they live.",
    date: "2026",
    tag: "About",
    borough: "citywide",
    points: [[485, 410], [555, 150], [690, 360]],
    neighborhood: "New York, NY"
  },
  {
    id: "whatsnext",
    kicker: "In Progress",
    title: "What's Next",
    tagline: "Empire Records is the hub for everything I'm shipping next — more apps, more maps, more New York-shaped experiments. Stay tuned.",
    date: "2026",
    tag: "About",
    borough: "citywide",
    points: [[275, 790], [610, 690]],
    neighborhood: "Five Boroughs"
  },
];

window.TAGS = ["Data", "Silly", "Story", "Game", "Archive", "App", "About"];
