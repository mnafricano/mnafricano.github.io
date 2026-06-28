import * as THREE from './vendor/three/three.module.min.js';

const MAX_INSTANCES = {
    car: 110,
    bus: 20,
    bicycle: 50,
    person: 120,
    cta: 70,
    metra: 70,
    'metra-locomotive': 12
};

const createLocalMatrix = (position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    return new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        quaternion,
        new THREE.Vector3(1, 1, 1)
    );
};

const createMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0.25,
    roughness: options.roughness ?? 0.55,
    side: THREE.DoubleSide
});

const createFleet = (scene) => {
    const fleet = {};

    const addPart = (type, geometry, color, locals, options) => {
        fleet[type] ||= [];
        const mesh = new THREE.InstancedMesh(
            geometry,
            createMaterial(color, options),
            MAX_INSTANCES[type] * locals.length
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        scene.add(mesh);
        fleet[type].push({
            mesh,
            locals: locals.map((local) => createLocalMatrix(local.position, local.rotation))
        });
    };

    const box = (type, size, color, locals, options) => addPart(
        type,
        new THREE.BoxGeometry(...size),
        color,
        locals,
        options
    );
    const wheels = (type, radius, width, locals) => addPart(
        type,
        new THREE.CylinderGeometry(radius, radius, width, 10),
        '#15191c',
        locals,
        { metalness: 0.1, roughness: 0.9 }
    );

    box('car', [4.5, 1.85, 0.65], '#d84f45', [{ position: [0, 0, 0.68] }], { metalness: 0.55 });
    box('car', [2.15, 1.55, 0.68], '#8bb9c8', [{ position: [-0.35, 0, 1.25] }], { metalness: 0.7, roughness: 0.22 });
    box('car', [1.15, 1.72, 0.22], '#d84f45', [{ position: [1.45, 0, 1.02] }], { metalness: 0.5 });
    wheels('car', 0.36, 0.22, [
        { position: [-1.3, -0.98, 0.4] }, { position: [-1.3, 0.98, 0.4] },
        { position: [1.3, -0.98, 0.4] }, { position: [1.3, 0.98, 0.4] }
    ]);

    box('bus', [11.8, 2.55, 2.5], '#e5ad38', [{ position: [0, 0, 1.55] }], { metalness: 0.35 });
    box('bus', [8.7, 2.58, 0.82], '#354d57', [{ position: [-0.35, 0, 2.05] }], { metalness: 0.6, roughness: 0.25 });
    box('bus', [11.1, 2.25, 0.16], '#e8eceb', [{ position: [0, 0, 2.88] }]);
    wheels('bus', 0.55, 0.28, [
        { position: [-3.8, -1.37, 0.58] }, { position: [-3.8, 1.37, 0.58] },
        { position: [3.8, -1.37, 0.58] }, { position: [3.8, 1.37, 0.58] }
    ]);

    addPart(
        'bicycle',
        new THREE.TorusGeometry(0.36, 0.045, 6, 16),
        '#15191c',
        [
            { position: [-0.58, 0, 0.42], rotation: [Math.PI / 2, 0, 0] },
            { position: [0.58, 0, 0.42], rotation: [Math.PI / 2, 0, 0] }
        ],
        { metalness: 0.2, roughness: 0.75 }
    );
    box('bicycle', [1.08, 0.08, 0.08], '#39d7bd', [{ position: [0, 0, 0.58], rotation: [0, -0.18, 0] }], { metalness: 0.5 });
    box('bicycle', [0.08, 0.08, 0.72], '#39d7bd', [{ position: [0.12, 0, 0.7], rotation: [0, 0.5, 0] }], { metalness: 0.5 });

    addPart(
        'person',
        new THREE.CylinderGeometry(0.22, 0.28, 1.2, 8),
        '#2f9ed8',
        [{ position: [0, 0, 0.92], rotation: [Math.PI / 2, 0, 0] }],
        { metalness: 0.05, roughness: 0.85 }
    );
    addPart(
        'person',
        new THREE.SphereGeometry(0.24, 10, 8),
        '#e8b98e',
        [{ position: [0, 0, 1.72] }],
        { metalness: 0, roughness: 0.9 }
    );
    box('person', [0.14, 0.14, 0.7], '#273741', [
        { position: [-0.11, 0, 0.35], rotation: [0, 0.08, 0] },
        { position: [0.11, 0, 0.35], rotation: [0, -0.08, 0] }
    ]);

    box('cta', [14.65, 2.65, 3.25], '#bdc5c8', [{ position: [0, 0, 1.92] }], { metalness: 0.82, roughness: 0.28 });
    box('cta', [10.7, 2.68, 1.05], '#22343d', [{ position: [-0.1, 0, 2.15] }], { metalness: 0.65, roughness: 0.2 });
    box('cta', [0.45, 2.72, 3.05], '#1775b9', [
        { position: [-7.15, 0, 1.92] }, { position: [7.15, 0, 1.92] }
    ], { metalness: 0.5 });
    box('cta', [13.3, 0.08, 0.2], '#cf3f3f', [
        { position: [0, -1.36, 1.05] }, { position: [0, 1.36, 1.05] }
    ]);
    box('cta', [13.5, 2.35, 0.18], '#7e898d', [{ position: [0, 0, 3.62] }], { metalness: 0.75 });
    wheels('cta', 0.47, 0.28, [
        { position: [-4.5, -1.42, 0.45] }, { position: [-4.5, 1.42, 0.45] },
        { position: [4.5, -1.42, 0.45] }, { position: [4.5, 1.42, 0.45] }
    ]);

    box('metra', [25.8, 3.05, 4.55], '#c6ccce', [{ position: [0, 0, 2.52] }], { metalness: 0.82, roughness: 0.3 });
    box('metra', [22.8, 3.08, 0.68], '#243f78', [
        { position: [0, 0, 1.28] }, { position: [0, 0, 3.32] }
    ], { metalness: 0.55 });
    box('metra', [21.6, 3.1, 0.52], '#1e2c33', [
        { position: [0, 0, 2.15] }, { position: [0, 0, 3.75] }
    ], { metalness: 0.62, roughness: 0.2 });
    box('metra', [24.4, 3.1, 0.13], '#e7812d', [{ position: [0, 0, 1.72] }]);
    box('metra', [24.5, 2.78, 0.22], '#69767b', [{ position: [0, 0, 4.91] }], { metalness: 0.7 });
    wheels('metra', 0.58, 0.32, [
        { position: [-8.3, -1.62, 0.55] }, { position: [-8.3, 1.62, 0.55] },
        { position: [8.3, -1.62, 0.55] }, { position: [8.3, 1.62, 0.55] }
    ]);

    box('metra-locomotive', [20.2, 3.1, 4.35], '#22518a', [{ position: [0, 0, 2.45] }], { metalness: 0.6 });
    box('metra-locomotive', [5.4, 3.16, 3.05], '#f28b2d', [{ position: [7.2, 0, 2.25] }], { metalness: 0.45 });
    box('metra-locomotive', [3.5, 3.18, 0.78], '#1d2e38', [{ position: [6.9, 0, 3.35] }], { metalness: 0.65, roughness: 0.2 });
    box('metra-locomotive', [18.6, 3.14, 0.18], '#f2f3f2', [{ position: [-0.5, 0, 1.45] }]);
    box('metra-locomotive', [18.2, 2.8, 0.25], '#33434a', [{ position: [-0.4, 0, 4.72] }], { metalness: 0.7 });
    wheels('metra-locomotive', 0.68, 0.34, [
        { position: [-6.4, -1.65, 0.62] }, { position: [-6.4, 1.65, 0.62] },
        { position: [5.8, -1.65, 0.62] }, { position: [5.8, 1.65, 0.62] }
    ]);

    return fleet;
};

export const createAgent3DLayer = ({ map, getEntities, onReady }) => {
    const temporaryMatrix = new THREE.Matrix4();
    const rotationMatrix = new THREE.Matrix4();
    const scaleMatrix = new THREE.Matrix4();
    const translationMatrix = new THREE.Matrix4();

    return {
        id: 'moving-agents-3d',
        type: 'custom',
        renderingMode: '3d',

        onAdd(mapInstance, gl) {
            this.map = mapInstance;
            this.camera = new THREE.Camera();
            this.scene = new THREE.Scene();
            this.scene.add(new THREE.HemisphereLight(0xe9f5ff, 0x4a4e46, 2.25));
            const sun = new THREE.DirectionalLight(0xffffff, 2.8);
            sun.position.set(-80, -110, 180);
            this.scene.add(sun);
            this.fleet = createFleet(this.scene);
            this.renderer = new THREE.WebGLRenderer({
                canvas: mapInstance.getCanvas(),
                context: gl,
                antialias: true
            });
            this.renderer.autoClear = false;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.05;
            onReady?.();
        },

        updateInstances() {
            const entities = getEntities();
            this.hasEntities = entities.length > 0;
            const grouped = Object.groupBy
                ? Object.groupBy(entities, (entity) => entity.type)
                : entities.reduce((result, entity) => {
                    (result[entity.type] ||= []).push(entity);
                    return result;
                }, {});

            Object.entries(this.fleet).forEach(([type, parts]) => {
                const entities = (grouped[type] || []).slice(0, MAX_INSTANCES[type]);
                const worldMatrices = entities.map((entity) => {
                    const mercator = maplibregl.MercatorCoordinate.fromLngLat(
                        entity.coordinates,
                        entity.altitude
                    );
                    const scale = mercator.meterInMercatorCoordinateUnits();
                    translationMatrix.makeTranslation(mercator.x, mercator.y, mercator.z);
                    scaleMatrix.makeScale(scale, -scale, scale);
                    rotationMatrix.makeRotationZ(THREE.MathUtils.degToRad(-entity.bearing));
                    return new THREE.Matrix4()
                        .copy(translationMatrix)
                        .multiply(scaleMatrix)
                        .multiply(rotationMatrix);
                });

                parts.forEach((part) => {
                    let instance = 0;
                    worldMatrices.forEach((world) => {
                        part.locals.forEach((local) => {
                            temporaryMatrix.multiplyMatrices(world, local);
                            part.mesh.setMatrixAt(instance, temporaryMatrix);
                            instance += 1;
                        });
                    });
                    part.mesh.count = instance;
                    part.mesh.instanceMatrix.needsUpdate = true;
                });
            });
        },

        render(_gl, args) {
            this.updateInstances();
            this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix);
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
            if (this.hasEntities) this.map.triggerRepaint();
        },

        onRemove() {
            this.renderer?.dispose();
        }
    };
};
