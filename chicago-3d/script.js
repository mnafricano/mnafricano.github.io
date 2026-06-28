const presets = {
    downtown: {
        label: 'Downtown core',
        center: [-87.6247, 41.8819],
        zoom: 15.65,
        pitch: 67,
        bearing: -24
    },
    lakefront: {
        label: 'Lakefront',
        center: [-87.6092, 41.8923],
        zoom: 14.7,
        pitch: 64,
        bearing: 18
    },
    ohare: {
        label: "O'Hare",
        center: [-87.9073, 41.9742],
        zoom: 13.9,
        pitch: 57,
        bearing: -38
    },
    hydepark: {
        label: 'Hyde Park',
        center: [-87.5987, 41.7943],
        zoom: 14.7,
        pitch: 62,
        bearing: -18
    },
    evanston: {
        label: 'Evanston',
        center: [-87.6877, 42.0451],
        zoom: 14.55,
        pitch: 60,
        bearing: 26
    },
    naperville: {
        label: 'Naperville',
        center: [-88.1473, 41.7508],
        zoom: 14.45,
        pitch: 58,
        bearing: -34
    },
    metro: {
        label: 'Chicago metro',
        center: [-87.906, 41.885],
        zoom: 9.45,
        pitch: 42,
        bearing: -12
    }
};

const landmarks = [
    { name: 'Willis Tower', coordinates: [-87.6359, 41.8789] },
    { name: 'John Hancock Center', coordinates: [-87.6237, 41.8988] },
    { name: 'Wrigley Field', coordinates: [-87.6553, 41.9484] },
    { name: 'United Center', coordinates: [-87.6742, 41.8807] },
    { name: 'Museum Campus', coordinates: [-87.6167, 41.8663] },
    { name: "O'Hare International Airport", coordinates: [-87.9073, 41.9742] },
    { name: 'University of Chicago', coordinates: [-87.5987, 41.7897] },
    { name: 'Evanston', coordinates: [-87.6877, 42.0451] },
    { name: 'Naperville', coordinates: [-88.1473, 41.7508] }
];

const metroBoundary = {
    type: 'Feature',
    properties: { name: 'Chicago metro extent' },
    geometry: {
        type: 'Polygon',
        coordinates: [[
            [-88.58, 42.52],
            [-87.42, 42.52],
            [-87.42, 41.18],
            [-88.58, 41.18],
            [-88.58, 42.52]
        ]]
    }
};

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/bright',
    center: presets.downtown.center,
    zoom: presets.downtown.zoom,
    pitch: presets.downtown.pitch,
    bearing: presets.downtown.bearing,
    hash: true,
    maxPitch: 85,
    antialias: true,
    canvasContextAttributes: {
        antialias: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    },
    attributionControl: false
});

window.chicagoMap = map;

map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-left');

const viewName = document.querySelector('#viewName');
const heightScale = document.querySelector('#heightScale');
const heightOutput = document.querySelector('#heightOutput');
const presetButtons = [...document.querySelectorAll('[data-preset]')];
const lightButtons = [...document.querySelectorAll('[data-light]')];
const imageryButtons = [...document.querySelectorAll('[data-imagery]')];
const mobilityButtons = [...document.querySelectorAll('[data-mobility]')];
const trainButtons = [...document.querySelectorAll('[data-trains]')];
const trafficDensity = document.querySelector('#trafficDensity');
const trafficOutput = document.querySelector('#trafficOutput');
const mobilityMetric = document.querySelector('#mobilityMetric');
const trainMetric = document.querySelector('#trainMetric');
const modelShell = document.querySelector('.model-shell');
const photorealMap = document.querySelector('#photorealMap');
const rendererButtons = [...document.querySelectorAll('[data-renderer]')];
const photorealSetup = document.querySelector('#photorealSetup');
const googleTilesKey = document.querySelector('#googleTilesKey');
const photorealStatus = document.querySelector('#photorealStatus');
const enablePhotorealButton = document.querySelector('[data-action="enable-photoreal"]');
const inspector = document.querySelector('#cityInspector');
const inspectorTitle = document.querySelector('#inspectorTitle');
const inspectorPanels = [...document.querySelectorAll('[data-panel]')];
const panelToggleButtons = [...document.querySelectorAll('[data-panel-toggle]')];

let activeLight = 'day';
const mobility = {
    enabled: true,
    density: 1,
    routes: [],
    agents: [],
    frame: 0,
    lastFrameTime: performance.now(),
    lastPaintTime: 0,
    refreshTimer: 0,
    cameraMoving: false,
    sourceUpdates: 0
};
window.chicagoMobility = mobility;
const trains = {
    enabled: true,
    routes: [],
    agents: []
};
window.chicagoTrains = trains;
const photoreal = {
    viewer: null,
    tileset: null,
    loading: false
};
const agents3D = {
    ready: false,
    loading: false,
    layer: null
};

const emptyFeatureCollection = () => ({ type: 'FeatureCollection', features: [] });

const setRendererButtons = (mode) => {
    rendererButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.renderer === mode);
    });
};

const loadCesiumLibrary = () => {
    if (window.Cesium) return Promise.resolve(window.Cesium);
    if (photoreal.libraryPromise) return photoreal.libraryPromise;

    window.CESIUM_BASE_URL = 'https://cesium.com/downloads/cesiumjs/releases/1.130/Build/Cesium/';
    if (!document.querySelector('link[data-cesium]')) {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = `${window.CESIUM_BASE_URL}Widgets/widgets.css`;
        stylesheet.dataset.cesium = 'true';
        document.head.append(stylesheet);
    }

    photoreal.libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${window.CESIUM_BASE_URL}Cesium.js`;
        script.dataset.cesium = 'true';
        script.addEventListener('load', () => resolve(window.Cesium), { once: true });
        script.addEventListener('error', () => reject(new Error('Cesium could not be loaded.')), { once: true });
        document.head.append(script);
    });

    return photoreal.libraryPromise;
};

const syncPhotorealCamera = () => {
    if (!photoreal.viewer || !window.Cesium) return;
    const center = map.getCenter();
    const height = Math.max(340, 50000000 / (2 ** map.getZoom()));
    photoreal.viewer.camera.setView({
        destination: window.Cesium.Cartesian3.fromDegrees(center.lng, center.lat, height),
        orientation: {
            heading: window.Cesium.Math.toRadians(map.getBearing()),
            pitch: window.Cesium.Math.toRadians(map.getPitch() - 90),
            roll: 0
        }
    });
    photoreal.viewer.scene.requestRender();
};

const showModelRenderer = () => {
    modelShell.classList.remove('is-photoreal');
    setRendererButtons('model');
    if (photoreal.viewer) photoreal.viewer.useDefaultRenderLoop = false;
    map.resize();
};

const activatePhotorealRenderer = () => {
    photorealMap.hidden = false;
    modelShell.classList.add('is-photoreal');
    setRendererButtons('photoreal');
    photoreal.viewer.useDefaultRenderLoop = true;
    syncPhotorealCamera();
};

const enablePhotorealRenderer = async (apiKey) => {
    if (!apiKey || photoreal.loading) return;
    photoreal.loading = true;
    photorealStatus.classList.remove('is-error');
    photorealStatus.textContent = 'Loading photorealistic Chicago...';
    enablePhotorealButton.disabled = true;

    try {
        const Cesium = await loadCesiumLibrary();
        if (!photoreal.viewer) {
            photorealMap.hidden = false;
            photoreal.viewer = new Cesium.Viewer('photorealMap', {
                globe: false,
                imageryProvider: false,
                baseLayerPicker: false,
                geocoder: false,
                homeButton: false,
                sceneModePicker: false,
                navigationHelpButton: false,
                animation: false,
                timeline: false,
                fullscreenButton: false,
                selectionIndicator: false,
                infoBox: false,
                requestRenderMode: true,
                maximumRenderTimeChange: Infinity,
                contextOptions: {
                    webgl: {
                        alpha: false,
                        antialias: true,
                        preserveDrawingBuffer: false,
                        powerPreference: 'high-performance'
                    }
                }
            });
            photoreal.viewer.scene.skyAtmosphere.show = true;
            if (photoreal.viewer.scene.globe) photoreal.viewer.scene.globe.show = false;
        }

        if (photoreal.tileset) {
            photoreal.viewer.scene.primitives.remove(photoreal.tileset);
            photoreal.tileset = null;
        }

        photoreal.tileset = await Cesium.Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`,
            {
                showCreditsOnScreen: true,
                maximumScreenSpaceError: 1.5,
                dynamicScreenSpaceError: true,
                skipLevelOfDetail: true,
                foveatedScreenSpaceError: true,
                loadSiblings: false
            }
        );
        photoreal.viewer.scene.primitives.add(photoreal.tileset);
        localStorage.setItem('chicagoGoogleTilesKey', apiKey);
        activatePhotorealRenderer();
        photorealSetup.close();
    } catch (error) {
        if (photoreal.viewer) photoreal.viewer.useDefaultRenderLoop = false;
        photorealMap.hidden = true;
        photorealStatus.classList.add('is-error');
        photorealStatus.textContent = 'Could not load Google 3D. Check the key and Map Tiles API access.';
        if (!photorealSetup.open) photorealSetup.showModal();
    } finally {
        photoreal.loading = false;
        enablePhotorealButton.disabled = false;
    }
};

