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
    kicker: "Field Companion",
    title: "BEC — The Bacon, Egg & Cheese Engine",
    tagline: "A pocket oracle for the city's only acceptable breakfast.",
    date: "Beta · 2026",
    tag: "App",
    borough: "citywide",
    points: [
      [485, 410], [520, 470], [610, 690], [690, 360], [275, 790], [555, 150]
    ],
    neighborhood: "Five Boroughs"
  },
  {
    id: "cuisines",
    kicker: "Vol. 12",
    title: "Cuisines of the Last Mile",
    tagline: "A heatmap of the city's most obscure kitchens, plotted by walking distance from the nearest Sweetgreen.",
    date: "Apr 2026",
    tag: "Data",
    borough: "queens",
    points: [[710, 320], [760, 360], [690, 410], [635, 380], [780, 290]],
    neighborhood: "Flushing → Jackson Heights"
  },
  {
    id: "heads",
    kicker: "Vol. 11",
    title: "Heads of State",
    tagline: "Every world leader's facial hair, ranked by tonsorial confidence. Updated whenever a junta has a barber.",
    date: "Mar 2026",
    tag: "Silly",
    borough: "manhattan",
    points: [[505, 380]],
    neighborhood: "United Nations, Turtle Bay"
  },
  {
    id: "slice",
    kicker: "Vol. 10",
    title: "The Slice Index",
    tagline: "A century of dollar slices, adjusted for everything but dignity.",
    date: "Feb 2026",
    tag: "Data",
    borough: "manhattan",
    points: [[480, 470], [495, 510], [475, 560], [500, 600]],
    neighborhood: "Spring → Christopher"
  },
  {
    id: "lullabies",
    kicker: "Vol. 9",
    title: "311 Lullabies",
    tagline: "Loud party complaints, charted by the hour. The city's true circadian rhythm.",
    date: "Jan 2026",
    tag: "Data",
    borough: "brooklyn",
    points: [[580, 600], [615, 640], [640, 690], [690, 700]],
    neighborhood: "Williamsburg → Bushwick"
  },
  {
    id: "ratsrent",
    kicker: "Vol. 8",
    title: "Rat Sightings vs. Rent",
    tagline: "A perfect correlation, presented without comment.",
    date: "Dec 2025",
    tag: "Data",
    borough: "citywide",
    points: [[485, 410], [495, 510], [620, 640], [710, 380], [555, 150]],
    neighborhood: "Every block, basically"
  },
  {
    id: "haiku",
    kicker: "Vol. 7",
    title: "Subway Haiku, Live",
    tagline: "Auto-generated 5-7-5 couplets from the MTA's service alert feed.",
    date: "Nov 2025",
    tag: "Game",
    borough: "manhattan",
    points: [[480, 360], [490, 470], [500, 560]],
    neighborhood: "The 4/5/6 spine"
  },
  {
    id: "disappeared",
    kicker: "Vol. 6",
    title: "Disappeared, 2025",
    tagline: "The bars, bodegas and Blockbusters that closed this year. Light a candle, or don't.",
    date: "Oct 2025",
    tag: "Archive",
    borough: "citywide",
    points: [[465, 540], [600, 670], [720, 380], [275, 790], [575, 150]],
    neighborhood: "Citywide obituary"
  },
  {
    id: "vacancies",
    kicker: "Vol. 5",
    title: "Vacant Lots, Future Towers",
    tagline: "Empty parcels in the Bronx, scored by their probability of becoming a Related Companies amenity.",
    date: "Sep 2025",
    tag: "Data",
    borough: "bronx",
    points: [[490, 140], [560, 120], [620, 140], [580, 175]],
    neighborhood: "South Bronx → Fordham"
  },
  {
    id: "bagels",
    kicker: "Vol. 4",
    title: "The Mayor's Bagel Order",
    tagline: "Cross-referenced against approval rating. Toasted means trouble.",
    date: "Aug 2025",
    tag: "Silly",
    borough: "manhattan",
    points: [[485, 620]],
    neighborhood: "City Hall"
  },
  {
    id: "ferry",
    kicker: "Vol. 3",
    title: "Ferry Tales",
    tagline: "Why the Staten Island Ferry is the last functioning piece of civic infrastructure, and what it sees.",
    date: "Jul 2025",
    tag: "Story",
    borough: "statenisland",
    points: [[330, 750], [400, 700], [460, 660]],
    neighborhood: "St. George → Whitehall"
  },
  {
    id: "bodega",
    kicker: "Vol. 2",
    title: "Bodega Cat Census",
    tagline: "Submitted by readers. Tipped well by no one.",
    date: "Jun 2025",
    tag: "Silly",
    borough: "brooklyn",
    points: [[560, 580], [610, 660], [680, 720], [510, 700]],
    neighborhood: "Brooklyn at large"
  },
];

window.TAGS = ["Data", "Silly", "Story", "Game", "Archive", "App"];
