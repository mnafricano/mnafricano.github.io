(function () {
    const canvas = document.querySelector('[data-map-canvas]');
    const ctx = canvas.getContext('2d');
    const dioramaCanvas = document.querySelector('[data-diorama-canvas]');
    const dtx = dioramaCanvas.getContext('2d');
    const mapFrame = document.querySelector('[data-map-frame]');
    const viewModeButtons = Array.from(document.querySelectorAll('[data-view-mode]'));
    const citySelect = document.querySelector('[data-city-select]');
    const scenarioSelect = document.querySelector('[data-scenario-select]');
    const hourSlider = document.querySelector('[data-hour-slider]');
    const hourOutput = document.querySelector('[data-hour-output]');
    const cityTitle = document.querySelector('[data-city-title]');
    const playToggle = document.querySelector('[data-play-toggle]');
    const toggleAll = document.querySelector('[data-toggle-all]');
    const dataImport = document.querySelector('[data-data-import]');
    const loadSample = document.querySelector('[data-load-sample]');
    const feedForm = document.querySelector('[data-feed-form]');
    const feedUrl = document.querySelector('[data-feed-url]');
    const feedType = document.querySelector('[data-feed-type]');
    const feedMessage = document.querySelector('[data-feed-message]');
    const loadCityTraffic = document.querySelector('[data-load-city-traffic]');
    const loadCityPedestrians = document.querySelector('[data-load-city-pedestrians]');
    const autoRefreshTraffic = document.querySelector('[data-auto-refresh-traffic]');
    const presetMessage = document.querySelector('[data-preset-message]');
    const pedestrianPresetMessage = document.querySelector('[data-pedestrian-preset-message]');
    const acsForm = document.querySelector('[data-acs-form]');
    const acsYear = document.querySelector('[data-acs-year]');
    const acsState = document.querySelector('[data-acs-state]');
    const acsCounty = document.querySelector('[data-acs-county]');
    const acsMessage = document.querySelector('[data-acs-message]');
    const importStatus = document.querySelector('[data-import-status]');
    const importCopy = document.querySelector('[data-import-copy]');
    const sourceGrid = document.querySelector('[data-source-grid]');
    const applyCityStack = document.querySelector('[data-apply-city-stack]');
    const resetInterventions = document.querySelector('[data-reset-interventions]');
    const scoreMetric = document.querySelector('[data-score-metric]');
    const scoreDelta = document.querySelector('[data-score-delta]');
    const recommendationTitle = document.querySelector('[data-recommendation-title]');
    const recommendationCopy = document.querySelector('[data-recommendation-copy]');
    const tradeoffTitle = document.querySelector('[data-tradeoff-title]');
    const tradeoffCopy = document.querySelector('[data-tradeoff-copy]');
    const procurementTitle = document.querySelector('[data-procurement-title]');
    const procurementCopy = document.querySelector('[data-procurement-copy]');
    const copyReport = document.querySelector('[data-copy-report]');
    const saveScenario = document.querySelector('[data-save-scenario]');
    const exportScenario = document.querySelector('[data-export-scenario]');
    const scenarioLibrary = document.querySelector('[data-scenario-library]');
    const mapStatus = document.querySelector('[data-map-status]');
    const trafficStatus = document.querySelector('[data-traffic-status]');
    const incomeStatus = document.querySelector('[data-income-status]');
    const delayMetric = document.querySelector('[data-delay-metric]');
    const delayDelta = document.querySelector('[data-delay-delta]');
    const comfortMetric = document.querySelector('[data-comfort-metric]');
    const comfortDelta = document.querySelector('[data-comfort-delta]');
    const equityMetric = document.querySelector('[data-equity-metric]');
    const equityDelta = document.querySelector('[data-equity-delta]');
    const corridorInsight = document.querySelector('[data-corridor-insight]');
    const corridorCopy = document.querySelector('[data-corridor-copy]');
    const equityInsight = document.querySelector('[data-equity-insight]');
    const equityCopy = document.querySelector('[data-equity-copy]');

    const cities = {
        chicago: {
            name: 'Chicago core',
            title: 'Chicago core mobility model',
            center: { lat: 41.8781, lng: -87.6298 },
            zoom: 13,
            baseline: { delay: 22, comfort: 61, equity: 58 },
            acs: { state: '17', county: '031' },
            corridor: 'Lake Shore to Loop pressure',
            equity: 'South and West access gap',
            traffic: [
                [[0.16, 0.42], [0.34, 0.36], [0.54, 0.38], [0.78, 0.31]],
                [[0.18, 0.64], [0.38, 0.58], [0.64, 0.57], [0.86, 0.51]],
                [[0.48, 0.12], [0.50, 0.32], [0.50, 0.58], [0.52, 0.82]]
            ],
            pedestrians: [[0.51, 0.45], [0.57, 0.52], [0.46, 0.5], [0.62, 0.41], [0.42, 0.58]],
            income: [[0.68, 0.26, 0.2, 0.16, 0.86], [0.35, 0.42, 0.24, 0.2, 0.58], [0.28, 0.68, 0.22, 0.18, 0.42]],
            transit: [[0.28, 0.2], [0.42, 0.34], [0.53, 0.46], [0.66, 0.62], [0.74, 0.78]]
        },
        sf: {
            name: 'San Francisco bayfront',
            title: 'San Francisco bayfront mobility model',
            center: { lat: 37.7749, lng: -122.4194 },
            zoom: 13,
            baseline: { delay: 19, comfort: 68, equity: 62 },
            acs: { state: '06', county: '075' },
            corridor: 'Market Street overload',
            equity: 'Bayview connection gap',
            traffic: [
                [[0.14, 0.62], [0.32, 0.51], [0.53, 0.43], [0.78, 0.33]],
                [[0.2, 0.36], [0.4, 0.44], [0.63, 0.5], [0.82, 0.61]],
                [[0.36, 0.18], [0.42, 0.36], [0.49, 0.58], [0.56, 0.8]]
            ],
            pedestrians: [[0.46, 0.43], [0.52, 0.38], [0.58, 0.48], [0.38, 0.54], [0.64, 0.58]],
            income: [[0.3, 0.38, 0.22, 0.18, 0.72], [0.6, 0.3, 0.22, 0.16, 0.84], [0.68, 0.68, 0.22, 0.18, 0.48]],
            transit: [[0.18, 0.56], [0.36, 0.5], [0.54, 0.43], [0.7, 0.37], [0.82, 0.32]]
        },
        nyc: {
            name: 'New York midtown',
            title: 'New York midtown mobility model',
            center: { lat: 40.758, lng: -73.9855 },
            zoom: 14,
            baseline: { delay: 27, comfort: 55, equity: 66 },
            acs: { state: '36', county: '061' },
            corridor: 'Cross-town bus crawl',
            equity: 'Outer-borough commute penalty',
            traffic: [
                [[0.12, 0.35], [0.34, 0.32], [0.58, 0.34], [0.88, 0.3]],
                [[0.11, 0.58], [0.35, 0.55], [0.62, 0.57], [0.9, 0.52]],
                [[0.25, 0.15], [0.34, 0.38], [0.47, 0.62], [0.58, 0.86]]
            ],
            pedestrians: [[0.48, 0.34], [0.55, 0.42], [0.62, 0.5], [0.42, 0.55], [0.68, 0.63]],
            income: [[0.5, 0.36, 0.24, 0.18, 0.9], [0.64, 0.58, 0.2, 0.16, 0.76], [0.28, 0.68, 0.22, 0.18, 0.52]],
            transit: [[0.22, 0.28], [0.36, 0.38], [0.5, 0.48], [0.64, 0.58], [0.78, 0.68]]
        }
    };

    const scenarios = {
        baseline: { delay: 0, comfort: 0, equity: 0, speed: 1, label: 'Baseline weekday' },
        busPriority: { delay: -18, comfort: 5, equity: 8, speed: 0.72, label: 'Bus priority lanes' },
        pedestrianDistrict: { delay: 6, comfort: 22, equity: 4, speed: 0.84, label: 'Pedestrian district' },
        equityAccess: { delay: -7, comfort: 8, equity: 19, speed: 0.9, label: 'Equity access investment' }
    };

    const sourceStacks = {
        chicago: [
            {
                layer: 'Base map',
                name: 'OpenStreetMap tiles',
                detail: 'Street grid and place context rendered directly in the browser.',
                status: 'ready',
                statusLabel: 'Live'
            },
            {
                layer: 'Income',
                name: 'ACS 5-year tract income',
                detail: 'Census API template for B19013 median household income by Cook County tract.',
                status: 'adapter',
                statusLabel: 'Adapter'
            },
            {
                layer: 'Traffic',
                name: 'Chicago Traffic Tracker segments',
                detail: 'Verified Socrata adapter for current arterial segment speeds from CTA bus GPS traces.',
                status: 'ready',
                statusLabel: 'Live preset'
            },
            {
                layer: 'Pedestrian',
                name: 'Ped counts or camera analytics',
                detail: 'Public count dataset was not found in the Chicago portal during verification; use manual studies or privacy-safe counter feeds.',
                status: 'gated',
                statusLabel: 'Procure counts'
            },
            {
                layer: 'Transit',
                name: 'CTA/Metra GTFS',
                detail: 'Stops and route access can be loaded as GTFS-derived CSV or GeoJSON.',
                status: 'adapter',
                statusLabel: 'Adapter'
            }
        ],
        sf: [
            {
                layer: 'Base map',
                name: 'OpenStreetMap tiles',
                detail: 'Bayfront street and shoreline context rendered live.',
                status: 'ready',
                statusLabel: 'Live'
            },
            {
                layer: 'Income',
                name: 'ACS 5-year tract income',
                detail: 'Census API template for San Francisco County median household income.',
                status: 'adapter',
                statusLabel: 'Adapter'
            },
            {
                layer: 'Traffic',
                name: 'SFMTA / open-data speeds',
                detail: 'Public portal has traffic-adjacent datasets; live speed telemetry should be procured or connected by agency feed.',
                status: 'gated',
                statusLabel: 'Procure live'
            },
            {
                layer: 'Pedestrian',
                name: 'Downtown pedestrian counters',
                detail: 'Public portal exposes safety and traffic-adjacent datasets, but a live pedestrian-volume feed needs an agency/vendor connector.',
                status: 'gated',
                statusLabel: 'Procure counts'
            },
            {
                layer: 'Transit',
                name: 'Muni/BART GTFS',
                detail: 'GTFS-derived stops and route coverage for access metrics.',
                status: 'adapter',
                statusLabel: 'Adapter'
            }
        ],
        nyc: [
            {
                layer: 'Base map',
                name: 'OpenStreetMap tiles',
                detail: 'Midtown streets and civic landmarks rendered live.',
                status: 'ready',
                statusLabel: 'Live'
            },
            {
                layer: 'Income',
                name: 'ACS 5-year tract income',
                detail: 'Census API template for New York County median household income.',
                status: 'adapter',
                statusLabel: 'Adapter'
            },
            {
                layer: 'Traffic',
                name: 'NYC DOT traffic speeds',
                detail: 'Verified Socrata adapter for DOT speed and travel-time rows with link geometry.',
                status: 'ready',
                statusLabel: 'Live preset'
            },
            {
                layer: 'Pedestrian',
                name: 'NYC DOT bi-annual pedestrian counts',
                detail: 'Verified official count locations with recent AM, midday, and PM pedestrian volumes.',
                status: 'ready',
                statusLabel: 'Count preset'
            },
            {
                layer: 'Transit',
                name: 'MTA GTFS',
                detail: 'Subway, bus, and rail access can be derived from GTFS feeds.',
                status: 'adapter',
                statusLabel: 'Adapter'
            }
        ]
    };

    const layers = {
        traffic: true,
        pedestrians: true,
        income: true,
        transit: true
    };

    const defaultInterventions = {
        roadDiet: 20,
        transitBoost: 35,
        safety: 30,
        equityInvestment: 25
    };
    const storageKey = 'civicTwinScenarios';
    const trafficRefreshMs = 60000;
    const liveTrafficPresets = {
        chicago: {
            name: 'Chicago Traffic Tracker segments',
            url: 'https://data.cityofchicago.org/resource/n4j6-wkkf.json?$limit=500',
            note: 'Chicago Traffic Tracker segment speeds are refreshed by the city about every 15 minutes.'
        },
        sf: {
            name: 'San Francisco live speed connector',
            url: '',
            note: 'No comparable public live speed feed is wired for SF yet. Use manual import or procure SFMTA/vendor speed telemetry.'
        },
        nyc: {
            name: 'NYC DOT Traffic Speeds',
            url: 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json?$limit=500',
            note: 'NYC DOT Traffic Speeds publishes live roadway speed records with line geometry.'
        }
    };
    const pedestrianPresets = {
        chicago: {
            name: 'Chicago pedestrian count connector',
            url: '',
            note: 'No official public pedestrian-volume count feed was verified for Chicago. Use manual studies, counters, or vendor telemetry.'
        },
        sf: {
            name: 'San Francisco pedestrian count connector',
            url: '',
            note: 'No official public pedestrian-volume count feed was verified for SF. Use SFMTA studies, counters, or vendor telemetry.'
        },
        nyc: {
            name: 'NYC DOT bi-annual pedestrian counts',
            url: 'https://data.cityofnewyork.us/resource/cqsj-cfgu.json?$limit=500',
            note: 'NYC DOT pedestrian counts are official count locations updated about every six months.'
        }
    };

    const tileCache = new Map();
    let running = true;
    let tick = 0;
    let viewMode = 'diorama';
    let trafficRefreshTimer = 0;
    let importedRecords = 0;
    let importedFeed = {
        trafficRoutes: [],
        trafficPoints: [],
        pedestrianPoints: [],
        incomeBlocks: [],
        transitStops: [],
        geojson: [],
        incomeByTract: {}
    };

    function lonToTile(lon, zoom) {
        return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
    }

    function latToTile(lat, zoom) {
        const rad = lat * Math.PI / 180;
        return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom));
    }

    function lngToWorldX(lng, zoom) {
        return ((lng + 180) / 360) * Math.pow(2, zoom) * 256;
    }

    function latToWorldY(lat, zoom) {
        const rad = lat * Math.PI / 180;
        return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom) * 256;
    }

    function latLngToCanvas(lat, lng, width, height, city) {
        const centerX = lngToWorldX(city.center.lng, city.zoom);
        const centerY = latToWorldY(city.center.lat, city.zoom);
        return [
            width / 2 + lngToWorldX(lng, city.zoom) - centerX,
            height / 2 + latToWorldY(lat, city.zoom) - centerY
        ];
    }

    function tileUrl(x, y, z) {
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }

    function getTile(x, y, z) {
        const key = `${z}/${x}/${y}`;
        if (tileCache.has(key)) {
            return tileCache.get(key);
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            mapStatus.textContent = 'OpenStreetMap tiles live';
            draw();
        };
        img.onerror = function () {
            mapStatus.textContent = 'Offline street-grid fallback';
            draw();
        };
        img.src = tileUrl(x, y, z);
        tileCache.set(key, img);
        return img;
    }

    function resizeCanvas() {
        resizeOneCanvas(canvas, ctx);
        resizeOneCanvas(dioramaCanvas, dtx);
        draw();
    }

    function resizeOneCanvas(targetCanvas, targetContext) {
        const rect = targetCanvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        targetCanvas.width = Math.max(960, Math.round(rect.width * ratio));
        targetCanvas.height = Math.max(620, Math.round(rect.height * ratio));
        targetContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function currentCity() {
        return cities[citySelect.value];
    }

    function currentScenario() {
        return scenarios[scenarioSelect.value];
    }

    function setViewMode(nextMode) {
        viewMode = ['diorama', 'split', 'map'].includes(nextMode) ? nextMode : 'diorama';
        mapFrame.dataset.view = viewMode;
        viewModeButtons.forEach(function (button) {
            button.setAttribute('aria-pressed', button.dataset.viewMode === viewMode ? 'true' : 'false');
        });
        draw();
    }

    function hourFactor() {
        const hour = Number(hourSlider.value);
        if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
            return 1.28;
        }
        if (hour >= 11 && hour <= 14) {
            return 1.05;
        }
        if (hour >= 20 || hour <= 5) {
            return 0.68;
        }
        return 0.88;
    }

    function formatHour(hour) {
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const normalized = hour % 12 || 12;
        return `${normalized}:00 ${suffix}`;
    }

    function currentInterventions() {
        return Object.keys(defaultInterventions).reduce(function (next, key) {
            const input = document.querySelector(`[data-intervention="${key}"]`);
            next[key] = input ? Number(input.value) : defaultInterventions[key];
            return next;
        }, {});
    }

    function interventionFactor(key) {
        return currentInterventions()[key] / 100;
    }

    function updateInterventionOutputs() {
        Object.keys(defaultInterventions).forEach(function (key) {
            const input = document.querySelector(`[data-intervention="${key}"]`);
            const output = document.querySelector(`[data-intervention-output="${key}"]`);
            if (input && output) {
                output.textContent = `${input.value}%`;
            }
        });
    }

    function scenarioImpact(load) {
        const scenario = currentScenario();
        const roadDiet = interventionFactor('roadDiet');
        const transitBoost = interventionFactor('transitBoost');
        const safety = interventionFactor('safety');
        const equityInvestment = interventionFactor('equityInvestment');
        const delayLift = scenario.delay + roadDiet * 10 - transitBoost * 18 - equityInvestment * 4;
        const comfortLift = scenario.comfort + safety * 24 + roadDiet * 6 + transitBoost * 4 - Math.max(0, load - 1) * 8;
        const equityLift = scenario.equity + equityInvestment * 28 + transitBoost * 8 + safety * 4;
        const implementationRisk = roadDiet * 18 + equityInvestment * 7 - transitBoost * 5;
        const implementationScore = Math.max(0, Math.min(100, Math.round(70 + transitBoost * 14 + safety * 10 + equityInvestment * 8 - implementationRisk)));
        return { delayLift, comfortLift, equityLift, implementationScore };
    }

    function drawBaseMap(city, width, height) {
        const zoom = city.zoom;
        const tileSize = 256;
        const centerPx = {
            x: lngToWorldX(city.center.lng, zoom),
            y: latToWorldY(city.center.lat, zoom)
        };
        const startPx = {
            x: centerPx.x - width / 2,
            y: centerPx.y - height / 2
        };
        const startTileX = Math.floor(startPx.x / tileSize);
        const startTileY = Math.floor(startPx.y / tileSize);
        const endTileX = Math.ceil((startPx.x + width) / tileSize);
        const endTileY = Math.ceil((startPx.y + height) / tileSize);

        ctx.fillStyle = '#1a2022';
        ctx.fillRect(0, 0, width, height);

        for (let y = startTileY; y <= endTileY; y += 1) {
            for (let x = startTileX; x <= endTileX; x += 1) {
                const tile = getTile(x, y, zoom);
                const dx = x * tileSize - startPx.x;
                const dy = y * tileSize - startPx.y;
                if (tile.complete && tile.naturalWidth) {
                    ctx.globalAlpha = 0.72;
                    ctx.drawImage(tile, dx, dy, tileSize, tileSize);
                } else {
                    drawGridFallback(dx, dy, tileSize);
                }
            }
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(16, 18, 20, 0.3)';
        ctx.fillRect(0, 0, width, height);
    }

    function drawGridFallback(x, y, size) {
        ctx.fillStyle = '#1f2527';
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = 'rgba(244, 239, 230, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= size; i += 32) {
            ctx.beginPath();
            ctx.moveTo(x + i, y);
            ctx.lineTo(x + i + 28, y + size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y + i);
            ctx.lineTo(x + size, y + i + 18);
            ctx.stroke();
        }
    }

    function point(pair, width, height) {
        return [pair[0] * width, pair[1] * height];
    }

    function drawIncome(city, width, height) {
        if (!layers.income) return;
        city.income.forEach(function (block) {
            const x = block[0] * width;
            const y = block[1] * height;
            const w = block[2] * width;
            const h = block[3] * height;
            const income = block[4];
            ctx.fillStyle = `rgba(211, 154, 74, ${0.08 + income * 0.24})`;
            ctx.strokeStyle = `rgba(211, 154, 74, ${0.22 + income * 0.28})`;
            ctx.lineWidth = 2;
            ctx.fillRect(x - w / 2, y - h / 2, w, h);
            ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        });

        importedFeed.incomeBlocks.forEach(function (block) {
            const p = latLngToCanvas(block.lat, block.lng, width, height, city);
            const size = Math.max(28, Math.min(120, 36 + block.value * 72));
            ctx.fillStyle = `rgba(211, 154, 74, ${0.12 + block.value * 0.28})`;
            ctx.strokeStyle = `rgba(211, 154, 74, ${0.34 + block.value * 0.3})`;
            ctx.lineWidth = 2;
            ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
            ctx.strokeRect(p[0] - size / 2, p[1] - size / 2, size, size);
        });
    }

    function drawTraffic(city, width, height) {
        if (!layers.traffic) return;
        const load = hourFactor();
        const scenario = currentScenario();
        city.traffic.forEach(function (route, routeIndex) {
            ctx.beginPath();
            route.forEach(function (raw, index) {
                const p = point(raw, width, height);
                if (index === 0) {
                    ctx.moveTo(p[0], p[1]);
                } else {
                    ctx.lineTo(p[0], p[1]);
                }
            });
            const intensity = Math.min(1, load * (0.54 + routeIndex * 0.14) * scenario.speed);
            ctx.strokeStyle = `rgba(226, 118, 104, ${0.38 + intensity * 0.42})`;
            ctx.lineWidth = 8 + intensity * 14;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(226, 118, 104, 0.34)';
            ctx.shadowBlur = 18;
            ctx.stroke();
            ctx.shadowBlur = 0;
        });

        importedFeed.trafficRoutes.forEach(function (route) {
            drawProjectedRoute(route.points, width, height, city, 'rgba(226, 118, 104, 0.82)', 8 + route.value * 14);
        });

        importedFeed.trafficPoints.forEach(function (sensor) {
            const p = latLngToCanvas(sensor.lat, sensor.lng, width, height, city);
            ctx.fillStyle = `rgba(226, 118, 104, ${0.42 + sensor.value * 0.44})`;
            ctx.beginPath();
            ctx.arc(p[0], p[1], 8 + sensor.value * 16, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawPedestrians(city, width, height) {
        if (!layers.pedestrians) return;
        city.pedestrians.forEach(function (raw, index) {
            const p = point(raw, width, height);
            const pulse = Math.sin(tick / 22 + index * 1.7) * 0.5 + 0.5;
            const radius = 24 + pulse * 18;
            const gradient = ctx.createRadialGradient(p[0], p[1], 2, p[0], p[1], radius);
            gradient.addColorStop(0, 'rgba(72, 182, 166, 0.76)');
            gradient.addColorStop(1, 'rgba(72, 182, 166, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(244, 239, 230, 0.86)';
            ctx.beginPath();
            ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
            ctx.fill();
        });

        importedFeed.pedestrianPoints.forEach(function (sensor, index) {
            const p = latLngToCanvas(sensor.lat, sensor.lng, width, height, city);
            const pulse = Math.sin(tick / 18 + index) * 0.5 + 0.5;
            const radius = 18 + sensor.value * 28 + pulse * 10;
            const gradient = ctx.createRadialGradient(p[0], p[1], 2, p[0], p[1], radius);
            gradient.addColorStop(0, 'rgba(72, 182, 166, 0.82)');
            gradient.addColorStop(1, 'rgba(72, 182, 166, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawTransit(city, width, height) {
        if (!layers.transit) return;
        ctx.strokeStyle = 'rgba(118, 169, 216, 0.72)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        city.transit.forEach(function (raw, index) {
            const p = point(raw, width, height);
            if (index === 0) {
                ctx.moveTo(p[0], p[1]);
            } else {
                ctx.lineTo(p[0], p[1]);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);
        city.transit.forEach(function (raw) {
            const p = point(raw, width, height);
            ctx.fillStyle = '#76a9d8';
            ctx.strokeStyle = 'rgba(16, 18, 20, 0.82)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        importedFeed.transitStops.forEach(function (stop) {
            const p = latLngToCanvas(stop.lat, stop.lng, width, height, city);
            ctx.fillStyle = '#76a9d8';
            ctx.strokeStyle = 'rgba(16, 18, 20, 0.82)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.rect(p[0] - 6, p[1] - 6, 12, 12);
            ctx.fill();
            ctx.stroke();
        });
    }

    function drawProjectedRoute(points, width, height, city, stroke, lineWidth) {
        if (!points || points.length < 2) return;
        ctx.beginPath();
        points.forEach(function (pointValue, index) {
            const p = latLngToCanvas(pointValue.lat, pointValue.lng, width, height, city);
            if (index === 0) {
                ctx.moveTo(p[0], p[1]);
            } else {
                ctx.lineTo(p[0], p[1]);
            }
        });
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    function drawGeoJson(width, height, city) {
        importedFeed.geojson.forEach(function (feature) {
            const geometry = feature.geometry;
            const props = feature.properties || {};
            const kind = String(props.layer || props.type || '').toLowerCase();
            const isTraffic = kind.includes('traffic') || props.speed || props.volume || props.delay || props.congestion;
            const isIncome = kind.includes('income') || props.income || props.median_income || props.ami;
            const isPedestrian = kind.includes('ped') || props.pedestrian || props.flow || props.count;
            if (isTraffic && !layers.traffic) return;
            if (isIncome && !layers.income) return;
            if (isPedestrian && !layers.pedestrians) return;
            if (!isTraffic && !isIncome && !isPedestrian && !layers.transit) return;
            const color = isTraffic ? '226, 118, 104' : isIncome ? incomeColor(props) : isPedestrian ? '72, 182, 166' : '118, 169, 216';
            const lineWidth = isTraffic ? 7 : 3;

            if (!geometry) return;
            if (geometry.type === 'LineString') {
                drawGeoLine(geometry.coordinates, width, height, city, color, lineWidth);
            }
            if (geometry.type === 'MultiLineString') {
                geometry.coordinates.forEach(function (line) {
                    drawGeoLine(line, width, height, city, color, lineWidth);
                });
            }
            if (geometry.type === 'Polygon') {
                drawGeoPolygon(geometry.coordinates, width, height, city, color);
            }
            if (geometry.type === 'MultiPolygon') {
                geometry.coordinates.forEach(function (polygon) {
                    drawGeoPolygon(polygon, width, height, city, color);
                });
            }
            if (geometry.type === 'Point') {
                const p = latLngToCanvas(geometry.coordinates[1], geometry.coordinates[0], width, height, city);
                ctx.fillStyle = `rgba(${color}, 0.72)`;
                ctx.beginPath();
                ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    function drawGeoLine(coordinates, width, height, city, color, lineWidth) {
        if (!coordinates || coordinates.length < 2) return;
        ctx.beginPath();
        coordinates.forEach(function (coordinate, index) {
            const p = latLngToCanvas(coordinate[1], coordinate[0], width, height, city);
            if (index === 0) {
                ctx.moveTo(p[0], p[1]);
            } else {
                ctx.lineTo(p[0], p[1]);
            }
        });
        ctx.strokeStyle = `rgba(${color}, 0.8)`;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    function drawGeoPolygon(rings, width, height, city, color) {
        if (!rings || !rings[0]) return;
        ctx.beginPath();
        rings[0].forEach(function (coordinate, index) {
            const p = latLngToCanvas(coordinate[1], coordinate[0], width, height, city);
            if (index === 0) {
                ctx.moveTo(p[0], p[1]);
            } else {
                ctx.lineTo(p[0], p[1]);
            }
        });
        ctx.closePath();
        ctx.fillStyle = `rgba(${color}, 0.22)`;
        ctx.strokeStyle = `rgba(${color}, 0.62)`;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    }

    function incomeColor(props) {
        const income = Number(props.income || props.median_income || props.ami || 0);
        if (!Number.isFinite(income) || income <= 0) return '211, 154, 74';
        const value = Math.max(0.18, Math.min(1, income / 180000));
        return `${Math.round(168 + value * 87)}, ${Math.round(98 + value * 58)}, ${Math.round(58 - value * 18)}`;
    }

    function drawParticles(city, width, height) {
        if (!layers.traffic || !running) return;
        city.traffic.forEach(function (route, routeIndex) {
            for (let i = 0; i < 4; i += 1) {
                const localTick = (tick * (0.0025 + routeIndex * 0.0005) + i * 0.25) % 1;
                const segment = Math.min(route.length - 2, Math.floor(localTick * (route.length - 1)));
                const progress = (localTick * (route.length - 1)) - segment;
                const a = point(route[segment], width, height);
                const b = point(route[segment + 1], width, height);
                const x = a[0] + (b[0] - a[0]) * progress;
                const y = a[1] + (b[1] - a[1]) * progress;
                ctx.fillStyle = 'rgba(244, 239, 230, 0.82)';
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    function isoPoint(x, y, z, width, height) {
        const scale = Math.min(width / 980, height / 650);
        return [
            width * 0.51 + (x - y) * 0.68 * scale,
            height * 0.57 + (x + y) * 0.34 * scale - z * scale
        ];
    }

    function drawIsoPolygon(points, fill, stroke) {
        dtx.beginPath();
        points.forEach(function (pointValue, index) {
            if (index === 0) {
                dtx.moveTo(pointValue[0], pointValue[1]);
            } else {
                dtx.lineTo(pointValue[0], pointValue[1]);
            }
        });
        dtx.closePath();
        dtx.fillStyle = fill;
        dtx.fill();
        if (stroke) {
            dtx.strokeStyle = stroke;
            dtx.lineWidth = 1;
            dtx.stroke();
        }
    }

    function drawIsoRect(x, y, widthValue, depthValue, fill, stroke, canvasWidth, canvasHeight) {
        drawIsoPolygon([
            isoPoint(x, y, 0, canvasWidth, canvasHeight),
            isoPoint(x + widthValue, y, 0, canvasWidth, canvasHeight),
            isoPoint(x + widthValue, y + depthValue, 0, canvasWidth, canvasHeight),
            isoPoint(x, y + depthValue, 0, canvasWidth, canvasHeight)
        ], fill, stroke);
    }

    function shadeColor(hex, shift) {
        const clean = hex.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(clean.slice(0, 2), 16) + shift));
        const g = Math.max(0, Math.min(255, parseInt(clean.slice(2, 4), 16) + shift));
        const b = Math.max(0, Math.min(255, parseInt(clean.slice(4, 6), 16) + shift));
        return `rgb(${r}, ${g}, ${b})`;
    }

    function drawBuilding(x, y, widthValue, depthValue, heightValue, color, canvasWidth, canvasHeight) {
        const base = [
            isoPoint(x, y, 0, canvasWidth, canvasHeight),
            isoPoint(x + widthValue, y, 0, canvasWidth, canvasHeight),
            isoPoint(x + widthValue, y + depthValue, 0, canvasWidth, canvasHeight),
            isoPoint(x, y + depthValue, 0, canvasWidth, canvasHeight)
        ];
        const top = [
            isoPoint(x, y, heightValue, canvasWidth, canvasHeight),
            isoPoint(x + widthValue, y, heightValue, canvasWidth, canvasHeight),
            isoPoint(x + widthValue, y + depthValue, heightValue, canvasWidth, canvasHeight),
            isoPoint(x, y + depthValue, heightValue, canvasWidth, canvasHeight)
        ];
        drawIsoPolygon([base[1], base[2], top[2], top[1]], shadeColor(color, -28), 'rgba(20, 22, 23, 0.24)');
        drawIsoPolygon([base[2], base[3], top[3], top[2]], shadeColor(color, -46), 'rgba(20, 22, 23, 0.22)');
        drawIsoPolygon(top, shadeColor(color, 18), 'rgba(244, 239, 230, 0.18)');

        dtx.fillStyle = 'rgba(244, 239, 230, 0.22)';
        for (let row = 18; row < heightValue - 8; row += 22) {
            const p = isoPoint(x + widthValue + 1, y + depthValue * 0.32, row, canvasWidth, canvasHeight);
            dtx.fillRect(p[0] - 2, p[1] - 2, 8, 3);
        }
    }

    function drawVehicle(x, y, angle, color, length, widthValue, heightValue, canvasWidth, canvasHeight) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const px = -dy;
        const py = dx;
        const halfLength = length / 2;
        const halfWidth = widthValue / 2;
        const corners = [
            [x - dx * halfLength - px * halfWidth, y - dy * halfLength - py * halfWidth],
            [x + dx * halfLength - px * halfWidth, y + dy * halfLength - py * halfWidth],
            [x + dx * halfLength + px * halfWidth, y + dy * halfLength + py * halfWidth],
            [x - dx * halfLength + px * halfWidth, y - dy * halfLength + py * halfWidth]
        ];
        const base = corners.map(function (corner) {
            return isoPoint(corner[0], corner[1], 2, canvasWidth, canvasHeight);
        });
        const top = corners.map(function (corner) {
            return isoPoint(corner[0], corner[1], heightValue, canvasWidth, canvasHeight);
        });
        drawIsoPolygon(base, 'rgba(15, 17, 18, 0.2)');
        drawIsoPolygon([base[1], base[2], top[2], top[1]], shadeColor(color, -36), null);
        drawIsoPolygon([base[2], base[3], top[3], top[2]], shadeColor(color, -52), null);
        drawIsoPolygon(top, color, 'rgba(255, 255, 255, 0.2)');
        const windshield = isoPoint(x + dx * halfLength * 0.18, y + dy * halfLength * 0.18, heightValue + 1, canvasWidth, canvasHeight);
        dtx.fillStyle = 'rgba(209, 236, 242, 0.72)';
        dtx.beginPath();
        dtx.ellipse(windshield[0], windshield[1], 5, 2.2, -0.22, 0, Math.PI * 2);
        dtx.fill();
    }

    function drawPerson(x, y, color, canvasWidth, canvasHeight, phase) {
        const p = isoPoint(x, y, 10, canvasWidth, canvasHeight);
        const foot = isoPoint(x, y, 0, canvasWidth, canvasHeight);
        dtx.strokeStyle = 'rgba(16, 18, 20, 0.55)';
        dtx.lineWidth = 1.4;
        dtx.beginPath();
        dtx.moveTo(foot[0], foot[1]);
        dtx.lineTo(p[0], p[1] + 3);
        dtx.stroke();
        dtx.fillStyle = color;
        dtx.beginPath();
        dtx.arc(p[0], p[1], 3.2 + Math.sin(phase) * 0.4, 0, Math.PI * 2);
        dtx.fill();
    }

    function drawCrosswalk(x, y, widthValue, depthValue, stripes, canvasWidth, canvasHeight) {
        for (let i = 0; i < stripes; i += 1) {
            const offset = (i / stripes) * widthValue;
            drawIsoRect(x + offset, y, widthValue / (stripes * 2.4), depthValue, 'rgba(244, 239, 230, 0.72)', null, canvasWidth, canvasHeight);
        }
    }

    function drawDiorama(city, width, height) {
        const load = hourFactor();
        const impact = scenarioImpact(load);
        const interventions = currentInterventions();
        const carPalette = ['#45c2d7', '#d95868', '#f1c04f', '#8be16e', '#d477bd', '#f4efe6', '#69a7ff', '#ff8a55'];
        const buildingPalette = citySelect.value === 'sf'
            ? ['#b36f66', '#5f8e83', '#cfb784', '#6d7880']
            : citySelect.value === 'nyc'
                ? ['#69747d', '#9b655e', '#51677a', '#b9a26d']
                : ['#8e4f4b', '#5b7580', '#b58b58', '#677f68'];

        dtx.clearRect(0, 0, width, height);
        const sky = dtx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#b8c7c2');
        sky.addColorStop(0.5, '#87938f');
        sky.addColorStop(1, '#646f6c');
        dtx.fillStyle = sky;
        dtx.fillRect(0, 0, width, height);

        drawIsoRect(-610, -430, 1220, 860, '#7f8e87', null, width, height);

        if (layers.income) {
            city.income.forEach(function (block, index) {
                const income = block[4];
                const bx = -480 + index * 300;
                const by = index === 1 ? 120 : -360 + index * 90;
                drawIsoRect(bx, by, 210, 170, `rgba(211, 154, 74, ${0.12 + income * 0.2})`, 'rgba(211, 154, 74, 0.28)', width, height);
            });
        }

        drawIsoRect(-650, -78, 1300, 156, '#596462', 'rgba(244, 239, 230, 0.08)', width, height);
        drawIsoRect(-78, -460, 156, 920, '#5c6664', 'rgba(244, 239, 230, 0.08)', width, height);
        drawIsoRect(-650, -9, 1300, 18, 'rgba(244, 239, 230, 0.22)', null, width, height);
        drawIsoRect(-9, -460, 18, 920, 'rgba(244, 239, 230, 0.2)', null, width, height);

        drawCrosswalk(-118, -126, 236, 34, 8, width, height);
        drawCrosswalk(-118, 92, 236, 34, 8, width, height);
        drawCrosswalk(-126, -118, 34, 236, 8, width, height);
        drawCrosswalk(92, -118, 34, 236, 8, width, height);

        const blocks = [
            [-520, -380, 210, 190, 130],
            [-260, -380, 175, 170, 82],
            [180, -390, 230, 180, 170],
            [420, -350, 160, 210, 96],
            [-520, 170, 220, 190, 72],
            [-250, 180, 185, 170, 108],
            [175, 160, 210, 180, 90],
            [420, 150, 170, 220, 150]
        ];
        blocks.forEach(function (block, index) {
            drawBuilding(block[0], block[1], block[2], block[3], block[4], buildingPalette[index % buildingPalette.length], width, height);
        });

        const effectiveTraffic = Math.max(10, Math.round(24 * load + interventions.roadDiet * 0.12 - interventions.transitBoost * 0.12 + Math.max(0, impact.delayLift) * 0.4));
        if (layers.traffic) {
            for (let i = 0; i < effectiveTraffic; i += 1) {
                const progress = ((running ? tick : 0) * (0.003 + i % 5 * 0.00045) + i * 0.071) % 1;
                const lane = i % 4;
                const horizontal = lane < 2;
                const direction = lane % 2 === 0 ? 1 : -1;
                const x = horizontal ? -610 + progress * 1220 : direction * 42;
                const y = horizontal ? direction * 42 : -430 + progress * 860;
                drawVehicle(
                    direction === 1 ? x : -x,
                    direction === 1 ? y : -y,
                    horizontal ? 0 : Math.PI / 2,
                    carPalette[i % carPalette.length],
                    i % 7 === 0 ? 64 : 36,
                    i % 7 === 0 ? 20 : 18,
                    i % 7 === 0 ? 18 : 13,
                    width,
                    height
                );
            }
        }

        if (layers.transit) {
            const busOffset = ((running ? tick : 0) * (0.0025 + interventions.transitBoost / 50000)) % 1;
            drawVehicle(-600 + busOffset * 1200, -6, 0, '#f05f68', 92, 25, 22, width, height);
            drawIsoRect(-590, -135, 1180, 14, 'rgba(118, 169, 216, 0.62)', null, width, height);
            city.transit.forEach(function (raw, index) {
                const stopX = -500 + raw[0] * 1000;
                const stopY = -150 + raw[1] * 300;
                const p = isoPoint(stopX, stopY, 8, width, height);
                dtx.fillStyle = '#76a9d8';
                dtx.beginPath();
                dtx.arc(p[0], p[1], 5.5, 0, Math.PI * 2);
                dtx.fill();
                if (index % 2 === 0) {
                    dtx.fillStyle = 'rgba(244, 239, 230, 0.8)';
                    dtx.fillRect(p[0] + 6, p[1] - 12, 14, 4);
                }
            });
        }

        if (layers.pedestrians) {
            const pedCount = Math.round(18 + interventions.safety * 0.12 + (currentScenario().comfort || 0) * 0.4);
            for (let i = 0; i < pedCount; i += 1) {
                const progress = ((running ? tick : 0) * (0.004 + (i % 3) * 0.0008) + i * 0.13) % 1;
                const cross = i % 3 === 0;
                const x = cross ? -112 + progress * 224 : -555 + progress * 1110;
                const y = cross ? 108 + (i % 4) * 6 : (i % 2 === 0 ? -120 : 130);
                drawPerson(x, y, i % 4 === 0 ? '#48b6a6' : i % 4 === 1 ? '#f1c04f' : '#d477bd', width, height, progress * Math.PI * 2);
            }
        }

        dtx.globalAlpha = 0.6;
        dtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        dtx.fillRect(0, 0, width, 1);
        dtx.globalAlpha = 1;

        dtx.fillStyle = 'rgba(16, 18, 20, 0.58)';
        dtx.fillRect(16, 16, Math.min(360, width - 32), 74);
        dtx.fillStyle = '#f4efe6';
        dtx.font = '700 13px Inter, sans-serif';
        dtx.fillText(`${city.name} miniature operations view`, 32, 42);
        dtx.fillStyle = 'rgba(244, 239, 230, 0.72)';
        dtx.font = '12px Inter, sans-serif';
        dtx.fillText(`${currentScenario().label} - ${formatHour(Number(hourSlider.value))} - ${effectiveTraffic} modeled vehicles`, 32, 66);
    }

    function draw() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const city = currentCity();
        if (viewMode !== 'diorama') {
            drawBaseMap(city, width, height);
            drawIncome(city, width, height);
            drawTransit(city, width, height);
            drawGeoJson(width, height, city);
            drawTraffic(city, width, height);
            drawPedestrians(city, width, height);
            drawParticles(city, width, height);
        }
        drawDiorama(city, dioramaCanvas.clientWidth, dioramaCanvas.clientHeight);
    }

    function updateMetrics() {
        const city = currentCity();
        const scenario = currentScenario();
        const load = hourFactor();
        const impact = scenarioImpact(load);
        const delay = Math.max(4, Math.round(city.baseline.delay * load + impact.delayLift));
        const comfort = Math.max(24, Math.min(98, Math.round(city.baseline.comfort + impact.comfortLift)));
        const equity = Math.max(20, Math.min(98, Math.round(city.baseline.equity + impact.equityLift)));
        const delayChange = delay - Math.round(city.baseline.delay * load);

        cityTitle.textContent = city.title;
        hourOutput.textContent = formatHour(Number(hourSlider.value));
        updateInterventionOutputs();
        delayMetric.textContent = `${delay} min`;
        comfortMetric.textContent = `${comfort}%`;
        equityMetric.textContent = `${equity}%`;
        scoreMetric.textContent = String(impact.implementationScore);
        delayDelta.textContent = delayChange === 0 ? 'Baseline' : `${delayChange > 0 ? '+' : ''}${delayChange} min vs baseline`;
        delayDelta.className = delayChange <= 0 ? 'good' : 'bad';
        comfortDelta.textContent = `${comfort - city.baseline.comfort >= 0 ? '+' : ''}${comfort - city.baseline.comfort}% comfort`;
        comfortDelta.className = comfort >= city.baseline.comfort ? 'good' : 'bad';
        equityDelta.textContent = `${equity - city.baseline.equity >= 0 ? '+' : ''}${equity - city.baseline.equity}% access`;
        equityDelta.className = equity >= city.baseline.equity ? 'good' : 'bad';
        scoreDelta.textContent = impact.implementationScore >= 70 ? 'Pilot ready' : 'Needs phasing';
        scoreDelta.className = impact.implementationScore >= 70 ? 'good' : 'bad';
        corridorInsight.textContent = city.corridor;
        corridorCopy.textContent = `${scenario.label} estimates ${delay} minutes of average corridor delay at ${formatHour(Number(hourSlider.value))}.`;
        equityInsight.textContent = city.equity;
        equityCopy.textContent = `${equity}% of lower-income residents are within a modeled 30-minute transit reach.`;
        trafficStatus.textContent = importedRecords ? `${importedRecords} imported records active` : 'Demo traffic feed';
        const joined = joinedIncomeFeatureCount();
        incomeStatus.textContent = joined ? `${joined} ACS tract polygons joined` : importedRecords ? 'Imported overlays active' : 'ACS-ready income layer';
        importStatus.textContent = importedRecords ? `${importedRecords} records loaded` : 'No external feed loaded';
        updateReport(delay, comfort, equity, impact);
    }

    function updateReport(delay, comfort, equity, impact) {
        const interventions = currentInterventions();
        const strongest = Object.keys(interventions).sort(function (a, b) {
            return interventions[b] - interventions[a];
        })[0];
        const labels = {
            roadDiet: 'phase the road diet',
            transitBoost: 'prioritize transit lanes',
            safety: 'fund pedestrian safety',
            equityInvestment: 'target equity access'
        };
        recommendationTitle.textContent = labels[strongest];
        recommendationCopy.textContent = `At ${formatHour(Number(hourSlider.value))}, ${currentCity().name} reaches ${comfort}% pedestrian comfort and ${equity}% equity reach with ${currentScenario().label.toLowerCase()}.`;

        if (impact.delayLift > 0) {
            tradeoffTitle.textContent = 'Vehicle delay rises';
            tradeoffCopy.textContent = `The package improves public-realm outcomes but leaves modeled network delay at ${delay} minutes. Consider transit priority or signal timing to offset capacity loss.`;
        } else {
            tradeoffTitle.textContent = 'Delay is contained';
            tradeoffCopy.textContent = `The package keeps modeled corridor delay at ${delay} minutes while improving comfort and access metrics.`;
        }

        procurementTitle.textContent = importedRecords ? 'Validate imported feeds' : 'Connect authoritative feeds';
        procurementCopy.textContent = importedRecords
            ? `${importedRecords} records are active. Next step: replace sample feeds with signed city data, GTFS exports, ACS tract joins, and live traffic adapters.`
            : 'Next step: connect ACS income tables, live traffic speeds, pedestrian counters, and GTFS-derived transit access before using this for formal decisions.';
    }

    function renderSourceStack() {
        const stack = sourceStacks[citySelect.value] || [];
        sourceGrid.innerHTML = stack.map(function (source) {
            return `
                <article class="source-card">
                    <span>${escapeHtml(source.layer)}</span>
                    <strong>${escapeHtml(source.name)}</strong>
                    <p>${escapeHtml(source.detail)}</p>
                    <small class="${escapeHtml(source.status)}">${escapeHtml(source.statusLabel)}</small>
                </article>
            `;
        }).join('');
    }

    function updateAcsDefaults() {
        const city = currentCity();
        if (!city.acs) return;
        acsState.value = city.acs.state;
        acsCounty.value = city.acs.county;
    }

    function applySelectedCityStack() {
        const city = currentCity();
        feedUrl.value = 'sample-city-feed.csv';
        feedType.value = 'auto';
        feedMessage.textContent = `${city.name} stack staged with a local procurement-shaped sample feed. Replace this URL with city APIs as adapters are approved.`;
        loadSampleFeed();
    }

    function currentTrafficPreset() {
        return liveTrafficPresets[citySelect.value];
    }

    function currentPedestrianPreset() {
        return pedestrianPresets[citySelect.value];
    }

    function updatePresetMessage() {
        const trafficPreset = currentTrafficPreset();
        const pedestrianPreset = currentPedestrianPreset();
        if (trafficPreset) {
            presetMessage.textContent = trafficPreset.note;
            loadCityTraffic.textContent = trafficPreset.url ? `Load ${trafficPreset.name}` : 'Live traffic unavailable';
            loadCityTraffic.disabled = !trafficPreset.url;
        }
        if (pedestrianPreset) {
            pedestrianPresetMessage.textContent = pedestrianPreset.note;
            loadCityPedestrians.textContent = pedestrianPreset.url ? `Load ${pedestrianPreset.name}` : 'Pedestrian preset unavailable';
            loadCityPedestrians.disabled = !pedestrianPreset.url;
        }
    }

    function setTrafficRefresh(enabled) {
        if (trafficRefreshTimer) {
            window.clearInterval(trafficRefreshTimer);
            trafficRefreshTimer = 0;
        }
        if (enabled && currentTrafficPreset() && currentTrafficPreset().url) {
            trafficRefreshTimer = window.setInterval(function () {
                loadTrafficPreset(true);
            }, trafficRefreshMs);
        }
    }

    async function loadTrafficPreset(isRefresh) {
        const preset = currentTrafficPreset();
        if (!preset || !preset.url) {
            presetMessage.textContent = preset ? preset.note : 'No traffic preset for this city.';
            return;
        }
        feedUrl.value = preset.url;
        feedType.value = 'traffic';
        presetMessage.textContent = isRefresh ? `Refreshing ${preset.name}...` : `Loading ${preset.name}...`;
        await handleLiveFeed(preset.url, 'traffic', {
            sourceName: preset.name,
            replaceTraffic: true,
            silentMessage: isRefresh
        });
        presetMessage.textContent = `${preset.name} active. ${preset.note}`;
    }

    async function loadPedestrianPreset() {
        const preset = currentPedestrianPreset();
        if (!preset || !preset.url) {
            pedestrianPresetMessage.textContent = preset ? preset.note : 'No pedestrian preset for this city.';
            return;
        }
        feedUrl.value = preset.url;
        feedType.value = 'pedestrians';
        pedestrianPresetMessage.textContent = `Loading ${preset.name}...`;
        await handleLiveFeed(preset.url, 'pedestrians', {
            sourceName: preset.name,
            replacePedestrians: true,
            pedestrianPreset: true
        });
        pedestrianPresetMessage.textContent = `${preset.name} active. ${preset.note}`;
    }

    function resetInterventionValues() {
        Object.keys(defaultInterventions).forEach(function (key) {
            const input = document.querySelector(`[data-intervention="${key}"]`);
            if (input) {
                input.value = defaultInterventions[key];
            }
        });
        updateMetrics();
        draw();
    }

    function reportText() {
        return [
            `${currentCity().name} - ${currentScenario().label}`,
            `Network delay: ${delayMetric.textContent}`,
            `Pedestrian comfort: ${comfortMetric.textContent}`,
            `Equity reach: ${equityMetric.textContent}`,
            `Implementation score: ${scoreMetric.textContent}`,
            `${recommendationTitle.textContent}: ${recommendationCopy.textContent}`,
            `${tradeoffTitle.textContent}: ${tradeoffCopy.textContent}`,
            `${procurementTitle.textContent}: ${procurementCopy.textContent}`
        ].join('\n');
    }

    function currentScenarioSnapshot() {
        const interventions = currentInterventions();
        return {
            id: `scenario-${Date.now()}`,
            savedAt: new Date().toISOString(),
            cityKey: citySelect.value,
            city: currentCity().name,
            scenarioKey: scenarioSelect.value,
            scenario: currentScenario().label,
            hour: Number(hourSlider.value),
            interventions,
            metrics: {
                delay: delayMetric.textContent,
                comfort: comfortMetric.textContent,
                equity: equityMetric.textContent,
                score: scoreMetric.textContent
            },
            report: {
                recommendation: `${recommendationTitle.textContent}: ${recommendationCopy.textContent}`,
                tradeoff: `${tradeoffTitle.textContent}: ${tradeoffCopy.textContent}`,
                procurement: `${procurementTitle.textContent}: ${procurementCopy.textContent}`
            },
            importedRecords,
            url: scenarioUrl(interventions)
        };
    }

    function scenarioUrl(interventions) {
        const params = new URLSearchParams();
        params.set('city', citySelect.value);
        params.set('scenario', scenarioSelect.value);
        params.set('sample', importedRecords ? '1' : '0');
        params.set('view', viewMode);
        params.set('hour', hourSlider.value);
        Object.keys(defaultInterventions).forEach(function (key) {
            params.set(key, interventions[key]);
        });
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }

    function savedScenarios() {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || '[]');
        } catch (error) {
            return [];
        }
    }

    function persistScenarios(items) {
        localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 8)));
    }

    function saveCurrentScenario() {
        const items = [currentScenarioSnapshot()].concat(savedScenarios());
        persistScenarios(items);
        renderScenarioLibrary();
        saveScenario.textContent = 'Saved';
        window.setTimeout(function () {
            saveScenario.textContent = 'Save scenario';
        }, 1400);
    }

    function exportCurrentScenario() {
        const payload = currentScenarioSnapshot();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `civic-twin-${payload.cityKey}-${payload.scenarioKey}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function renderScenarioLibrary() {
        const items = savedScenarios();
        if (!items.length) {
            scenarioLibrary.innerHTML = '<p class="empty-state">Save alternatives to compare delay, comfort, equity reach, and implementation readiness across planning options.</p>';
            return;
        }
        scenarioLibrary.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Alternative</th>
                        <th>Delay</th>
                        <th>Comfort</th>
                        <th>Equity</th>
                        <th>Score</th>
                        <th>Interventions</th>
                        <th>Link</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(function (item) {
                        return `
                            <tr>
                                <td><strong>${escapeHtml(item.city)}</strong><br>${escapeHtml(item.scenario)}</td>
                                <td>${escapeHtml(item.metrics.delay)}</td>
                                <td>${escapeHtml(item.metrics.comfort)}</td>
                                <td>${escapeHtml(item.metrics.equity)}</td>
                                <td>${escapeHtml(item.metrics.score)}</td>
                                <td>${escapeHtml(interventionSummary(item.interventions))}</td>
                                <td><a href="${escapeHtml(item.url)}">Open</a></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    function interventionSummary(interventions) {
        return `Road ${interventions.roadDiet}%, transit ${interventions.transitBoost}%, safety ${interventions.safety}%, equity ${interventions.equityInvestment}%`;
    }

    function copyPlanningReport() {
        const text = reportText();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                copyReport.textContent = 'Copied';
                window.setTimeout(function () {
                    copyReport.textContent = 'Copy brief';
                }, 1400);
            }).catch(function () {
                copyReport.textContent = 'Copy unavailable';
            });
        } else {
            copyReport.textContent = 'Copy unavailable';
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function handleImport(file) {
        const reader = new FileReader();
        reader.onload = function () {
            const text = String(reader.result || '');
            try {
                importedFeed = mergeFeeds(importedFeed, parseImportedFeed(file.name, text));
                applyIncomeToGeoJson();
                importedRecords = countImportedRecords(importedFeed);
                importCopy.textContent = `${file.name} is staged as live overlay data. Recognized traffic, pedestrian, income, transit, and GeoJSON geometry fields are now drawn on the map.`;
            } catch (error) {
                importedRecords = 0;
                importCopy.textContent = `Import failed: ${error.message}`;
            }
            updateMetrics();
            draw();
        };
        reader.readAsText(file);
    }

    async function handleLiveFeed(url, typeHint, options) {
        const settings = options || {};
        if (!settings.silentMessage) {
            feedMessage.textContent = 'Loading live feed...';
        }
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json,text/csv,*/*' } });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            const inferredName = url.split('?')[0].split('/').pop() || `feed.${typeHint === 'geojson' ? 'geojson' : 'json'}`;
            const parsedFeed = parseImportedFeed(inferredName, text, typeHint);
            importedFeed = mergeFeeds(importedFeed, parsedFeed, settings);
            applyIncomeToGeoJson();
            importedRecords = countImportedRecords(importedFeed);
            const source = new URL(url, window.location.href);
            const sourceLabel = settings.sourceName || source.hostname || source.pathname;
            importCopy.textContent = `${importedRecords} records loaded from ${sourceLabel}. The remote feed is now projected as an active city overlay.`;
            feedMessage.textContent = 'Live feed loaded into the simulation.';
        } catch (error) {
            feedMessage.textContent = `Live feed unavailable: ${error.message}. Many city APIs require CORS, an API key, or a server-side connector.`;
            if (settings.sourceName) {
                presetMessage.textContent = `${settings.sourceName} unavailable: ${error.message}.`;
                if (settings.pedestrianPreset) {
                    pedestrianPresetMessage.textContent = `${settings.sourceName} unavailable: ${error.message}.`;
                }
            }
        }
        updateMetrics();
        draw();
    }

    async function loadAcsIncome(year, state, county) {
        const cleanYear = String(year || '').trim();
        const cleanState = String(state || '').trim().padStart(2, '0');
        const cleanCounty = String(county || '').trim().padStart(3, '0');
        const endpoint = `https://api.census.gov/data/${encodeURIComponent(cleanYear)}/acs/acs5?get=NAME,B19013_001E&for=tract:*&in=state:${encodeURIComponent(cleanState)}%20county:${encodeURIComponent(cleanCounty)}`;
        acsMessage.textContent = 'Loading ACS tract income...';
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const rows = await response.json();
            const incomeRows = parseAcsRows(rows);
            const blocks = acsRowsToIncomeBlocks(incomeRows, currentCity());
            if (!blocks.length) {
                throw new Error('no income rows returned');
            }
            importedFeed.incomeBlocks = blocks;
            importedFeed.incomeByTract = incomeRowsToMap(incomeRows);
            applyIncomeToGeoJson();
            const joined = joinedIncomeFeatureCount();
            importedRecords = countImportedRecords(importedFeed);
            incomeStatus.textContent = joined ? `${joined} ACS tract polygons joined` : `${blocks.length} ACS tract income rows`;
            importCopy.textContent = joined
                ? `${joined} tract GeoJSON features are joined to ACS ${cleanYear} median household income.`
                : `${blocks.length} ACS ${cleanYear} median household income rows are active as tract-proxy income overlays. Add tract GeoJSON for exact boundaries.`;
            acsMessage.textContent = joined
                ? `Loaded ACS income and joined ${joined} tract polygons.`
                : `Loaded ${blocks.length} ACS income rows for state ${cleanState}, county ${cleanCounty}.`;
        } catch (error) {
            acsMessage.textContent = `ACS income unavailable: ${error.message}. Check year/FIPS or use a server connector if the browser is blocked.`;
        }
        updateMetrics();
        draw();
    }

    async function loadLocalAcsSample() {
        acsMessage.textContent = 'Loading local ACS-format sample...';
        try {
            const response = await fetch('sample-acs-income.json');
            const rows = await response.json();
            const incomeRows = parseAcsRows(rows);
            const blocks = acsRowsToIncomeBlocks(incomeRows, currentCity());
            importedFeed.incomeBlocks = blocks;
            importedFeed.incomeByTract = incomeRowsToMap(incomeRows);
            applyIncomeToGeoJson();
            const joined = joinedIncomeFeatureCount();
            importedRecords = countImportedRecords(importedFeed);
            incomeStatus.textContent = joined ? `${joined} ACS-format polygons joined` : `${blocks.length} ACS-format income rows`;
            importCopy.textContent = joined
                ? `${joined} local tract polygons are joined to ACS-format median household income rows.`
                : `${blocks.length} ACS-format median household income rows are active as tract-proxy income overlays.`;
            acsMessage.textContent = joined ? `Joined ${joined} local tract polygons.` : `Loaded ${blocks.length} local ACS-format rows for renderer QA.`;
        } catch (error) {
            acsMessage.textContent = `ACS sample unavailable: ${error.message}.`;
        }
        updateMetrics();
        draw();
    }

    async function loadLocalTractSample() {
        try {
            const response = await fetch('sample-tracts.geojson');
            const geojson = await response.json();
            importedFeed = mergeFeeds(importedFeed, parseJsonFeed(geojson, 'geojson'));
            applyIncomeToGeoJson();
            importedRecords = countImportedRecords(importedFeed);
            const joined = joinedIncomeFeatureCount();
            importCopy.textContent = joined
                ? `${joined} sample tract polygons joined to ACS-format income rows.`
                : 'Sample tract polygons loaded. Load ACS income to shade them by median household income.';
        } catch (error) {
            importCopy.textContent = `Tract sample unavailable: ${error.message}.`;
        }
        updateMetrics();
        draw();
    }

    function acsRowsToIncomeBlocks(rows, city) {
        return rows.slice(0, 80).map(function (row, index) {
            const angle = hashNumber(row.tract) * Math.PI * 2;
            const radius = 0.006 + (index % 16) * 0.0014;
            return {
                lat: city.center.lat + Math.sin(angle) * radius,
                lng: city.center.lng + Math.cos(angle) * radius * 1.35,
                value: Math.max(0.08, Math.min(1, row.income / 180000)),
                source: 'ACS',
                tract: row.tract,
                income: row.income
            };
        });
    }

    function parseAcsRows(rows) {
        if (!Array.isArray(rows) || rows.length < 2) return [];
        const headers = rows[0].map(normalizeKey);
        const incomeIndex = headers.indexOf('b19013_001e');
        const tractIndex = headers.indexOf('tract');
        if (incomeIndex < 0 || tractIndex < 0) return [];
        return rows.slice(1).map(function (row) {
            return {
                tract: row[tractIndex],
                income: Number(row[incomeIndex])
            };
        }).filter(function (row) {
            return row.tract && Number.isFinite(row.income) && row.income > 0;
        });
    }

    function incomeRowsToMap(rows) {
        return rows.reduce(function (next, row) {
            next[normalizeTractId(row.tract)] = row.income;
            return next;
        }, {});
    }

    function applyIncomeToGeoJson() {
        const incomeMap = importedFeed.incomeByTract || {};
        importedFeed.geojson.forEach(function (feature) {
            const props = feature.properties || {};
            const tract = tractIdFromProperties(props);
            if (!tract || !incomeMap[tract]) return;
            props.layer = 'income';
            props.income = incomeMap[tract];
            props.median_income = incomeMap[tract];
            props.joined_acs_income = true;
            feature.properties = props;
        });
    }

    function joinedIncomeFeatureCount() {
        return importedFeed.geojson.filter(function (feature) {
            return feature.properties && feature.properties.joined_acs_income;
        }).length;
    }

    function tractIdFromProperties(props) {
        const candidates = [
            props.GEOID,
            props.geoid,
            props.GEOID10,
            props.GEOID20,
            props.tract,
            props.TRACTCE,
            props.TRACTCE10,
            props.TRACTCE20
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const normalized = normalizeTractId(candidates[i]);
            if (normalized) return normalized;
        }
        return '';
    }

    function normalizeTractId(value) {
        if (value === undefined || value === null) return '';
        const digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        return digits.length > 6 ? digits.slice(-6) : digits.padStart(6, '0');
    }

    function mergeFeeds(base, next, options) {
        const settings = options || {};
        return {
            trafficRoutes: settings.replaceTraffic ? next.trafficRoutes : base.trafficRoutes.concat(next.trafficRoutes),
            trafficPoints: settings.replaceTraffic ? next.trafficPoints : base.trafficPoints.concat(next.trafficPoints),
            pedestrianPoints: settings.replacePedestrians ? next.pedestrianPoints : base.pedestrianPoints.concat(next.pedestrianPoints),
            incomeBlocks: next.incomeBlocks.length ? next.incomeBlocks : base.incomeBlocks,
            transitStops: base.transitStops.concat(next.transitStops),
            geojson: base.geojson.concat(next.geojson),
            incomeByTract: Object.assign({}, base.incomeByTract, next.incomeByTract)
        };
    }

    function hashNumber(value) {
        const text = String(value);
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 31 + text.charCodeAt(i)) % 100000;
        }
        return hash / 100000;
    }

    function loadSampleFeed() {
        importedFeed = sampleImportedFeed(currentCity());
        importedRecords = countImportedRecords(importedFeed);
        trafficStatus.textContent = `${importedRecords} sample feed rows`;
        incomeStatus.textContent = 'Sample ACS tract layer';
        importCopy.textContent = `Sample ${currentCity().name} traffic sensors, pedestrian counters, income blocks, and transit stops are active as imported overlays.`;
        updateMetrics();
        draw();
    }

    function parseImportedFeed(fileName, text, typeHint) {
        const trimmed = text.trim();
        if (!trimmed) {
            throw new Error('empty file');
        }
        if (typeHint === 'geojson' || /\.geojson$|\.json$/i.test(fileName) || trimmed[0] === '{' || trimmed[0] === '[') {
            return parseJsonFeed(JSON.parse(trimmed), typeHint);
        }
        return parseCsvFeed(trimmed, typeHint);
    }

    function parseJsonFeed(data, typeHint) {
        const next = emptyFeed();
        if (data.type === 'FeatureCollection') {
            next.geojson = data.features || [];
            return next;
        }
        if (data.type === 'Feature') {
            next.geojson = [data];
            return next;
        }
        if (Array.isArray(data)) {
            return rowsToFeed(data, typeHint);
        }
        if (Array.isArray(data.rows)) {
            return rowsToFeed(data.rows, typeHint);
        }
        throw new Error('expected GeoJSON, an array, or a rows array');
    }

    function parseCsvFeed(text, typeHint) {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = splitCsvLine(lines.shift()).map(function (header) {
            return normalizeKey(header);
        });
        const rows = lines.map(function (line) {
            const values = splitCsvLine(line);
            return headers.reduce(function (row, header, index) {
                row[header] = values[index];
                return row;
            }, {});
        });
        return rowsToFeed(rows, typeHint);
    }

    function splitCsvLine(line) {
        const values = [];
        let value = '';
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            const next = line[i + 1];
            if (char === '"' && quoted && next === '"') {
                value += '"';
                i += 1;
            } else if (char === '"') {
                quoted = !quoted;
            } else if (char === ',' && !quoted) {
                values.push(value.trim());
                value = '';
            } else {
                value += char;
            }
        }
        values.push(value.trim());
        return values;
    }

    function rowsToFeed(rows, typeHint) {
        const next = emptyFeed();
        rows.forEach(function (row) {
            const normalized = normalizeRow(row);
            const layer = typeHint && typeHint !== 'auto' ? typeHint : inferLayer(normalized);
            const linkPoints = parseLinkPoints(normalized.link_points);
            const geometryPoint = pointFromGeometry(normalized.the_geom || normalized.geocoded_column || normalized.point || normalized.location || normalized.shape || normalized.geocode_location);
            let lat = numberFrom(normalized, ['lat', 'latitude', 'y', 'loc_y', 'lif_lat', 'start_latitude', 'tb_latitude']);
            let lng = numberFrom(normalized, ['lng', 'lon', 'long', 'longitude', 'x', 'loc_x', 'start_lon', 'start_longitude', 'tb_longitude']);
            if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && geometryPoint) {
                lat = geometryPoint.lat;
                lng = geometryPoint.lng;
            }
            const lat2 = numberFrom(normalized, ['lat2', 'latitude2', 'end_lat', 'to_lat', 'lit_lat', 'end_latitude']);
            const lng2 = numberFrom(normalized, ['lng2', 'lon2', 'longitude2', 'end_lng', 'to_lng', 'lit_lon', 'end_longitude']);
            const value = normalizedValue(normalized, layer);

            if (layer === 'traffic') {
                if (linkPoints.length > 1) {
                    next.trafficRoutes.push({ value, points: linkPoints, source: normalized.link_name || normalized.street || normalized.owner || 'traffic link' });
                } else if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(lat2) && Number.isFinite(lng2)) {
                    next.trafficRoutes.push({ value, points: [{ lat, lng }, { lat: lat2, lng: lng2 }] });
                } else if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    next.trafficPoints.push({ lat, lng, value });
                }
            } else if (layer === 'income') {
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                next.incomeBlocks.push({ lat, lng, value });
            } else if (layer === 'pedestrians') {
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                next.pedestrianPoints.push({ lat, lng, value });
            } else if (layer === 'transit') {
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                next.transitStops.push({ lat, lng, value });
            }
        });
        return next;
    }

    function pointFromGeometry(value) {
        if (!value) return null;
        if (typeof value === 'object') {
            if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
                return { lng: Number(value.coordinates[0]), lat: Number(value.coordinates[1]) };
            }
            if (value.latitude !== undefined && value.longitude !== undefined) {
                return { lat: Number(value.latitude), lng: Number(value.longitude) };
            }
        }
        const text = String(value);
        const match = text.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
        if (match) {
            return { lng: Number(match[1]), lat: Number(match[2]) };
        }
        return null;
    }

    function parseLinkPoints(value) {
        if (!value) return [];
        return String(value).split(/\s+/).map(function (pair) {
            const parts = pair.split(',').map(Number);
            if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
            return { lat: parts[0], lng: parts[1] };
        }).filter(Boolean);
    }

    function emptyFeed() {
        return {
            trafficRoutes: [],
            trafficPoints: [],
            pedestrianPoints: [],
            incomeBlocks: [],
            transitStops: [],
            geojson: [],
            incomeByTract: {}
        };
    }

    function normalizeRow(row) {
        return Object.keys(row).reduce(function (next, key) {
            next[normalizeKey(key)] = row[key];
            return next;
        }, {});
    }

    function normalizeKey(key) {
        return String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function inferLayer(row) {
        const declared = String(row.layer || row.type || row.category || '').toLowerCase();
        if (declared.includes('traffic') || declared.includes('vehicle') || row.speed || row.average_speed || row.traffic || row.volume || row.delay || row.congestion || row.link_points || row.segmentid) return 'traffic';
        if (declared.includes('income') || row.income || row.median_income || row.ami) return 'income';
        if (declared.includes('ped') || row.pedestrian || row.flow || row.count || latestPedestrianCount(row).value) return 'pedestrians';
        if (declared.includes('transit') || declared.includes('stop') || row.stop_id || row.route_id) return 'transit';
        return 'traffic';
    }

    function numberFrom(row, keys) {
        for (let i = 0; i < keys.length; i += 1) {
            const value = Number(row[keys[i]]);
            if (Number.isFinite(value)) return value;
        }
        return NaN;
    }

    function normalizedValue(row, layer) {
        const pedestrianCount = layer === 'pedestrians' ? latestPedestrianCount(row).value : NaN;
        const raw = Number.isFinite(pedestrianCount) ? pedestrianCount : numberFrom(row, layer === 'income'
            ? ['income', 'median_income', 'ami', 'value']
            : ['congestion', 'delay', 'volume', 'count', 'flow', 'speed', 'average_speed', 'traffic', 'value']);
        if (!Number.isFinite(raw)) return 0.55;
        if (layer === 'traffic' && (row.speed || row.average_speed || row.traffic)) {
            return speedToCongestion(raw);
        }
        if (layer === 'pedestrians' && raw > 1) return Math.max(0.08, Math.min(1, raw / 6000));
        if (layer === 'income' && raw > 1) return Math.max(0.08, Math.min(1, raw / 160000));
        if (raw > 1) return Math.max(0.08, Math.min(1, raw / 100));
        return Math.max(0.08, Math.min(1, raw));
    }

    function speedToCongestion(speed) {
        if (!Number.isFinite(speed) || speed < 0) return 0.55;
        return Math.max(0.08, Math.min(1, 1 - speed / 48));
    }

    function latestPedestrianCount(row) {
        let best = { score: -1, value: NaN, key: '' };
        Object.keys(row).forEach(function (key) {
            const normalizedKey = key.toLowerCase();
            const match = normalizedKey.match(/^(may|june|sept|oct)_?(\d{2})_?(am|pm|md|p_m)$/);
            if (!match) return;
            const value = Number(String(row[key]).replace(/,/g, ''));
            if (!Number.isFinite(value) || value < 0) return;
            const monthScore = { may: 5, june: 6, sept: 9, oct: 10 }[match[1]] || 0;
            const periodScore = { am: 1, md: 2, pm: 3, p_m: 3 }[match[3]] || 0;
            const year = 2000 + Number(match[2]);
            const score = year * 1000 + monthScore * 10 + periodScore;
            if (score > best.score) {
                best = { score, value, key };
            }
        });
        return best;
    }

    function countImportedRecords(feed) {
        return feed.trafficRoutes.length + feed.trafficPoints.length + feed.pedestrianPoints.length + feed.incomeBlocks.length + feed.transitStops.length + feed.geojson.length;
    }

    function sampleImportedFeed(city) {
        const center = city.center;
        const row = function (layer, latOffset, lngOffset, extra) {
            return Object.assign({ layer, lat: center.lat + latOffset, lng: center.lng + lngOffset }, extra || {});
        };
        return rowsToFeed([
            row('traffic', 0.0063, -0.0174, { lat2: center.lat + 0.0059, lng2: center.lng + 0.0053, congestion: 82 }),
            row('traffic', 0.0005, -0.0122, { lat2: center.lat - 0.0003, lng2: center.lng + 0.0148, congestion: 74 }),
            row('pedestrian', 0.0058, -0.0028, { count: 91 }),
            row('pedestrian', 0.0008, -0.0061, { count: 68 }),
            row('income', 0.0144, -0.0054, { median_income: 128000 }),
            row('income', -0.0103, -0.0328, { median_income: 58000 }),
            row('transit', 0.0001, -0.0001, { stop_id: 'core-01' }),
            row('transit', 0.0077, 0.002, { stop_id: 'transfer-02' })
        ]);
    }

    document.querySelectorAll('[data-layer]').forEach(function (input) {
        input.addEventListener('change', function () {
            layers[input.dataset.layer] = input.checked;
            draw();
        });
    });

    [citySelect, scenarioSelect, hourSlider].forEach(function (control) {
        control.addEventListener('input', function () {
            if (control === citySelect) {
                renderSourceStack();
                updateAcsDefaults();
                updatePresetMessage();
                setTrafficRefresh(autoRefreshTraffic.checked);
            }
            updateMetrics();
            draw();
        });
    });

    toggleAll.addEventListener('click', function () {
        const active = layers.traffic && !layers.pedestrians && !layers.income && !layers.transit;
        Object.keys(layers).forEach(function (key) {
            layers[key] = active ? true : key === 'traffic';
            document.querySelector(`[data-layer="${key}"]`).checked = layers[key];
        });
        toggleAll.textContent = active ? 'Solo pressure' : 'Restore all';
        draw();
    });

    document.querySelectorAll('[data-intervention]').forEach(function (input) {
        input.addEventListener('input', function () {
            updateMetrics();
            draw();
        });
    });

    playToggle.addEventListener('click', function () {
        running = !running;
        playToggle.textContent = running ? 'Pause' : 'Play';
    });

    viewModeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            setViewMode(button.dataset.viewMode);
        });
    });

    dataImport.addEventListener('change', function () {
        if (dataImport.files && dataImport.files[0]) {
            handleImport(dataImport.files[0]);
        }
    });

    feedForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const url = feedUrl.value.trim();
        if (!url) {
            feedMessage.textContent = 'Paste a city API, CSV, JSON, or GeoJSON URL first.';
            return;
        }
        handleLiveFeed(url, feedType.value);
    });

    acsForm.addEventListener('submit', function (event) {
        event.preventDefault();
        loadAcsIncome(acsYear.value, acsState.value, acsCounty.value);
    });

    loadSample.addEventListener('click', loadSampleFeed);
    loadCityTraffic.addEventListener('click', function () {
        loadTrafficPreset(false);
    });
    loadCityPedestrians.addEventListener('click', loadPedestrianPreset);
    autoRefreshTraffic.addEventListener('change', function () {
        setTrafficRefresh(autoRefreshTraffic.checked);
        if (autoRefreshTraffic.checked) {
            loadTrafficPreset(false);
        }
    });
    applyCityStack.addEventListener('click', applySelectedCityStack);
    resetInterventions.addEventListener('click', resetInterventionValues);
    copyReport.addEventListener('click', copyPlanningReport);
    saveScenario.addEventListener('click', saveCurrentScenario);
    exportScenario.addEventListener('click', exportCurrentScenario);
    window.addEventListener('resize', resizeCanvas);

    function animate() {
        if (running) {
            tick += 1;
            draw();
        }
        requestAnimationFrame(animate);
    }

    const initialParams = new URLSearchParams(window.location.search);
    if (initialParams.has('city') && cities[initialParams.get('city')]) {
        citySelect.value = initialParams.get('city');
    }
    if (initialParams.has('scenario') && scenarios[initialParams.get('scenario')]) {
        scenarioSelect.value = initialParams.get('scenario');
    }
    if (initialParams.has('hour')) {
        const hour = Math.max(5, Math.min(23, Number(initialParams.get('hour'))));
        if (Number.isFinite(hour)) {
            hourSlider.value = hour;
        }
    }
    if (initialParams.has('view')) {
        setViewMode(initialParams.get('view'));
    } else {
        setViewMode('diorama');
    }
    Object.keys(defaultInterventions).forEach(function (key) {
        if (initialParams.has(key)) {
            const input = document.querySelector(`[data-intervention="${key}"]`);
            const value = Math.max(0, Math.min(100, Number(initialParams.get(key))));
            if (input && Number.isFinite(value)) {
                input.value = value;
            }
        }
    });

    resizeCanvas();
    renderSourceStack();
    updateAcsDefaults();
    updatePresetMessage();
    renderScenarioLibrary();
    updateMetrics();

    async function loadInitialExternalData() {
        if (initialParams.get('sample') === '1') {
            loadSampleFeed();
        }
        if (initialParams.has('feed')) {
            feedUrl.value = initialParams.get('feed');
            await handleLiveFeed(initialParams.get('feed'), initialParams.get('type') || 'auto');
        }
        if (initialParams.get('liveTraffic') === '1') {
            await loadTrafficPreset(false);
        }
        if (initialParams.get('pedestrians') === '1') {
            await loadPedestrianPreset();
        }
        if (initialParams.get('acs') === '1') {
            await loadAcsIncome(acsYear.value, acsState.value, acsCounty.value);
        }
        if (initialParams.get('acsSample') === '1') {
            await loadLocalAcsSample();
        }
        if (initialParams.get('tractSample') === '1') {
            await loadLocalTractSample();
        }
    }

    loadInitialExternalData();
    animate();
}());