const requestPhotorealRenderer = () => {
    if (photoreal.viewer && photoreal.tileset) {
        activatePhotorealRenderer();
        return;
    }

    const storedKey = localStorage.getItem('chicagoGoogleTilesKey') || '';
    googleTilesKey.value = storedKey;
    if (storedKey) {
        enablePhotorealRenderer(storedKey);
        return;
    }

    photorealStatus.classList.remove('is-error');
    photorealStatus.textContent = 'Stored only in this browser.';
    photorealSetup.showModal();
};

const distanceMeters = (a, b) => {
    const latitude = ((a[1] + b[1]) * Math.PI) / 360;
    const x = (b[0] - a[0]) * 111320 * Math.cos(latitude);
    const y = (b[1] - a[1]) * 110540;
    return Math.hypot(x, y);
};

const bearingDegrees = (a, b) => {
    const latitude = ((a[1] + b[1]) * Math.PI) / 360;
    const x = (b[0] - a[0]) * Math.cos(latitude);
    const y = b[1] - a[1];
    return (Math.atan2(x, y) * 180) / Math.PI;
};

const buildRoute = (coordinates, roadClass = 'street') => {
    const clean = coordinates.filter((coordinate, index) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) return false;
        if (!index) return true;
        return distanceMeters(coordinates[index - 1], coordinate) > 0.4;
    });
    if (clean.length < 2) return null;

    const cumulative = [0];
    const bearings = [];
    for (let index = 1; index < clean.length; index += 1) {
        cumulative.push(cumulative[index - 1] + distanceMeters(clean[index - 1], clean[index]));
        bearings.push(bearingDegrees(clean[index - 1], clean[index]) - 90);
    }
    if (cumulative.at(-1) < 18) return null;

    return {
        coordinates: clean,
        cumulative,
        bearings,
        length: cumulative.at(-1),
        roadClass
    };
};

const fallbackRoutes = () => {
    const center = map.getCenter();
    const latitudeScale = Math.cos((center.lat * Math.PI) / 180);
    const longitudeStep = 0.0042 / latitudeScale;
    const latitudeStep = 0.0032;
    const routes = [];

    for (let offset = -5; offset <= 5; offset += 1) {
        routes.push(buildRoute([
            [center.lng - longitudeStep * 5, center.lat + latitudeStep * offset],
            [center.lng + longitudeStep * 5, center.lat + latitudeStep * offset]
        ], offset % 3 === 0 ? 'primary' : 'residential'));
        routes.push(buildRoute([
            [center.lng + longitudeStep * offset, center.lat - latitudeStep * 5],
            [center.lng + longitudeStep * offset, center.lat + latitudeStep * 5]
        ], offset % 3 === 0 ? 'secondary' : 'residential'));
    }

    return routes.filter(Boolean);
};

const extractStreetRoutes = () => {
    const roadLayerIds = (map.getStyle().layers || [])
        .filter((layer) => layer.type === 'line' && layer['source-layer'] === 'transportation')
        .map((layer) => layer.id);
    let features = [];

    try {
        features = roadLayerIds.length
            ? map.queryRenderedFeatures({ layers: roadLayerIds })
            : [];
    } catch (error) {
        return fallbackRoutes();
    }

    const routes = [];
    const seen = new Set();
    const addLine = (coordinates, properties) => {
        const first = coordinates[0];
        const last = coordinates.at(-1);
        if (!first || !last) return;
        const signature = [
            first[0].toFixed(5),
            first[1].toFixed(5),
            last[0].toFixed(5),
            last[1].toFixed(5)
        ].join(':');
        if (seen.has(signature)) return;
        seen.add(signature);

        const roadClass = properties.class || properties.subclass || 'street';
        const route = buildRoute(coordinates, roadClass);
        if (route) routes.push(route);
    };

    features.forEach((feature) => {
        if (feature.geometry?.type === 'LineString') {
            addLine(feature.geometry.coordinates, feature.properties || {});
        } else if (feature.geometry?.type === 'MultiLineString') {
            feature.geometry.coordinates.forEach((coordinates) => addLine(coordinates, feature.properties || {}));
        }
    });

    return routes.length >= 12 ? routes.slice(0, 700) : fallbackRoutes();
};

const chicagoRailLines = [
    {
        name: 'cta-red',
        coordinates: [
            [-87.6607, 42.0191], [-87.6587, 41.9903], [-87.6553, 41.9474],
            [-87.6533, 41.9398], [-87.6452, 41.9251], [-87.6386, 41.9106],
            [-87.6318, 41.9039], [-87.6282, 41.8917], [-87.6278, 41.8787],
            [-87.6290, 41.8675], [-87.6257, 41.8533], [-87.6245, 41.8312],
            [-87.6244, 41.7954], [-87.6259, 41.7684], [-87.6256, 41.7223]
        ]
    },
    {
        name: 'cta-brown',
        coordinates: [
            [-87.7131, 41.9663], [-87.7045, 41.9660], [-87.6941, 41.9661],
            [-87.6826, 41.9662], [-87.6752, 41.9549], [-87.6729, 41.9437],
            [-87.6638, 41.9327], [-87.6535, 41.9250], [-87.6494, 41.9182],
            [-87.6388, 41.9104], [-87.6317, 41.9038], [-87.6268, 41.8967],
            [-87.6261, 41.8858], [-87.6337, 41.8820], [-87.6335, 41.8768],
            [-87.6268, 41.8768], [-87.6261, 41.8858]
        ]
    },
    {
        name: 'cta-blue',
        coordinates: [
            [-87.9042, 41.9777], [-87.8381, 41.9697], [-87.7875, 41.9538],
            [-87.7524, 41.9381], [-87.7128, 41.9162], [-87.6734, 41.9023],
            [-87.6550, 41.8856], [-87.6417, 41.8827], [-87.6294, 41.8842],
            [-87.6186, 41.8755], [-87.6410, 41.8578], [-87.6794, 41.8684],
            [-87.7453, 41.8743]
        ]
    },
    {
        name: 'metra-north',
        coordinates: [
            [-87.6391, 41.8817], [-87.6409, 41.9006], [-87.6501, 41.9228],
            [-87.6574, 41.9473], [-87.6742, 41.9772], [-87.6902, 42.0180],
            [-87.6983, 42.0552], [-87.7112, 42.1102]
        ]
    },
    {
        name: 'metra-west',
        coordinates: [
            [-87.6391, 41.8817], [-87.6676, 41.8841], [-87.7064, 41.8877],
            [-87.7522, 41.8868], [-87.8046, 41.8884], [-87.8406, 41.8888],
            [-87.9018, 41.8894], [-87.9770, 41.8869], [-88.0904, 41.8803],
            [-88.1473, 41.7799]
        ]
    }
];
let officialRailRoutes = [];

const loadOfficialRailRoutes = async () => {
    const response = await fetch('data/transit-routes.json?v=20260627');
    if (!response.ok) throw new Error('Official transit shapes could not be loaded.');
    const collection = await response.json();
    officialRailRoutes = collection.features.map((feature) => {
        const agency = feature.properties.agency;
        const route = buildRoute(feature.geometry.coordinates, agency);
        if (!route) return null;
        route.agency = agency;
        route.routeId = feature.properties.routeId;
        route.routeName = feature.properties.routeName;
        route.routeColor = feature.properties.color;
        route.shapeId = feature.properties.shapeId;
        return route;
    }).filter(Boolean);
};

const officialRoutesInView = () => {
    const bounds = map.getBounds();
    const padding = Math.max(0.025, (bounds.getEast() - bounds.getWest()) * 0.3);
    const west = bounds.getWest() - padding;
    const east = bounds.getEast() + padding;
    const south = bounds.getSouth() - padding;
    const north = bounds.getNorth() + padding;
    const routes = officialRailRoutes.filter((route) => route.coordinates.some((coordinate) => (
        coordinate[0] >= west
        && coordinate[0] <= east
        && coordinate[1] >= south
        && coordinate[1] <= north
    )));
    return routes.length ? routes : officialRailRoutes;
};

const fallbackRailRoutes = () => {
    const bounds = map.getBounds();
    const padding = 0.045;
    const inArea = (coordinate) => (
        coordinate[0] >= bounds.getWest() - padding
        && coordinate[0] <= bounds.getEast() + padding
        && coordinate[1] >= bounds.getSouth() - padding
        && coordinate[1] <= bounds.getNorth() + padding
    );
    const routes = chicagoRailLines
        .filter((line) => line.coordinates.some(inArea))
        .map((line) => buildRoute(line.coordinates, line.name))
        .filter(Boolean);

    if (routes.length) return routes;

    const center = map.getCenter();
    const longitudeSpan = 0.04 / Math.cos((center.lat * Math.PI) / 180);
    return [buildRoute([
        [center.lng - longitudeSpan, center.lat - 0.012],
        [center.lng, center.lat],
        [center.lng + longitudeSpan, center.lat + 0.012]
    ], 'metra')].filter(Boolean);
};

const extractRailRoutes = () => {
    const railLayerIds = (map.getStyle().layers || [])
        .filter((layer) => layer.type === 'line' && layer['source-layer'] === 'transportation')
        .map((layer) => layer.id);
    let features = [];

    try {
        features = railLayerIds.length
            ? map.queryRenderedFeatures({ layers: railLayerIds })
            : [];
    } catch (error) {
        return fallbackRailRoutes();
    }

    const routes = [];
    const seen = new Set();
    features.forEach((feature) => {
        const properties = feature.properties || {};
        const signatureText = [
            properties.class,
            properties.subclass,
            properties.brunnel,
            feature.layer?.id
        ].filter(Boolean).join(' ').toLowerCase();
        if (!/(rail|train|transit|subway)/.test(signatureText)) return;

        const lines = feature.geometry?.type === 'MultiLineString'
            ? feature.geometry.coordinates
            : [feature.geometry?.coordinates];
        lines.filter(Boolean).forEach((coordinates) => {
            const first = coordinates[0];
            const last = coordinates.at(-1);
            if (!first || !last) return;
            const signature = `${first[0].toFixed(5)}:${first[1].toFixed(5)}:${last[0].toFixed(5)}:${last[1].toFixed(5)}`;
            if (seen.has(signature)) return;
            seen.add(signature);
            const route = buildRoute(
                coordinates,
                signatureText.includes('metra') ? 'metra' : 'cta'
            );
            if (route && route.length >= 70) routes.push(route);
        });
    });

    return routes.length ? routes.slice(0, 36) : fallbackRailRoutes();
};

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

const targetAgentCounts = () => {
    const zoom = map.getZoom();
    const detail = zoom >= 17 ? 1.25 : zoom >= 15 ? 1 : zoom >= 13 ? 0.65 : 0.32;
    const density = mobility.density * detail;
    return {
        car: Math.round(72 * density),
        bus: Math.round(7 * density),
        bicycle: Math.round(24 * density),
        person: Math.round(68 * density)
    };
};

const localRoadClasses = new Set(['residential', 'service', 'living_street', 'path', 'track', 'minor']);
const majorRoadClasses = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

const routesForType = (type) => {
    if (type === 'person' || type === 'bicycle') {
        const local = mobility.routes.filter((route) => localRoadClasses.has(route.roadClass));
        return local.length > 8 ? local : mobility.routes;
    }
    if (type === 'bus') {
        const major = mobility.routes.filter((route) => majorRoadClasses.has(route.roadClass));
        return major.length > 4 ? major : mobility.routes;
    }
    return mobility.routes.filter((route) => route.roadClass !== 'path') || mobility.routes;
};

const spawnAgent = (type) => {
    const route = randomItem(routesForType(type));
    if (!route) return null;
    const speeds = {
        car: 8 + Math.random() * 9,
        bus: 6 + Math.random() * 5,
        bicycle: 3 + Math.random() * 3,
        person: 0.9 + Math.random() * 0.8
    };
    return {
        id: `${type}-${Math.random().toString(36).slice(2)}`,
        type,
        route,
        progress: Math.random() * route.length,
        speed: speeds[type],
        direction: Math.random() > 0.5 ? 1 : -1,
        colorIndex: Math.floor(Math.random() * 5)
    };
};

const rebuildAgents = () => {
    const counts = targetAgentCounts();
    mobility.agents = Object.entries(counts).flatMap(([type, count]) => (
        Array.from({ length: count }, () => spawnAgent(type)).filter(Boolean)
    ));
    mobilityMetric.innerHTML = `<b>${mobility.agents.length}</b> Moving`;
};

const rebuildTrains = () => {
    const center = map.getCenter();
    const trainCount = Math.max(2, Math.min(map.getZoom() >= 14 ? 8 : 4, trains.routes.length * 2));
    const ctaRoutes = trains.routes.filter((route) => route.agency === 'cta');
    const metraRoutes = trains.routes.filter((route) => route.agency === 'metra');
    const selectedRoutes = [];
    for (let index = 0; index < trainCount; index += 1) {
        const preferMetra = metraRoutes.length && (index % 3 === 1 || !ctaRoutes.length);
        const pool = preferMetra ? metraRoutes : ctaRoutes.length ? ctaRoutes : trains.routes;
        selectedRoutes.push(pool[Math.floor(index / (preferMetra ? 3 : 2)) % pool.length]);
    }

    trains.agents = selectedRoutes.map((route, index) => {
        if (!route) return null;
        let nearestIndex = 0;
        let nearestDistance = Infinity;
        route.coordinates.forEach((coordinate, coordinateIndex) => {
            const distance = distanceMeters([center.lng, center.lat], coordinate);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = coordinateIndex;
            }
        });
        const direction = index % 2 ? -1 : 1;
        const offset = ((index / 2) | 0) * 130 * direction;
        const progress = (route.cumulative[nearestIndex] + offset + route.length) % route.length;
        const isMetra = route.agency === 'metra' || route.roadClass.includes('metra');
        return {
            id: `train-${index}`,
            route,
            progress,
            direction,
            type: isMetra ? 'metra' : 'cta',
            speed: isMetra ? 18 + Math.random() * 7 : 11 + Math.random() * 5,
            cars: isMetra ? 5 : 4
        };
    }).filter(Boolean);
    trainMetric.innerHTML = `<b>${trains.agents.length}</b> Trains`;
    trainMetric.dataset.routeCount = String(trains.routes.length);
    trainMetric.dataset.cta = String(trains.agents.filter((train) => train.type === 'cta').length);
    trainMetric.dataset.metra = String(trains.agents.filter((train) => train.type === 'metra').length);
};

const pointAlongRoute = (agent) => {
    const { route } = agent;
    let low = 1;
    let high = route.cumulative.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (route.cumulative[middle] < agent.progress) low = middle + 1;
        else high = middle;
    }
    const segment = low;
    const start = route.coordinates[segment - 1];
    const end = route.coordinates[segment];
    const segmentStart = route.cumulative[segment - 1];
    const segmentLength = Math.max(0.01, route.cumulative[segment] - segmentStart);
    const ratio = (agent.progress - segmentStart) / segmentLength;
    const coordinates = [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
    ];
    const bearing = route.bearings[segment - 1] + (agent.direction < 0 ? 180 : 0);
    return { coordinates, bearing };
};

const normalizedProgress = (route, progress) => (
    ((progress % route.length) + route.length) % route.length
);

const collect3DEntities = () => {
    const entities = [];
    if (mobility.enabled) {
        mobility.agents.forEach((agent) => {
            const position = pointAlongRoute(agent);
            entities.push({
                type: agent.type,
                coordinates: position.coordinates,
                bearing: position.bearing,
                altitude: agent.type === 'person' ? 0.15 : agent.type === 'bicycle' ? 0.25 : 0.4
            });
        });
    }

    if (trains.enabled) {
        trains.agents.forEach((train) => {
            const spacing = train.type === 'metra' ? 27 : 19;
            for (let carIndex = 0; carIndex < train.cars; carIndex += 1) {
                const progress = normalizedProgress(
                    train.route,
                    train.progress - train.direction * carIndex * spacing
                );
                const position = pointAlongRoute({ ...train, progress });
                entities.push({
                    type: train.type === 'metra' && carIndex === 0 ? 'metra-locomotive' : train.type,
                    coordinates: position.coordinates,
                    bearing: position.bearing,
                    altitude: train.type === 'metra' ? 2.2 : 8.5
                });
            }
        });
    }
    return entities;
};

const collectTrainFeatures = () => {
    const trainCars = [];
    trains.agents.forEach((train) => {
        const spacing = train.type === 'metra' ? 27 : 19;
        for (let carIndex = 0; carIndex < train.cars; carIndex += 1) {
            const progress = normalizedProgress(
                train.route,
                train.progress - train.direction * carIndex * spacing
            );
            const position = pointAlongRoute({ ...train, progress });
            trainCars.push({
                type: 'Feature',
                properties: {
                    id: `${train.id}-car-${carIndex}`,
                    type: train.type,
                    lead: carIndex === 0,
                    bearing: position.bearing
                },
                geometry: { type: 'Point', coordinates: position.coordinates }
            });
        }
    });

    trainMetric.dataset.progress = trains.agents
        .map((train) => train.progress.toFixed(1))
        .join(',');
    return trainCars;
};

const paintRailRoutes = () => {
    map.getSource('active-rail-routes')?.setData({
        type: 'FeatureCollection',
        features: trains.routes.map((route, index) => ({
            type: 'Feature',
            properties: {
                id: index,
                type: route.agency || route.roadClass,
                route: route.routeName || route.roadClass,
                color: route.routeColor || (route.agency === 'metra' ? '#2b4d86' : '#aeb8ba')
            },
            geometry: { type: 'LineString', coordinates: route.coordinates }
        }))
    });
};

const collectMobilityFeatures = () => mobility.agents.map((agent) => {
        const position = pointAlongRoute(agent);
        return {
            type: 'Feature',
            properties: {
                id: agent.id,
                type: agent.type,
                bearing: position.bearing,
                colorIndex: agent.colorIndex
            },
            geometry: { type: 'Point', coordinates: position.coordinates }
        };
    });

const paintMovingAgents = () => {
    const features = [];
    if (mobility.enabled) features.push(...collectMobilityFeatures());
    if (trains.enabled) features.push(...collectTrainFeatures());
    if (!agents3D.ready) {
        map.getSource('moving-agents')?.setData({
            type: 'FeatureCollection',
            features
        });
        mobility.sourceUpdates += 1;
        mobilityMetric.dataset.sourceUpdates = String(mobility.sourceUpdates);
    }
};

const spriteAgentLayerIds = [
    'moving-vehicle-shadows',
    'moving-vehicle-lights',
    'moving-vehicles-layer',
    'moving-bicycles-halo',
    'moving-bicycles-layer',
    'moving-people-halo',
    'moving-people-layer',
    'moving-train-shadow',
    'moving-trains-layer'
];

const initAgent3DLayer = async () => {
    if (agents3D.loading || agents3D.ready) return;
    agents3D.loading = true;
    try {
        const { createAgent3DLayer } = await import('./agents-3d.js?v=20260627-15');
        agents3D.layer = createAgent3DLayer({
            map,
            getEntities: collect3DEntities,
            onReady: () => {
                agents3D.ready = true;
                spriteAgentLayerIds.forEach((layer) => {
                    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', 'none');
                });
            }
        });
        map.addLayer(agents3D.layer);
    } catch (error) {
        console.warn('3D city agents unavailable; retaining map sprites.', error);
    } finally {
        agents3D.loading = false;
    }
};

const animateMobility = (time) => {
    const elapsed = Math.min(0.08, (time - mobility.lastFrameTime) / 1000);
    mobility.lastFrameTime = time;

    const simulationPaused = mobility.cameraMoving || map.isMoving() || document.hidden;

    if (!simulationPaused && mobility.enabled && mobility.agents.length) {
        mobility.agents.forEach((agent) => {
            agent.progress += agent.speed * elapsed * agent.direction;
            if (agent.progress > agent.route.length) agent.progress = 0;
            if (agent.progress < 0) agent.progress = agent.route.length;
        });
    }

    if (!simulationPaused && trains.enabled && trains.agents.length) {
        trains.agents.forEach((train) => {
            train.progress = normalizedProgress(
                train.route,
                train.progress + train.speed * elapsed * train.direction
            );
        });
    }

    if (!simulationPaused && time - mobility.lastPaintTime > 55) {
        paintMovingAgents();
        mobility.lastPaintTime = time;
    }

    mobility.frame = requestAnimationFrame(animateMobility);
};

const drawMobilityIcon = (name, width, height, draw) => {
    const pixelRatio = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const context = canvas.getContext('2d');
    context.scale(pixelRatio, pixelRatio);
    draw(context, width, height);
    map.addImage(name, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio });
};

const createMobilityIcons = () => {
    drawMobilityIcon('city-car', 18, 10, (ctx) => {
        ctx.fillStyle = '#0b1115';
        ctx.fillRect(2, 0, 4, 2);
        ctx.fillRect(12, 0, 4, 2);
        ctx.fillRect(2, 8, 4, 2);
        ctx.fillRect(12, 8, 4, 2);
        ctx.fillStyle = '#ef5f51';
        ctx.beginPath();
        ctx.roundRect(1, 2, 16, 6, 2);
        ctx.fill();
        ctx.fillStyle = '#a9dcf0';
        ctx.fillRect(6, 3, 6, 4);
        ctx.fillStyle = '#fff4b1';
        ctx.fillRect(15, 3, 2, 1.5);
        ctx.fillRect(15, 5.5, 2, 1.5);
    });
    drawMobilityIcon('city-bus', 25, 10, (ctx) => {
        ctx.fillStyle = '#161b1e';
        ctx.fillRect(3, 0, 5, 2);
        ctx.fillRect(17, 0, 5, 2);
        ctx.fillRect(3, 8, 5, 2);
        ctx.fillRect(17, 8, 5, 2);
        ctx.fillStyle = '#f2b54b';
        ctx.beginPath();
        ctx.roundRect(1, 2, 23, 6, 2);
        ctx.fill();
        ctx.fillStyle = '#d4f1ff';
        for (let x = 5; x < 20; x += 4) ctx.fillRect(x, 3, 2.6, 4);
    });
    drawMobilityIcon('city-bike', 13, 13, (ctx) => {
        ctx.strokeStyle = '#63e0cb';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(3.5, 3.5, 2.5, 0, Math.PI * 2);
        ctx.arc(9.5, 9.5, 2.5, 0, Math.PI * 2);
        ctx.moveTo(3.5, 3.5);
        ctx.lineTo(8, 5);
        ctx.lineTo(5, 9);
        ctx.lineTo(3.5, 3.5);
        ctx.moveTo(8, 5);
        ctx.lineTo(9.5, 9.5);
        ctx.stroke();
    });
    drawMobilityIcon('city-person', 9, 9, (ctx) => {
        ctx.fillStyle = '#ffe2a8';
        ctx.beginPath();
        ctx.arc(4.5, 2, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#48b9ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4.5, 4);
        ctx.lineTo(4.5, 8);
        ctx.moveTo(1.8, 5.2);
        ctx.lineTo(7.2, 5.2);
        ctx.stroke();
    });
    drawMobilityIcon('cta-train-car', 34, 12, (ctx) => {
        ctx.fillStyle = '#20262a';
        ctx.fillRect(4, 0, 6, 2);
        ctx.fillRect(24, 0, 6, 2);
        ctx.fillRect(4, 10, 6, 2);
        ctx.fillRect(24, 10, 6, 2);
        ctx.fillStyle = '#d9dfe1';
        ctx.beginPath();
        ctx.roundRect(1, 2, 32, 8, 2.5);
        ctx.fill();
        ctx.fillStyle = '#242a2e';
        for (let x = 6; x < 29; x += 5) ctx.fillRect(x, 3.5, 3.4, 5);
        ctx.fillStyle = '#d9413a';
        ctx.fillRect(2, 8, 30, 1.5);
        ctx.fillStyle = '#fff4b1';
        ctx.fillRect(31, 3.2, 2, 2);
        ctx.fillRect(31, 6.8, 2, 2);
    });
    drawMobilityIcon('metra-train-car', 38, 13, (ctx) => {
        ctx.fillStyle = '#1b2125';
        ctx.fillRect(5, 0, 7, 2);
        ctx.fillRect(27, 0, 7, 2);
        ctx.fillRect(5, 11, 7, 2);
        ctx.fillRect(27, 11, 7, 2);
        ctx.fillStyle = '#dce4e7';
        ctx.beginPath();
        ctx.roundRect(1, 2, 36, 9, 2);
        ctx.fill();
        ctx.fillStyle = '#253f78';
        ctx.fillRect(2, 7.5, 34, 2);
        ctx.fillStyle = '#20313a';
        for (let x = 6; x < 33; x += 5) ctx.fillRect(x, 3.5, 3.4, 3.2);
        ctx.fillStyle = '#fff4b1';
        ctx.fillRect(35, 3, 2, 2);
        ctx.fillRect(35, 7, 2, 2);
    });
};

const addMobilityLayers = () => {
    createMobilityIcons();
    map.addSource('moving-agents', { type: 'geojson', data: emptyFeatureCollection() });
    map.addSource('active-rail-routes', { type: 'geojson', data: emptyFeatureCollection() });

    map.addLayer({
        id: 'active-rail-shadow',
        type: 'line',
        source: 'active-rail-routes',
        minzoom: 11,
        paint: {
            'line-color': '#101417',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 18, 7],
            'line-opacity': 0.72
        }
    });
    map.addLayer({
        id: 'active-rail-route-color',
        type: 'line',
        source: 'active-rail-routes',
        minzoom: 10,
        paint: {
            'line-color': ['coalesce', ['get', 'color'], '#9aa7ad'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 18, 3.2],
            'line-opacity': 0.72
        }
    });
    map.addLayer({
        id: 'active-rail-ties',
        type: 'line',
        source: 'active-rail-routes',
        minzoom: 13,
        paint: {
            'line-color': '#d6d1c6',
            'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 18, 2.2],
            'line-dasharray': [1, 1.8],
            'line-opacity': 0.86
        }
    });

    map.addLayer({
        id: 'moving-vehicle-shadows',
        type: 'circle',
        source: 'moving-agents',
        minzoom: 13,
        filter: ['match', ['get', 'type'], ['car', 'bus'], true, false],
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 18, 5],
            'circle-color': '#000000',
            'circle-opacity': 0.42,
            'circle-translate': [2, 3],
            'circle-blur': 0.35
        }
    });
    map.addLayer({
        id: 'moving-vehicle-lights',
        type: 'circle',
        source: 'moving-agents',
        minzoom: 13,
        filter: ['match', ['get', 'type'], ['car', 'bus'], true, false],
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.4, 18, 4.5],
            'circle-color': ['case', ['==', ['get', 'type'], 'bus'], '#ffc857', '#ff645d'],
            'circle-opacity': 0.82,
            'circle-blur': 0.12,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.45
        }
    });
    map.addLayer({
        id: 'moving-vehicles-layer',
        type: 'symbol',
        source: 'moving-agents',
        minzoom: 13,
        filter: ['match', ['get', 'type'], ['car', 'bus'], true, false],
        layout: {
            'icon-image': ['case', ['==', ['get', 'type'], 'bus'], 'city-bus', 'city-car'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.55, 16, 0.9, 19, 1.35],
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
    map.addLayer({
        id: 'moving-bicycles-halo',
        type: 'circle',
        source: 'moving-agents',
        minzoom: 14,
        filter: ['==', ['get', 'type'], 'bicycle'],
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 4],
            'circle-color': '#3fe0c4',
            'circle-opacity': 0.62,
            'circle-blur': 0.2
        }
    });
    map.addLayer({
        id: 'moving-bicycles-layer',
        type: 'symbol',
        source: 'moving-agents',
        minzoom: 14,
        filter: ['==', ['get', 'type'], 'bicycle'],
        layout: {
            'icon-image': 'city-bike',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.65, 18, 1.25],
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
    map.addLayer({
        id: 'moving-people-halo',
        type: 'circle',
        source: 'moving-agents',
        minzoom: 15,
        filter: ['==', ['get', 'type'], 'person'],
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.2, 19, 4.5],
            'circle-color': '#48b9ff',
            'circle-opacity': 0.58,
            'circle-blur': 0.16,
            'circle-stroke-width': 0.8,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.5
        }
    });
    map.addLayer({
        id: 'moving-people-layer',
        type: 'symbol',
        source: 'moving-agents',
        minzoom: 15,
        filter: ['==', ['get', 'type'], 'person'],
        layout: {
            'icon-image': 'city-person',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.7, 19, 1.35],
            'icon-rotation-alignment': 'viewport',
            'icon-pitch-alignment': 'viewport',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
    map.addLayer({
        id: 'moving-train-shadow',
        type: 'circle',
        source: 'moving-agents',
        minzoom: 12,
        filter: ['match', ['get', 'type'], ['cta', 'metra'], true, false],
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 8],
            'circle-color': '#000000',
            'circle-opacity': 0.48,
            'circle-blur': 0.35,
            'circle-translate': [2, 3]
        }
    });
    map.addLayer({
        id: 'moving-trains-layer',
        type: 'symbol',
        source: 'moving-agents',
        minzoom: 12,
        filter: ['match', ['get', 'type'], ['cta', 'metra'], true, false],
        layout: {
            'icon-image': ['case', ['==', ['get', 'type'], 'metra'], 'metra-train-car', 'cta-train-car'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 16, 0.92, 19, 1.3],
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
};

const refreshMobility = () => {
    clearTimeout(mobility.refreshTimer);
    mobility.refreshTimer = window.setTimeout(() => {
        mobility.routes = extractStreetRoutes();
        trains.routes = officialRailRoutes.length ? officialRoutesInView() : extractRailRoutes();
        rebuildAgents();
        rebuildTrains();
        paintRailRoutes();
        paintMovingAgents();
    }, 180);
};

const setMobilityEnabled = (enabled) => {
    mobility.enabled = enabled;
    mobilityButtons.forEach((button) => button.classList.toggle(
        'is-active',
        button.dataset.mobility === (enabled ? 'on' : 'off')
    ));
    mobilityMetric.classList.toggle('is-paused', !enabled);
    [
        'moving-vehicle-shadows',
        'moving-vehicle-lights',
        'moving-vehicles-layer',
        'moving-bicycles-halo',
        'moving-bicycles-layer',
        'moving-people-halo',
        'moving-people-layer'
    ].forEach((layer) => {
        if (map.getLayer(layer)) {
            map.setLayoutProperty(layer, 'visibility', enabled && !agents3D.ready ? 'visible' : 'none');
        }
    });
    paintMovingAgents();
};

const setTrainsEnabled = (enabled) => {
    trains.enabled = enabled;
    trainButtons.forEach((button) => button.classList.toggle(
        'is-active',
        button.dataset.trains === (enabled ? 'on' : 'off')
    ));
    trainMetric.classList.toggle('is-paused', !enabled);
    [
        'active-rail-shadow',
        'active-rail-route-color',
        'active-rail-ties',
        'moving-train-shadow',
        'moving-trains-layer'
    ].forEach((layer) => {
        if (map.getLayer(layer)) {
            const isTrackLayer = layer.startsWith('active-rail');
            map.setLayoutProperty(layer, 'visibility', enabled && (isTrackLayer || !agents3D.ready) ? 'visible' : 'none');
        }
    });
    paintMovingAgents();
};

const updateTrafficDensity = () => {
    mobility.density = Number(trafficDensity.value);
    trafficOutput.value = `${Math.round(mobility.density * 100)}%`;
    if (mobility.routes.length) {
        rebuildAgents();
        paintMovingAgents();
    }
};

const buildingHeightExpression = () => [
    '*',
    ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 10],
    Number(heightScale.value)
];

const buildingBaseExpression = () => [
    'to-number',
    ['coalesce', ['get', 'render_min_height'], ['get', 'min_height']],
    0
];

const facadeLayerIds = ['facade-materials'];

const updateHeightScale = () => {
    const value = Math.round(Number(heightScale.value) * 100);
    heightOutput.value = `${value}%`;
    if (map.getLayer('chicago-building-extrusions')) {
        map.setPaintProperty('chicago-building-extrusions', 'fill-extrusion-height', buildingHeightExpression());
    }
    facadeLayerIds.forEach((layer) => {
        if (!map.getLayer(layer)) return;
        map.setPaintProperty(layer, 'fill-extrusion-height', [
            '*',
            ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 10],
            Number(heightScale.value) + 0.012
        ]);
    });
    if (map.getLayer('roof-texture-highlights')) {
        map.setPaintProperty('roof-texture-highlights', 'fill-extrusion-height', ['+', buildingHeightExpression(), 0.35]);
        map.setPaintProperty('roof-texture-highlights', 'fill-extrusion-base', buildingHeightExpression());
    }
};

const openPanel = (panelName) => {
    const labels = {
        views: 'Views',
        camera: 'Camera',
        visuals: 'Layers',
        model: 'Scale',
        info: 'Info'
    };

    inspector.classList.add('is-open');
    inspectorTitle.textContent = labels[panelName] || 'Tools';
    inspectorPanels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === panelName));
    panelToggleButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.panelToggle === panelName));
};

const closePanel = () => {
    inspector.classList.remove('is-open');
    panelToggleButtons.forEach((button) => button.classList.remove('is-active'));
};

const setLighting = (mode) => {
    activeLight = mode;
    lightButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.light === mode));

    const settings = {
        dawn: {
            light: { anchor: 'map', position: [1.35, 132, 34], color: '#ffd49b', intensity: 0.62 },
            fog: { color: '#d8ecff', 'high-color': '#ffe2b6', 'horizon-blend': 0.18, 'space-color': '#071014' }
        },
        day: {
            light: { anchor: 'map', position: [1.15, 42, 58], color: '#ffffff', intensity: 0.58 },
            fog: { color: '#d8f0ff', 'high-color': '#b8ddff', 'horizon-blend': 0.1, 'space-color': '#081116' }
        },
        night: {
            light: { anchor: 'map', position: [1.7, 240, 28], color: '#9fc9ff', intensity: 0.44 },
            fog: { color: '#0e1a24', 'high-color': '#12283d', 'horizon-blend': 0.25, 'space-color': '#03070b' }
        }
    }[mode];

    map.setLight(settings.light);
    if (map.setFog) map.setFog(settings.fog);

    facadeLayerIds.forEach((layer) => {
        if (!map.getLayer(layer)) return;
        map.setPaintProperty(layer, 'fill-extrusion-opacity', mode === 'night' ? 0.82 : 0.7);
    });
    if (map.getLayer('satellite-imagery')) {
        map.setPaintProperty('satellite-imagery', 'raster-brightness-min', mode === 'night' ? 0.06 : 0.18);
        map.setPaintProperty('satellite-imagery', 'raster-brightness-max', mode === 'night' ? 0.42 : 0.9);
        map.setPaintProperty('satellite-imagery', 'raster-saturation', mode === 'night' ? -0.32 : 0.04);
    }
};

const setImageryMode = (mode) => {
    imageryButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.imagery === mode));
    if (!map.getLayer('satellite-imagery')) return;

    map.setPaintProperty('satellite-imagery', 'raster-opacity', mode === 'satellite' ? 0.86 : 0.18);
    if (map.getLayer('satellite-color-grade')) {
        map.setPaintProperty('satellite-color-grade', 'background-opacity', mode === 'satellite' ? 0.16 : 0.05);
    }
};

const addSatelliteImagery = () => {
    if (!map.getSource('esri-world-imagery')) {
        map.addSource('esri-world-imagery', {
            type: 'raster',
            tiles: [
                'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS user community'
        });
    }

    const firstExistingLayer = map.getStyle().layers?.[0]?.id;
    map.addLayer({
        id: 'satellite-imagery',
        type: 'raster',
        source: 'esri-world-imagery',
        paint: {
            'raster-opacity': 0.86,
            'raster-contrast': 0.18,
            'raster-saturation': 0.04,
            'raster-brightness-min': 0.18,
            'raster-brightness-max': 0.9
        }
    }, firstExistingLayer);

    map.addLayer({
        id: 'satellite-color-grade',
        type: 'background',
        paint: {
            'background-color': '#071014',
            'background-opacity': 0.16
        }
    }, map.getStyle().layers?.[1]?.id);
};

const addBuildingExtrusions = () => {
    const sources = map.getStyle().sources || {};
    const buildingSource = sources.openfreemap ? 'openfreemap' : 'openmaptiles';
    const layers = map.getStyle().layers || [];
    const firstSymbol = layers.find((layer) => layer.type === 'symbol')?.id;

    if (map.getLayer('building')) {
        map.setLayoutProperty('building', 'visibility', 'none');
    }

    map.addLayer({
        id: 'metro-boundary-fill',
        type: 'fill',
        source: 'metro-boundary',
        paint: {
            'fill-color': '#6bd5e6',
            'fill-opacity': 0.035
        }
    }, firstSymbol);

    map.addLayer({
        id: 'metro-boundary-line',
        type: 'line',
        source: 'metro-boundary',
        paint: {
            'line-color': '#6bd5e6',
            'line-width': 2,
            'line-dasharray': [2, 2],
            'line-opacity': 0.8
        }
    }, firstSymbol);

    map.addLayer({
        id: 'building-ground-shadows',
        type: 'fill-extrusion',
        source: buildingSource,
        'source-layer': 'building',
        minzoom: 13,
        paint: {
            'fill-extrusion-color': '#061015',
            'fill-extrusion-height': 1,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.28
        }
    }, firstSymbol);

    map.addLayer({
        id: 'chicago-building-extrusions',
        type: 'fill-extrusion',
        source: buildingSource,
        'source-layer': 'building',
        minzoom: 12,
        paint: {
            'fill-extrusion-color': [
                'step',
                ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 10],
                '#aa9581',
                12,
                '#a9785d',
                24,
                '#b5aa98',
                55,
                '#879ca4',
                110,
                '#718995',
                220,
                '#aeb8ba'
            ],
            'fill-extrusion-height': buildingHeightExpression(),
            'fill-extrusion-base': buildingBaseExpression(),
            'fill-extrusion-opacity': 0.96,
            'fill-extrusion-vertical-gradient': true
        }
    }, firstSymbol);

    map.addLayer({
        id: 'facade-materials',
        type: 'fill-extrusion',
        source: buildingSource,
        'source-layer': 'building',
        minzoom: 15,
        paint: {
            'fill-extrusion-height': [
                '*',
                ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 10],
                Number(heightScale.value) + 0.012
            ],
            'fill-extrusion-base': buildingBaseExpression(),
            'fill-extrusion-opacity': activeLight === 'night' ? 0.82 : 0.7,
            'fill-extrusion-vertical-gradient': true,
            'fill-extrusion-pattern': [
                'step',
                ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 10],
                ['image', 'residential-facade'],
                18,
                ['image', 'brick-facade'],
                55,
                ['image', 'glass-facade']
            ]
        }
    }, firstSymbol);

    map.addLayer({
        id: 'roof-texture-highlights',
        type: 'fill-extrusion',
        source: buildingSource,
        'source-layer': 'building',
        minzoom: 14,
        paint: {
            'fill-extrusion-color': [
                'step',
                ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 10],
                '#786f65',
                18,
                '#aaa69d',
                55,
                '#c4c9c7',
                160,
                '#d4d8d5'
            ],
            'fill-extrusion-height': [
                '+',
                buildingHeightExpression(),
                0.35
            ],
            'fill-extrusion-base': buildingHeightExpression(),
            'fill-extrusion-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14,
                0.5,
                17,
                0.82
            ],
            'fill-extrusion-vertical-gradient': false
        }
    }, firstSymbol);
};

const addTreesAndGround = () => {
    const sources = map.getStyle().sources || {};
    const vectorSource = sources.openfreemap ? 'openfreemap' : 'openmaptiles';
    const firstSymbol = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;

    map.addLayer({
        id: 'lush-park-canopy',
        type: 'fill',
        source: vectorSource,
        'source-layer': 'landcover',
        minzoom: 8,
        filter: ['match', ['get', 'class'], ['wood', 'grass', 'park'], true, false],
        paint: {
            'fill-color': [
                'match',
                ['get', 'class'],
                'wood',
                '#1f5f35',
                'park',
                '#3e7a42',
                '#507c3d'
            ],
            'fill-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                9,
                0.2,
                15,
                0.58
            ]
        }
    }, firstSymbol);

    map.addLayer({
        id: 'individual-tree-crowns',
        type: 'circle',
        source: vectorSource,
        'source-layer': 'poi',
        minzoom: 15,
        filter: ['match', ['get', 'class'], ['park', 'garden', 'cemetery'], true, false],
        paint: {
            'circle-color': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                '#2f6f39',
                18,
                '#79a957'
            ],
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                3,
                19,
                12
            ],
            'circle-blur': 0.18,
            'circle-opacity': 0.68,
            'circle-translate': [0, -2]
        }
    }, firstSymbol);
};

const createWindowPattern = () => {
    const addFacadePattern = (name, draw) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        draw(ctx);
        if (!map.hasImage(name)) {
            map.addImage(name, ctx.getImageData(0, 0, 128, 128), { pixelRatio: 2 });
        }
    };

    addFacadePattern('residential-facade', (ctx) => {
        ctx.fillStyle = '#a36f54';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(222, 192, 166, 0.42)';
        ctx.lineWidth = 1;
        for (let y = 0; y <= 128; y += 8) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(128, y + 0.5);
            ctx.stroke();
        }
        for (let y = 7; y < 128; y += 32) {
            for (let x = 8; x < 128; x += 32) {
                ctx.fillStyle = '#e5ddd0';
                ctx.fillRect(x - 2, y - 2, 18, 24);
                ctx.fillStyle = '#31434b';
                ctx.fillRect(x, y, 14, 19);
                ctx.fillStyle = 'rgba(177, 217, 232, 0.45)';
                ctx.fillRect(x + 1, y + 1, 5, 8);
                ctx.fillRect(x + 8, y + 1, 5, 8);
                ctx.fillStyle = '#6c4938';
                ctx.fillRect(x - 3, y + 21, 20, 3);
            }
        }
    });

    addFacadePattern('brick-facade', (ctx) => {
        ctx.fillStyle = '#8f624d';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(219, 191, 165, 0.25)';
        ctx.lineWidth = 1;
        for (let y = 0; y < 128; y += 7) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(128, y + 0.5);
            ctx.stroke();
        }
        for (let y = 6; y < 128; y += 26) {
            for (let x = 7; x < 128; x += 25) {
                const lit = (x + y) % 50 === 13;
                ctx.fillStyle = '#c8bca9';
                ctx.fillRect(x - 1, y - 1, 15, 20);
                ctx.fillStyle = lit ? '#d9bd73' : '#26383f';
                ctx.fillRect(x + 1, y + 1, 11, 15);
                ctx.fillStyle = 'rgba(190, 226, 236, 0.3)';
                ctx.fillRect(x + 2, y + 2, 4, 6);
            }
        }
    });

    addFacadePattern('glass-facade', (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 128, 128);
        gradient.addColorStop(0, '#385866');
        gradient.addColorStop(0.5, '#77939b');
        gradient.addColorStop(1, '#29434f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 3; y < 128; y += 16) {
            for (let x = 3; x < 128; x += 16) {
                const lit = (x * 3 + y) % 64 === 12;
                ctx.fillStyle = lit ? '#e7c879' : 'rgba(164, 211, 226, 0.58)';
                ctx.fillRect(x, y, 11, 10);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                ctx.fillRect(x + 1, y + 1, 3, 8);
            }
        }
        ctx.strokeStyle = 'rgba(19, 35, 43, 0.82)';
        ctx.lineWidth = 2;
        for (let x = 0; x <= 128; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 128);
            ctx.stroke();
        }
        for (let y = 0; y <= 128; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(128, y);
            ctx.stroke();
        }
    });
};

const addLandmarks = () => {
    landmarks.forEach((landmark) => {
        const marker = document.createElement('div');
        marker.className = 'landmark-marker';

        new maplibregl.Marker({ element: marker, anchor: 'bottom' })
            .setLngLat(landmark.coordinates)
            .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${landmark.name}</strong>`))
            .addTo(map);
    });
};

const flyToPreset = (key) => {
    const preset = presets[key];
    if (!preset) return;

    mobility.cameraMoving = true;
    clearTimeout(mobility.refreshTimer);
    viewName.textContent = preset.label;
    presetButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.preset === key));
    map.flyTo({
        center: preset.center,
        zoom: preset.zoom,
        pitch: preset.pitch,
        bearing: preset.bearing,
        speed: 0.72,
        curve: 1.35,
        essential: true
    });
};

map.on('load', () => {
    map.addSource('metro-boundary', {
        type: 'geojson',
        data: metroBoundary
    });

    addSatelliteImagery();
    createWindowPattern();
    addTreesAndGround();
    addBuildingExtrusions();
    addLandmarks();
    addMobilityLayers();
    initAgent3DLayer();
    setLighting('day');
    updateHeightScale();
    setImageryMode('satellite');
    refreshMobility();
    loadOfficialRailRoutes().then(refreshMobility).catch(() => {});
    mobility.frame = requestAnimationFrame(animateMobility);
});

map.on('movestart', () => {
    mobility.cameraMoving = true;
    clearTimeout(mobility.refreshTimer);
});

map.on('moveend', () => {
    mobility.cameraMoving = false;
    mobility.lastFrameTime = performance.now();
    refreshMobility();
    if (modelShell.classList.contains('is-photoreal')) syncPhotorealCamera();
});

document.addEventListener('visibilitychange', () => {
    mobility.lastFrameTime = performance.now();
    if (!document.hidden) paintMovingAgents();
});

heightScale.addEventListener('input', updateHeightScale);

presetButtons.forEach((button) => {
    button.addEventListener('click', () => flyToPreset(button.dataset.preset));
});

lightButtons.forEach((button) => {
    button.addEventListener('click', () => setLighting(button.dataset.light));
});

imageryButtons.forEach((button) => {
    button.addEventListener('click', () => setImageryMode(button.dataset.imagery));
});

rendererButtons.forEach((button) => {
    button.addEventListener('click', () => {
        if (button.dataset.renderer === 'photoreal') requestPhotorealRenderer();
        else showModelRenderer();
    });
});

enablePhotorealButton.addEventListener('click', (event) => {
    event.preventDefault();
    enablePhotorealRenderer(googleTilesKey.value.trim());
});

photorealSetup.addEventListener('close', () => {
    if (!modelShell.classList.contains('is-photoreal')) setRendererButtons('model');
});

mobilityButtons.forEach((button) => {
    button.addEventListener('click', () => setMobilityEnabled(button.dataset.mobility === 'on'));
});

trainButtons.forEach((button) => {
    button.addEventListener('click', () => setTrainsEnabled(button.dataset.trains === 'on'));
});

trafficDensity.addEventListener('input', updateTrafficDensity);

panelToggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const panelName = button.dataset.panelToggle;
        if (inspector.classList.contains('is-open') && button.classList.contains('is-active')) {
            closePanel();
            return;
        }
        openPanel(panelName);
    });
});

document.querySelector('[data-action="close-inspector"]').addEventListener('click', closePanel);

document.querySelector('[data-action="tilt-down"]').addEventListener('click', () => {
    map.easeTo({ pitch: Math.max(20, map.getPitch() - 10), duration: 420 });
});

document.querySelector('[data-action="tilt-up"]').addEventListener('click', () => {
    map.easeTo({ pitch: Math.min(85, map.getPitch() + 10), duration: 420 });
});

document.querySelector('[data-action="reset-north"]').addEventListener('click', () => {
    map.easeTo({ bearing: 0, duration: 520 });
});
