// --- MOTEUR DE MONDE 3D ET COURSE CYCLISTE IMMERSIVE (STYLE ZWIFT / ROUVY) ---
// Three.js r128 : relief généré autour de la route, végétation instanciée, ciel atmosphérique
// et cyclistes animés (pédalage, rotation des roues, inclinaison en virage).

(function () {
    const TAU = Math.PI * 2;
    const ROAD_HALF_WIDTH = 3.5;
    const SHOULDER_WIDTH = 1.1;
    const WHEEL_RADIUS = 0.34;
    const CRANK_LENGTH = 0.17;
    const THIGH_LENGTH = 0.43;
    const SHIN_LENGTH = 0.45;
    const PLAYER_LANE = 0.9; // Mètres à droite de l'axe de la route
    const SAMPLE_SPACING = 2; // Échantillonnage de la route en mètres

    // Points clés du vélo (repère local : x = gauche, y = haut, z = avant)
    const BIKE = {
        bb: [0, 0.28, 0],
        rearAxle: [0, WHEEL_RADIUS, -0.41],
        frontAxle: [0, WHEEL_RADIUS, 0.59],
        seatTop: [0, 0.78, -0.13],
        headTop: [0, 0.76, 0.45],
        headBottom: [0, 0.6, 0.49],
        hip: [0, 0.9, -0.17],
        shoulder: [0, 1.31, 0.25],
        head: [0, 1.44, 0.37]
    };

    // ---------- Utilitaires ----------

    function lin(hex) {
        return new THREE.Color(hex).convertSRGBToLinear();
    }

    function clamp(v, a, b) {
        return v < a ? a : (v > b ? b : v);
    }

    function smoothstep(e0, e1, x) {
        const t = clamp((x - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hash2(a, b) {
        const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    function v3(arr) {
        return new THREE.Vector3(arr[0], arr[1], arr[2]);
    }

    class Noise2D {
        constructor(seed) {
            const rand = mulberry32(seed);
            const p = [];
            for (let i = 0; i < 256; i++) p.push(i);
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
            }
            this.perm = new Uint8Array(512);
            for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
            this.vals = new Float32Array(256);
            for (let i = 0; i < 256; i++) this.vals[i] = rand() * 2 - 1;
        }

        value(x, y) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const X = xi & 255, Y = yi & 255;
            const p = this.perm, vals = this.vals;
            const a = vals[p[X + p[Y]]];
            const b = vals[p[X + 1 + p[Y]]];
            const c = vals[p[X + p[Y + 1]]];
            const d = vals[p[X + 1 + p[Y + 1]]];
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        }

        fbm(x, y, octaves) {
            let sum = 0, amp = 0.5, freq = 1, norm = 0;
            for (let i = 0; i < octaves; i++) {
                sum += amp * this.value(x * freq + i * 17.3, y * freq - i * 9.1);
                norm += amp;
                amp *= 0.5;
                freq *= 2.03;
            }
            return sum / norm;
        }

        // Bruit « crêtes » pour des sommets alpins (0..1)
        ridged(x, y, octaves) {
            let sum = 0, amp = 0.5, freq = 1, norm = 0, weight = 1;
            for (let i = 0; i < octaves; i++) {
                let n = 1 - Math.abs(this.value(x * freq + i * 31.7, y * freq + i * 12.9));
                n *= n * weight;
                weight = clamp(n * 1.6, 0, 1);
                sum += n * amp;
                norm += amp;
                amp *= 0.5;
                freq *= 2.1;
            }
            return sum / norm;
        }
    }

    // Fusion de géométries non indexées (positions, normales, couleurs)
    function mergeGeos(list) {
        const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
        let total = 0;
        geos.forEach(g => { total += g.attributes.position.count; });
        const pos = new Float32Array(total * 3);
        const nor = new Float32Array(total * 3);
        const col = new Float32Array(total * 3).fill(1);
        let offset = 0;
        geos.forEach(g => {
            if (!g.attributes.normal) g.computeVertexNormals();
            pos.set(g.attributes.position.array, offset * 3);
            nor.set(g.attributes.normal.array, offset * 3);
            if (g.attributes.color) col.set(g.attributes.color.array, offset * 3);
            offset += g.attributes.position.count;
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('color', new THREE.BufferAttribute(col, 3));
        out.computeBoundingSphere();
        return out;
    }

    function paint(geo, hex) {
        const c = lin(hex);
        const n = geo.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return geo;
    }

    // Boule de feuillage : normales d'ellipsoïde pour un ombrage doux
    function blob(radius, cx, cy, cz, sx, sy, sz, hex, detail) {
        const g = new THREE.IcosahedronGeometry(radius, detail || 0);
        g.scale(sx, sy, sz);
        g.translate(cx, cy, cz);
        const pos = g.attributes.position;
        const nor = new Float32Array(pos.count * 3);
        const n = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            n.set((pos.getX(i) - cx) / (sx * sx), (pos.getY(i) - cy) / (sy * sy), (pos.getZ(i) - cz) / (sz * sz)).normalize();
            nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
        }
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        return paint(g, hex);
    }

    // Cylindre orienté entre deux points
    function tubeBetween(a, b, r0, r1, segments, sx, sz) {
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        const g = new THREE.CylinderGeometry(r1 === undefined ? r0 : r1, r0, len, segments || 6);
        if (sx || sz) g.scale(sx || 1, 1, sz || 1);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(m);
        return g;
    }

    function canvasTexture(w, h, draw, srgb) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        draw(canvas.getContext('2d'), w, h);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (srgb !== false) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function speckle(ctx, w, h, amount, rand) {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (rand() - 0.5) * amount;
            d[i] = clamp(d[i] + n, 0, 255);
            d[i + 1] = clamp(d[i + 1] + n, 0, 255);
            d[i + 2] = clamp(d[i + 2] + n, 0, 255);
        }
        ctx.putImageData(img, 0, 0);
    }

    // Table de correspondance de la grille du terrain : fine près du circuit, large au loin
    function gridMap(s, inner, outer, k) {
        const a = Math.abs(s);
        let g;
        if (a <= k) {
            g = (a / k) * inner;
        } else {
            const t = (a - k) / (1 - k);
            const slope = (inner / k) * (1 - k);
            g = inner + slope * t + (outer - inner - slope) * t * t;
        }
        return s < 0 ? -g : g;
    }

    // Parcelles agricoles de la campagne (cultures et haies)
    function countryField(x, z) {
        const ca = Math.cos(0.52), sa = Math.sin(0.52);
        const u = x * ca + z * sa;
        const v = -x * sa + z * ca;
        const cu = Math.floor(u / 115), cv = Math.floor(v / 78);
        const eu = Math.abs(u - Math.round(u / 115) * 115);
        const ev = Math.abs(v - Math.round(v / 78) * 78);
        return { crop: Math.floor(hash2(cu, cv) * 7), edge: Math.min(eu, ev), u: u, v: v };
    }

    // ---------- Thèmes ----------

    const THEMES = {
        alps: {
            seed: 1907,
            sky: { top: 0x2b68bd, horizon: 0xc6daec, bottom: 0x9cb0bf, sun: 0xfff0d0, glow: 1 },
            sunDir: [0.45, 0.6, 0.38],
            fog: 0.00028,
            hemi: [0xdce9ff, 0x56653a, 0.62],
            sunLight: [0xfff3df, 1.25],
            exposure: 1.0,
            clouds: 26,
            cloudTint: 0xffffff,
            forest: [0.0, 0.32],
            shoulder: 0x8c8577,
            palette: {
                grass: 0x5f8f37, grass2: 0x86ac4b, dry: 0xa6a35f, forest: 0x2c4a25,
                rock: 0x8e8a83, rockDark: 0x5e5c58, snow: 0xf5f8fc, verge: 0x7c8a4a
            },
            relief(x, z, n) {
                const r = Math.sqrt(x * x + z * z);
                let h = n.fbm(x * 0.0035, z * 0.0035, 4) * 48 + n.fbm(x * 0.014, z * 0.014, 3) * 7;
                h += smoothstep(950, 2700, r) * (160 + n.ridged(x * 0.0011 + 3.1, z * 0.0011 - 1.7, 5) * 1250);
                return h;
            },
            color(c, x, z, h, slope, d, w) {
                const P = w.palette, n = w.noise;
                const v = 0.5 + 0.5 * n.fbm(x * 0.012, z * 0.012, 3);
                c.copy(P.grass).lerp(P.grass2, v);
                c.lerp(P.dry, smoothstep(0.55, 0.85, 0.5 + 0.5 * n.value(x * 0.003 + 40, z * 0.003)) * 0.5);
                c.lerp(P.forest, w.forestMask(x, z) * 0.85 * (1 - smoothstep(260, 420, h)));
                c.lerp(P.verge, (1 - smoothstep(ROAD_HALF_WIDTH + 2, ROAD_HALF_WIDTH + 9, d)) * 0.6);
                const rock = Math.max(smoothstep(0.5, 0.9, slope), smoothstep(320, 520, h + n.value(x * 0.01, z * 0.01) * 60) * 0.85);
                c.lerp(v > 0.5 ? P.rock : P.rockDark, rock);
                const snow = smoothstep(560, 720, h + n.fbm(x * 0.004, z * 0.004, 3) * 90) * (1 - smoothstep(0.85, 1.4, slope));
                c.lerp(P.snow, snow);
            }
        },

        countryside: {
            seed: 3141,
            sky: { top: 0x3f87dc, horizon: 0xd5e5f1, bottom: 0xa9b8a6, sun: 0xfff2d6, glow: 1 },
            sunDir: [-0.4, 0.55, 0.5],
            fog: 0.00042,
            hemi: [0xe0ecff, 0x5a6a3a, 0.62],
            sunLight: [0xfff1dc, 1.2],
            exposure: 1.0,
            clouds: 30,
            cloudTint: 0xffffff,
            forest: [0.12, 0.4],
            shoulder: 0x8d8a7c,
            palette: {
                pasture: 0x5f9136, pasture2: 0x77a843, wheat: 0xd2b65e, plowed: 0x7b5a3c,
                rapeseed: 0xd8cc35, darkGreen: 0x4b7530, hedge: 0x3c5f27, verge: 0x6f9a3e, forest: 0x35552a
            },
            relief(x, z, n) {
                const r = Math.sqrt(x * x + z * z);
                let h = n.fbm(x * 0.003, z * 0.003, 4) * 28 + n.fbm(x * 0.012, z * 0.012, 2) * 3;
                h += smoothstep(1100, 3600, r) * (60 + n.fbm(x * 0.0009, z * 0.0009, 4) * 170 + n.ridged(x * 0.0013, z * 0.0013, 3) * 130);
                return h;
            },
            color(c, x, z, h, slope, d, w) {
                const P = w.palette, n = w.noise;
                const f = countryField(x, z);
                const crops = [P.pasture, P.pasture2, P.wheat, P.plowed, P.rapeseed, P.darkGreen, P.pasture];
                c.copy(crops[f.crop]);
                if (f.crop === 2 || f.crop === 3) c.multiplyScalar(0.93 + 0.07 * Math.sin(f.u * 1.6));
                c.multiplyScalar(0.92 + 0.16 * (0.5 + 0.5 * n.fbm(x * 0.02, z * 0.02, 2)));
                c.lerp(P.hedge, 1 - smoothstep(1.5, 4, f.edge));
                c.lerp(P.forest, w.forestMask(x, z) * 0.9);
                c.lerp(P.verge, 1 - smoothstep(ROAD_HALF_WIDTH + 3, ROAD_HALF_WIDTH + 10, d));
            }
        },

        coastal: {
            seed: 2024,
            sky: { top: 0x4f86d0, horizon: 0xf3d3a6, bottom: 0xb7a58c, sun: 0xffd18f, glow: 1.4 },
            sunDir: [-0.25, 0.22, -0.94],
            fog: 0.00034,
            hemi: [0xffe9cc, 0x6b6a45, 0.6],
            sunLight: [0xffdcae, 1.3],
            exposure: 1.0,
            clouds: 16,
            cloudTint: 0xffe6c8,
            forest: [0.1, 0.38],
            shoulder: 0xa49a84,
            palette: {
                garrigue: 0x76853f, dry: 0xb19f6a, pine: 0x46632b, rock: 0xbdb196,
                sand: 0xe3d0a0, wetSand: 0xb9a57a, verge: 0x8e9356
            },
            relief(x, z, n) {
                const r = Math.sqrt(x * x + z * z);
                let h = n.fbm(x * 0.004, z * 0.004, 4) * 32 + n.fbm(x * 0.016, z * 0.016, 2) * 4;
                h *= 1 - smoothstep(-420, -680, z) * 0.85;
                h += smoothstep(850, 2500, r) * smoothstep(-300, 700, z) * (140 + n.ridged(x * 0.0012, z * 0.0012, 5) * 900);
                return h;
            },
            postHeight(x, z, h, n) {
                const coast = -770 + n.fbm(x * 0.0018, 7.3, 3) * 110;
                const s = smoothstep(coast + 60, coast - 180, z);
                return h * (1 - s) - 28 * s;
            },
            color(c, x, z, h, slope, d, w) {
                const P = w.palette, n = w.noise;
                c.copy(P.garrigue).lerp(P.dry, 0.5 + 0.5 * n.fbm(x * 0.01, z * 0.01, 3));
                c.lerp(P.pine, w.forestMask(x, z) * 0.8);
                c.lerp(P.verge, (1 - smoothstep(ROAD_HALF_WIDTH + 2, ROAD_HALF_WIDTH + 8, d)) * 0.5);
                c.lerp(P.rock, Math.max(smoothstep(0.5, 0.9, slope), smoothstep(260, 420, h) * 0.8));
                c.lerp(P.sand, 1 - smoothstep(1.5, 4.5, h));
                c.lerp(P.wetSand, 1 - smoothstep(-3, -1.5, h));
            }
        },

        cyberpunk: {
            seed: 2077,
            night: true,
            sky: { top: 0x03040c, horizon: 0x2a1650, bottom: 0x0a0716, sun: 0xff4fd8, glow: 0.25 },
            sunDir: [0.3, 0.05, -0.95],
            fog: 0.0012,
            hemi: [0x7563d8, 0x0b0a1a, 0.45],
            sunLight: [0x9fb4ff, 0.35],
            exposure: 1.1,
            clouds: 0,
            forest: [2, 3],
            shoulder: 0x15161f,
            palette: { ground: 0x10131c, ground2: 0x171a26 },
            relief() {
                return 0;
            },
            color(c, x, z, h, slope, d, w) {
                c.copy(w.palette.ground).lerp(w.palette.ground2, 0.5 + 0.5 * w.noise.value(x * 0.02, z * 0.02));
            }
        }
    };

    // ---------- Monde 3D ----------

    class Cycling3DWorld {
        constructor() {
            this.container = null;
            this.canvas = null;
            this.scene = null;
            this.camera = null;
            this.renderer = null;

            this.isActive = false;
            this.cameraMode = 'chase'; // 'chase' (3ème personne) ou 'pov' (guidon / 1ère personne)

            // État de course & position joueur
            this.playerDistance = 0; // en mètres
            this.playerSpeedMps = 0;
            this.playerCadence = 0;
            this.hasCadenceData = false;
            this.currentSlope = 0.0; // en %

            // Thèmes disponibles : 'alps', 'coastal', 'cyberpunk', 'countryside'
            this.currentTheme = 'alps';

            this.roadLength = 5000;
            this.roadPoints = [];
            this.roadCurve = null;
            this.roadMesh = null;
            this.terrainMesh = null;
            this.sceneryObjects = [];
            this.sceneryTextures = [];
            this.animatedProps = [];

            // Concurrents virtuels (IA Bots)
            this.competitors = [
                { name: "Julian (Attaquant)", color: 0xef4444, helmet: 0xffffff, speedBase: 9.8, distance: 40, lane: -0.6, mesh: null, rank: 2 },
                { name: "Tadej (Grimpeur)",   color: 0xf5c518, helmet: 0xf5c518, speedBase: 9.5, distance: 80, lane: 2.2, mesh: null, rank: 1 },
                { name: "Wout (Rouleur)",     color: 0x22c55e, helmet: 0x111111, speedBase: 9.2, distance: 15, lane: -1.9, mesh: null, rank: 3 },
                { name: "Mathieu (Puncheur)", color: 0x8b5cf6, helmet: 0xffffff, speedBase: 9.0, distance: -30, lane: 1.6, mesh: null, rank: 5 }
            ];

            this.playerMesh = null;
            this.playerRider = null;

            this.animationFrameId = null;
            this.lastTimestamp = 0;
            this.elapsed = 0;

            this.lowEnd = !!window.AndroidTrainerBridge || /Android|SmartTV|Tizen|Web0S|BRAVIA|AFT/i.test(navigator.userAgent);
            this.pixelRatio = 1;
            this.perf = { frames: 0, time: 0, warmup: 2 };

            this.tmp = {
                pos: new THREE.Vector3(), tan: new THREE.Vector3(), tan2: new THREE.Vector3(),
                right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), x: new THREE.Vector3(),
                y: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(),
                qRoll: new THREE.Quaternion(), zAxis: new THREE.Vector3(0, 0, 1),
                camTarget: new THREE.Vector3(), lookTarget: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3()
            };
            this.camLook = new THREE.Vector3();
            this.camSnap = true;
        }

        init(containerElement) {
            this.container = containerElement;
            const width = this.container.clientWidth || window.innerWidth;
            const height = this.container.clientHeight || window.innerHeight;

            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.FogExp2(0xc6daec, 0.0003);

            this.camera = new THREE.PerspectiveCamera(62, width / height, 0.5, 11000);
            this.camera.position.set(0, 5, -10);

            this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowEnd, powerPreference: 'high-performance' });
            this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.lowEnd ? 1 : 1.5);
            this.renderer.setPixelRatio(this.pixelRatio);
            this.renderer.setSize(width, height);
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

            this.container.appendChild(this.renderer.domElement);
            this.canvas = this.renderer.domElement;

            window.addEventListener('resize', () => this.onWindowResize());

            this.setupLights();
            this.buildSky();
            this.generateCircuit();
            this.buildScenery();
            this.createPlayerAvatar();
            this.createCompetitors();

            // Départ juste avant l'arche, face au public
            this.playerDistance = this.roadLength - 30;

            this.isActive = true;
            this.lastTimestamp = performance.now();
            this.animate(this.lastTimestamp);
        }

        setupLights() {
            this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.6);
            this.scene.add(this.hemiLight);

            this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
            this.dirLight.castShadow = true;
            const size = this.lowEnd ? 1024 : 2048;
            this.dirLight.shadow.mapSize.set(size, size);
            this.dirLight.shadow.camera.near = 10;
            this.dirLight.shadow.camera.far = 600;
            const d = 45;
            this.dirLight.shadow.camera.left = -d;
            this.dirLight.shadow.camera.right = d;
            this.dirLight.shadow.camera.top = d;
            this.dirLight.shadow.camera.bottom = -d;
            this.dirLight.shadow.bias = -0.0004;
            this.dirLight.shadow.normalBias = 0.03;
            this.scene.add(this.dirLight);
            this.scene.add(this.dirLight.target);

            this.headLight = new THREE.PointLight(0xbfefff, 0, 32, 2);
            this.scene.add(this.headLight);
        }

        // Dôme de ciel : dégradé, halo solaire et disque du soleil
        buildSky() {
            this.skyUniforms = {
                topColor: { value: new THREE.Color() },
                horizonColor: { value: new THREE.Color() },
                bottomColor: { value: new THREE.Color() },
                sunColor: { value: new THREE.Color() },
                sunDir: { value: new THREE.Vector3(0, 1, 0) },
                sunGlow: { value: 1 }
            };
            const material = new THREE.ShaderMaterial({
                uniforms: this.skyUniforms,
                vertexShader: [
                    'varying vec3 vDir;',
                    'void main() {',
                    '  vDir = position;',
                    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'uniform vec3 topColor;',
                    'uniform vec3 horizonColor;',
                    'uniform vec3 bottomColor;',
                    'uniform vec3 sunColor;',
                    'uniform vec3 sunDir;',
                    'uniform float sunGlow;',
                    'varying vec3 vDir;',
                    'void main() {',
                    '  vec3 d = normalize(vDir);',
                    '  float h = d.y;',
                    '  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.5));',
                    '  col = mix(col, bottomColor, 1.0 - smoothstep(-0.25, 0.0, h));',
                    '  float s = max(dot(d, normalize(sunDir)), 0.0);',
                    '  col += sunColor * sunGlow * (pow(s, 6.0) * 0.16 + pow(s, 64.0) * 0.5);',
                    '  col += sunColor * sunGlow * smoothstep(0.9993, 0.9997, s) * 5.0;',
                    '  gl_FragColor = vec4(col, 1.0);',
                    '  #include <tonemapping_fragment>',
                    '  #include <encodings_fragment>',
                    '}'
                ].join('\n'),
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: false,
                fog: false
            });
            this.skyGroup = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 20), material);
            dome.renderOrder = -10;
            dome.frustumCulled = false;
            this.skyGroup.add(dome);

            // Étoiles (décor nocturne)
            const rand = mulberry32(99);
            const starPos = new Float32Array(1500 * 3);
            for (let i = 0; i < 1500; i++) {
                const a = rand() * TAU;
                const y = 0.05 + rand() * 0.95;
                const r = Math.sqrt(1 - y * y);
                starPos[i * 3] = Math.cos(a) * r * 950;
                starPos[i * 3 + 1] = y * 950;
                starPos[i * 3 + 2] = Math.sin(a) * r * 950;
            }
            const starGeo = new THREE.BufferGeometry();
            starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
            this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
                color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false,
                transparent: true, opacity: 0.85, depthTest: false, depthWrite: false
            }));
            this.stars.renderOrder = -9;
            this.stars.frustumCulled = false;
            this.skyGroup.add(this.stars);
            this.scene.add(this.skyGroup);
        }

        // Circuit de ~3,5 km : montée de col, faux-plats et descente
        generateCircuit() {
            this.roadPoints = [];
            const numPoints = 180;
            const radiusX = 600;
            const radiusZ = 450;

            for (let i = 0; i < numPoints; i++) {
                const angle = (i / numPoints) * TAU;
                const rX = radiusX + Math.sin(angle * 3) * 120 + Math.cos(angle * 5) * 40;
                const rZ = radiusZ + Math.cos(angle * 2) * 100 + Math.sin(angle * 4) * 60;
                const x = Math.cos(angle) * rX;
                const z = Math.sin(angle) * rZ;
                // Départ en bas de la vallée, sommet à mi-parcours (≈ 6-7 % de pente maximale)
                const y = 39 - 36 * Math.cos(angle) + 3 * Math.sin(angle * 4 + 0.6);
                this.roadPoints.push(new THREE.Vector3(x, y, z));
            }

            this.roadCurve = new THREE.CatmullRomCurve3(this.roadPoints, true, 'centripetal');
            this.roadLength = this.roadCurve.getLength();

            // Échantillons réguliers de la route (calcul du relief et placement des décors)
            const n = Math.round(this.roadLength / SAMPLE_SPACING);
            const pts = this.roadCurve.getSpacedPoints(n);
            const s = {
                n: n, step: this.roadLength / n,
                x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
                tx: new Float32Array(n), tz: new Float32Array(n)
            };
            for (let i = 0; i < n; i++) {
                s.x[i] = pts[i].x; s.y[i] = pts[i].y; s.z[i] = pts[i].z;
            }
            for (let i = 0; i < n; i++) {
                const a = (i - 1 + n) % n, b = (i + 1) % n;
                const dx = s.x[b] - s.x[a], dz = s.z[b] - s.z[a];
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                s.tx[i] = dx / len; s.tz[i] = dz / len;
            }
            s.coarse = [];
            for (let i = 0; i < n; i += 12) s.coarse.push(i);
            this.samples = s;
            this.roadInfo = { d: 0, y: 0, idw: 0, i: 0 };
        }

        // Distance horizontale à la route la plus proche et altitude correspondante
        roadInfoAt(x, z) {
            const s = this.samples;
            let best = Infinity, bi = 0, wsum = 0, ysum = 0;
            for (let k = 0; k < s.coarse.length; k++) {
                const i = s.coarse[k];
                const dx = x - s.x[i], dz = z - s.z[i];
                const d2 = dx * dx + dz * dz;
                if (d2 < best) { best = d2; bi = i; }
                const w = 1 / (d2 + 900);
                const w2 = w * w;
                wsum += w2;
                ysum += w2 * s.y[i];
            }
            let fb = Infinity, fi = bi;
            for (let j = -14; j <= 14; j++) {
                const i = (bi + j + s.n) % s.n;
                const dx = x - s.x[i], dz = z - s.z[i];
                const d2 = dx * dx + dz * dz;
                if (d2 < fb) { fb = d2; fi = i; }
            }
            const info = this.roadInfo;
            info.d = Math.sqrt(fb);
            info.y = s.y[fi];
            info.idw = ysum / wsum;
            info.i = fi;
            return info;
        }

        terrainHeight(x, z, info) {
            const t = this.theme;
            const d = info.d;
            const base = info.y + (info.idw - info.y) * smoothstep(25, 260, d);
            const ramp = Math.pow(smoothstep(ROAD_HALF_WIDTH + 10, ROAD_HALF_WIDTH + 75, d), 1.5);
            const edge = -0.5 + 0.42 * smoothstep(ROAD_HALF_WIDTH + 0.5, ROAD_HALF_WIDTH + SHOULDER_WIDTH + 3, d);
            let h = base + t.relief(x, z, this.noise) * ramp + edge * (1 - ramp);
            if (t.postHeight) h = t.postHeight(x, z, h, this.noise);
            return h;
        }

        heightAt(x, z) {
            return this.terrainHeight(x, z, this.roadInfoAt(x, z));
        }

        forestMask(x, z) {
            const f = this.theme.forest;
            return smoothstep(f[0], f[1], this.noise.fbm(x * 0.006 + 100, z * 0.006 - 50, 3));
        }

        // ---------- Construction des décors ----------

        buildScenery() {
            this.disposeScenery();

            this.theme = THEMES[this.currentTheme] || THEMES.alps;
            this.noise = new Noise2D(this.theme.seed);
            this.rng = mulberry32(this.theme.seed * 7 + 1);
            this.palette = {};
            Object.keys(this.theme.palette).forEach(k => { this.palette[k] = lin(this.theme.palette[k]); });

            this.applyAtmosphere();
            this.createSharedMaterials();
            this.buildTerrain();
            this.buildRoad();

            if (this.currentTheme === 'alps') {
                this.buildAlpsScenery();
            } else if (this.currentTheme === 'coastal') {
                this.buildCoastalScenery();
            } else if (this.currentTheme === 'cyberpunk') {
                this.buildCyberpunkScenery();
            } else {
                this.buildCountrysideScenery();
            }

            if (!this.theme.night) this.buildDelineators();
            this.buildSpectators();
            this.buildFinishArch();
            this.buildClouds(this.theme.clouds);
            this.camSnap = true;
        }

        addScenery(obj) {
            this.scene.add(obj);
            this.sceneryObjects.push(obj);
            return obj;
        }

        trackTexture(tex) {
            this.sceneryTextures.push(tex);
            return tex;
        }

        disposeScenery() {
            const geos = new Set(), mats = new Set();
            this.sceneryObjects.forEach(obj => {
                this.scene.remove(obj);
                obj.traverse(o => {
                    if (o.geometry) geos.add(o.geometry);
                    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m));
                });
            });
            geos.forEach(g => g.dispose());
            mats.forEach(m => m.dispose());
            this.sceneryTextures.forEach(t => t.dispose());
            this.sceneryObjects = [];
            this.sceneryTextures = [];
            this.animatedProps = [];
            this.water = null;
            this.cloudGroup = null;
        }

        applyAtmosphere() {
            const t = this.theme;
            const u = this.skyUniforms;
            u.topColor.value.copy(lin(t.sky.top));
            u.horizonColor.value.copy(lin(t.sky.horizon));
            u.bottomColor.value.copy(lin(t.sky.bottom));
            u.sunColor.value.copy(lin(t.sky.sun));
            u.sunGlow.value = t.sky.glow;
            this.sunDir = new THREE.Vector3(t.sunDir[0], t.sunDir[1], t.sunDir[2]).normalize();
            u.sunDir.value.copy(this.sunDir);

            this.scene.fog = new THREE.FogExp2(lin(t.sky.horizon), t.fog);
            this.hemiLight.color.copy(lin(t.hemi[0]));
            this.hemiLight.groundColor.copy(lin(t.hemi[1]));
            this.hemiLight.intensity = t.hemi[2];
            this.dirLight.color.copy(lin(t.sunLight[0]));
            this.dirLight.intensity = t.sunLight[1];
            this.renderer.toneMappingExposure = t.exposure;
            this.headLight.intensity = t.night ? 1.6 : 0;
            this.stars.visible = !!t.night;
        }

        createSharedMaterials() {
            this.detailTex = this.trackTexture(canvasTexture(256, 256, (ctx, w, h) => {
                const rand = mulberry32(5);
                ctx.fillStyle = 'rgb(232,232,232)';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 1400; i++) {
                    const v = 190 + Math.floor(rand() * 65);
                    ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)';
                    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 4);
                }
                speckle(ctx, w, h, 26, rand);
            }, false));
            this.detailTex.anisotropy = Math.min(4, this.maxAnisotropy);

            this.vegMat = new THREE.MeshLambertMaterial({ vertexColors: true });
            this.vegMatDouble = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        }

        buildTerrain() {
            const seg = this.lowEnd ? 210 : 260;
            const geo = new THREE.PlaneGeometry(2, 2, seg, seg);
            geo.rotateX(-Math.PI / 2);
            const pos = geo.attributes.position;
            const uv = geo.attributes.uv;
            const count = pos.count;
            const heights = new Float32Array(count);
            const dists = new Float32Array(count);
            const xs = new Float32Array(count);
            const zs = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                const x = gridMap(pos.getX(i), 1050, 4200, 0.75);
                const z = gridMap(pos.getZ(i), 1050, 4200, 0.75);
                const info = this.roadInfoAt(x, z);
                const h = this.terrainHeight(x, z, info);
                pos.setXYZ(i, x, h, z);
                uv.setXY(i, x / 7, z / 7);
                heights[i] = h; dists[i] = info.d; xs[i] = x; zs[i] = z;
            }

            const row = seg + 1;
            const colors = new Float32Array(count * 3);
            const c = new THREE.Color();
            for (let iz = 0; iz < row; iz++) {
                for (let ix = 0; ix < row; ix++) {
                    const i = iz * row + ix;
                    const il = iz * row + Math.max(ix - 1, 0), ir = iz * row + Math.min(ix + 1, seg);
                    const iu = Math.max(iz - 1, 0) * row + ix, id = Math.min(iz + 1, seg) * row + ix;
                    const gx = (heights[ir] - heights[il]) / ((xs[ir] - xs[il]) || 1);
                    const gz = (heights[id] - heights[iu]) / ((zs[id] - zs[iu]) || 1);
                    const slope = Math.sqrt(gx * gx + gz * gz);
                    this.theme.color(c, xs[i], zs[i], heights[i], slope, dists[i], this);
                    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
                }
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geo.computeVertexNormals();
            geo.computeBoundingSphere();

            const matOptions = { vertexColors: true, map: this.detailTex };
            if (this.theme.night) {
                const grid = this.trackTexture(canvasTexture(128, 128, (ctx, w, h) => {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, 3);
                    ctx.fillRect(0, 0, 3, h);
                }));
                grid.repeat.set(7 / 24, 7 / 24);
                matOptions.emissive = lin(0x6d28d9);
                matOptions.emissiveMap = grid;
            }
            this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial(matOptions));
            this.terrainMesh.receiveShadow = true;
            this.addScenery(this.terrainMesh);
        }

        makeRoadTextures(night) {
            // 256 px = 7 m de large ; 1024 px = 15 m de long (deux tirets de 3 m)
            const rand = mulberry32(42);
            const drawLines = (ctx, w, h, color) => {
                ctx.fillStyle = color;
                ctx.fillRect(9, 0, 6, h);
                ctx.fillRect(w - 15, 0, 6, h);
                ctx.fillRect(w / 2 - 3, 0, 6, 205);
                ctx.fillRect(w / 2 - 3, 512, 6, 205);
            };
            const map = this.trackTexture(canvasTexture(256, 1024, (ctx, w, h) => {
                ctx.fillStyle = night ? '#1b1d24' : '#45474b';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 40; i++) {
                    ctx.fillStyle = 'rgba(20,20,22,' + (0.05 + rand() * 0.08) + ')';
                    ctx.beginPath();
                    ctx.ellipse(rand() * w, rand() * h, 10 + rand() * 50, 20 + rand() * 120, 0, 0, TAU);
                    ctx.fill();
                }
                // Traces d'usure des roues
                ctx.fillStyle = 'rgba(15,15,18,0.10)';
                ctx.fillRect(w * 0.22, 0, w * 0.12, h);
                ctx.fillRect(w * 0.66, 0, w * 0.12, h);
                drawLines(ctx, w, h, night ? 'rgba(120,230,255,0.9)' : 'rgba(238,238,232,0.92)');
                speckle(ctx, w, h, 34, rand);
            }));
            map.anisotropy = this.maxAnisotropy;
            let lineMask = null;
            if (night) {
                lineMask = this.trackTexture(canvasTexture(256, 1024, (ctx, w, h) => {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, w, h);
                    drawLines(ctx, w, h, '#fff');
                }));
                lineMask.anisotropy = this.maxAnisotropy;
            }
            return { map: map, lineMask: lineMask };
        }

        // Bande de route plate et texturée + accotements
        buildRoad() {
            const s = this.samples, n = s.n;
            const strip = (inner, outer, yInner, yOuter, side) => {
                const positions = new Float32Array((n + 1) * 2 * 3);
                const uvs = new Float32Array((n + 1) * 2 * 2);
                for (let i = 0; i <= n; i++) {
                    const k = i % n;
                    const rx = -s.tz[k], rz = s.tx[k];
                    const a = side ? inner * side : -inner;
                    const b = side ? outer * side : inner;
                    positions.set([s.x[k] + rx * a, s.y[k] + yInner, s.z[k] + rz * a, s.x[k] + rx * b, s.y[k] + (side ? yOuter : yInner), s.z[k] + rz * b], i * 6);
                    const v = (i * s.step) / 15;
                    uvs.set([0, v, 1, v], i * 4);
                }
                const index = [];
                for (let i = 0; i < n; i++) {
                    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
                    if (side < 0) index.push(a, c, b, b, c, d);
                    else index.push(a, b, c, b, d, c);
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                geo.setIndex(index);
                geo.computeVertexNormals();
                return geo;
            };

            const tex = this.makeRoadTextures(this.theme.night);
            const roadMat = this.theme.night
                ? new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.35, metalness: 0.45, emissive: lin(0x38e1ff), emissiveMap: tex.lineMask })
                : new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.88, metalness: 0.0 });
            this.roadMesh = new THREE.Mesh(strip(ROAD_HALF_WIDTH, 0, 0, 0, 0), roadMat);
            this.roadMesh.receiveShadow = true;
            this.addScenery(this.roadMesh);

            const shoulderMat = new THREE.MeshLambertMaterial({ color: lin(this.theme.shoulder), map: this.detailTex });
            [1, -1].forEach(side => {
                const g = strip(ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + SHOULDER_WIDTH, -0.015, -0.12, side);
                const uv = g.attributes.uv;
                for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.15, uv.getY(i) * 2);
                const mesh = new THREE.Mesh(g, shoulderMat);
                mesh.receiveShadow = true;
                this.addScenery(mesh);
            });
        }

        // Repère local de la route à un échantillon donné
        sampleFrame(i, lateral, along) {
            const s = this.samples;
            const k = ((i % s.n) + s.n) % s.n;
            const rx = -s.tz[k], rz = s.tx[k];
            return {
                x: s.x[k] + rx * lateral + s.tx[k] * (along || 0),
                y: s.y[k],
                z: s.z[k] + rz * lateral + s.tz[k] * (along || 0),
                heading: Math.atan2(s.tx[k], s.tz[k])
            };
        }

        // Répartition aléatoire le long de la route
        scatter(count, minD, maxD, accept, tries) {
            const out = [];
            const s = this.samples, rng = this.rng;
            const maxTries = count * (tries || 8);
            for (let t = 0; t < maxTries && out.length < count; t++) {
                const i = Math.floor(rng() * s.n);
                const side = rng() < 0.5 ? -1 : 1;
                const lat = (minD + (maxD - minD) * rng()) * side;
                const p = this.sampleFrame(i, lat, (rng() - 0.5) * 6);
                const info = this.roadInfoAt(p.x, p.z);
                if (info.d < minD) continue;
                const d = info.d;
                const h = this.terrainHeight(p.x, p.z, info);
                if (accept && !accept(p.x, p.z, h, d)) continue;
                out.push({ x: p.x, y: h, z: p.z, d: d, heading: p.heading, side: side });
            }
            return out;
        }

        instanced(geo, mat, items, options) {
            if (!items.length) return null;
            const opts = options || {};
            const mesh = new THREE.InstancedMesh(geo, mat, items.length);
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
            const p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
            items.forEach((it, k) => {
                e.set(it.tiltX || 0, it.rotY !== undefined ? it.rotY : this.rng() * TAU, it.tiltZ || 0);
                q.setFromEuler(e);
                p.set(it.x, it.y, it.z);
                sc.set(it.sx || 1, it.sy || 1, it.sz || it.sx || 1);
                m.compose(p, q, sc);
                mesh.setMatrixAt(k, m);
                // Couleur toujours définie : r128 partage le programme du matériau entre maillages instanciés
                if (opts.color) opts.color(col, it);
                else col.setRGB(1, 1, 1);
                mesh.setColorAt(k, col);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.frustumCulled = false;
            mesh.castShadow = !!opts.shadow;
            mesh.receiveShadow = !!opts.receive;
            this.addScenery(mesh);
            return mesh;
        }

        count(n) {
            return Math.round(this.lowEnd ? n * 0.55 : n);
        }

        // ---------- Géométries de décor ----------

        coniferGeometry() {
            const parts = [];
            const trunk = new THREE.CylinderGeometry(0.03, 0.045, 0.3, 6);
            trunk.translate(0, 0.15, 0);
            parts.push(paint(trunk, 0x4b3524));
            [[0.3, 0.42, 0.2, 0x21402a], [0.235, 0.38, 0.42, 0x264c2f], [0.165, 0.32, 0.62, 0x2b5434], [0.09, 0.24, 0.8, 0x315d39]].forEach(t => {
                const g = new THREE.ConeGeometry(t[0], t[1], 7, 1);
                g.translate(0, t[2] + t[1] / 2, 0);
                parts.push(paint(g, t[3]));
            });
            return mergeGeos(parts);
        }

        deciduousGeometry(trunkHex, leafA, leafB) {
            const trunk = new THREE.CylinderGeometry(0.035, 0.055, 0.52, 6);
            trunk.translate(0, 0.26, 0);
            paint(trunk, trunkHex);
            return mergeGeos([
                trunk,
                blob(0.3, 0, 0.68, 0, 1, 0.9, 1, leafA, 1),
                blob(0.2, 0.15, 0.58, 0.07, 1, 0.9, 1, leafB, 0),
                blob(0.22, -0.13, 0.6, -0.08, 1, 0.9, 1, leafB, 0),
                blob(0.19, 0.02, 0.85, -0.03, 1, 0.9, 1, leafA, 0)
            ]);
        }

        umbrellaPineGeometry() {
            const trunk = new THREE.CylinderGeometry(0.022, 0.04, 0.75, 6);
            trunk.translate(0, 0.37, 0);
            trunk.rotateZ(0.07);
            paint(trunk, 0x5e4330);
            return mergeGeos([
                trunk,
                blob(0.36, -0.03, 0.82, 0, 1, 0.33, 1, 0x3b5a28, 1),
                blob(0.22, 0.2, 0.77, 0.1, 1, 0.4, 1, 0x44652d, 0)
            ]);
        }

        palmGeometry() {
            const parts = [];
            const rand = mulberry32(8);
            let prev = new THREE.Vector3(0, 0, 0);
            for (let i = 1; i <= 6; i++) {
                const t = i / 6;
                const next = new THREE.Vector3(0, t, 0.12 * t * t);
                parts.push(paint(tubeBetween(prev, next, 0.03 - t * 0.008, 0.03 - (t - 1 / 6) * 0.008, 6), i % 2 ? 0x8a6f4d : 0x7a6043));
                prev = next;
            }
            const top = prev;
            for (let k = 0; k < 9; k++) {
                const ang = (k / 9) * TAU + rand() * 0.3;
                const ca = Math.cos(ang), sa = Math.sin(ang);
                const positions = [];
                const steps = 6;
                const pts = [];
                for (let j = 0; j <= steps; j++) {
                    const t = j / steps;
                    const half = 0.055 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
                    const cx = top.x + ca * 0.45 * t, cy = top.y + 0.06 * t - 0.3 * t * t, cz = top.z + sa * 0.45 * t;
                    pts.push([cx - sa * half, cy - 0.012, cz + ca * half, cx + sa * half, cy - 0.012, cz - ca * half, cx, cy, cz]);
                }
                for (let j = 0; j < steps; j++) {
                    const a = pts[j], b = pts[j + 1];
                    // Deux demi-feuilles avec une nervure centrale légèrement relevée
                    positions.push(a[0], a[1], a[2], a[6], a[7], a[8], b[0], b[1], b[2]);
                    positions.push(a[6], a[7], a[8], b[6], b[7], b[8], b[0], b[1], b[2]);
                    positions.push(a[6], a[7], a[8], a[3], a[4], a[5], b[3], b[4], b[5]);
                    positions.push(a[6], a[7], a[8], b[3], b[4], b[5], b[6], b[7], b[8]);
                }
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
                g.computeVertexNormals();
                parts.push(paint(g, k % 2 ? 0x3e7a2e : 0x4a8534));
            }
            return mergeGeos(parts);
        }

        bushGeometry(hex) {
            return mergeGeos([
                blob(1, 0, 0.45, 0, 1, 0.7, 1, hex, 0),
                blob(0.7, 0.6, 0.35, 0.3, 1, 0.75, 1, hex, 0)
            ]);
        }

        rockGeometry(hex) {
            const g = new THREE.DodecahedronGeometry(1, 0);
            const pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const k = 0.75 + 0.4 * hash2(Math.round(x * 100) + Math.round(z * 37), Math.round(y * 100));
                pos.setXYZ(i, x * k, y * k * 0.65, z * k);
            }
            g.computeVertexNormals();
            return paint(g, hex);
        }

        // Toit à deux pans (faîtage selon z)
        roofGeometry(w, d, rh, overhang, y) {
            const W = w / 2 + overhang, D = d / 2 + overhang;
            const A = [-W, y, -D], B = [W, y, -D], C = [0, y + rh, -D];
            const A2 = [-W, y, D], B2 = [W, y, D], C2 = [0, y + rh, D];
            const tris = [A, A2, C2, A, C2, C, B, C, C2, B, C2, B2, A, C, B, A2, B2, C2];
            const arr = new Float32Array(tris.length * 3);
            tris.forEach((p, i) => arr.set(p, i * 3));
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            g.computeVertexNormals();
            return g;
        }

        houseGeometry(o) {
            const parts = [];
            const found = 1.5;
            if (o.lowerWall) {
                const lower = new THREE.BoxGeometry(o.w, 2.6 + found, o.d);
                lower.translate(0, (2.6 - found) / 2, 0);
                parts.push(paint(lower, o.lowerWall));
                const upper = new THREE.BoxGeometry(o.w, o.h - 2.6, o.d);
                upper.translate(0, 2.6 + (o.h - 2.6) / 2, 0);
                parts.push(paint(upper, o.wall));
            } else {
                const body = new THREE.BoxGeometry(o.w, o.h + found, o.d);
                body.translate(0, (o.h - found) / 2, 0);
                parts.push(paint(body, o.wall));
            }
            parts.push(paint(this.roofGeometry(o.w, o.d, o.roofH, o.overhang, o.h), o.roof));
            const floors = o.h > 4.5 ? [1.5, 4.1] : [1.5];
            floors.forEach(y => {
                for (let k = 0; k < 3; k++) {
                    const z = (k - 1) * o.d * 0.3;
                    [-1, 1].forEach(sx => {
                        const win = new THREE.BoxGeometry(0.12, 1.2, 1.0);
                        win.translate(sx * (o.w / 2 + 0.03), y, z);
                        parts.push(paint(win, o.window || 0x2b3139));
                        if (o.shutters) {
                            [-0.75, 0.75].forEach(dz => {
                                const sh = new THREE.BoxGeometry(0.1, 1.25, 0.45);
                                sh.translate(sx * (o.w / 2 + 0.06), y, z + dz);
                                parts.push(paint(sh, o.shutters));
                            });
                        }
                    });
                }
            });
            const door = new THREE.BoxGeometry(1.1, 2.1, 0.12);
            door.translate(0, 1.05, o.d / 2 + 0.03);
            parts.push(paint(door, o.door || 0x4a3020));
            if (o.chimney) {
                const ch = new THREE.BoxGeometry(0.8, 2.2, 0.8);
                ch.translate(o.w * 0.22, o.h + o.roofH * 0.7, -o.d * 0.25);
                parts.push(paint(ch, o.chimney));
            }
            return mergeGeos(parts);
        }

        // Maisons : terrain assez plat, espacement minimal, façade orientée vers la route
        placeHouses(geo, count, minD, maxD, mat) {
            const placed = [];
            const spots = this.scatter(count * 6, minD, maxD, (x, z, h) => {
                if (h < 1) return false;
                for (let k = 0; k < placed.length; k++) {
                    const dx = placed[k].x - x, dz = placed[k].z - z;
                    if (dx * dx + dz * dz < 35 * 35) return false;
                }
                const hs = [this.heightAt(x + 7, z + 7), this.heightAt(x - 7, z + 7), this.heightAt(x + 7, z - 7), this.heightAt(x - 7, z - 7)];
                if (Math.max.apply(null, hs) - Math.min.apply(null, hs) > 3.5) return false;
                placed.push({ x: x, z: z });
                return true;
            }, 4);
            const items = spots.slice(0, count).map(p => {
                const sc = 0.85 + this.rng() * 0.35;
                return { x: p.x, y: p.y - 0.3, z: p.z, rotY: p.heading + (p.side > 0 ? Math.PI / 2 : -Math.PI / 2) + (this.rng() - 0.5) * 0.4, sx: sc, sy: sc, sz: sc };
            });
            return this.instanced(geo, mat || this.vegMat, items, { shadow: true, receive: true });
        }

        treeColor(col, base, spread) {
            const v = base + (this.rng() - 0.5) * spread;
            col.setRGB(v * (0.94 + this.rng() * 0.12), v, v * (0.9 + this.rng() * 0.15));
        }

        // Forêts : arbres proches (avec ombres) et lointains (sans ombres)
        plantForest(geo, mat, nearCount, farCount, sizeMin, sizeMax, accept, slim) {
            const mk = (p) => {
                const h = sizeMin + this.rng() * (sizeMax - sizeMin);
                const r = h * (slim || 1) * (0.85 + this.rng() * 0.3);
                return { x: p.x, y: p.y - 0.4, z: p.z, sx: r, sy: h, sz: r, tiltX: (this.rng() - 0.5) * 0.06, tiltZ: (this.rng() - 0.5) * 0.06 };
            };
            const color = (c) => this.treeColor(c, 1, 0.3);
            const near = this.scatter(this.count(nearCount), ROAD_HALF_WIDTH + 7, 110, accept, 12).map(mk);
            const far = this.scatter(this.count(farCount), 110, 900, accept, 12).map(mk);
            this.instanced(geo, mat, near, { shadow: true, color: color });
            this.instanced(geo, mat, far, { color: color });
        }

        buildAlpsScenery() {
            const forest = (x, z, h) => h < 430 && (this.forestMask(x, z) > 0.3 || this.rng() < 0.05);
            this.plantForest(this.coniferGeometry(), this.vegMat, 1500, 2600, 11, 26, forest);

            const rocks = this.scatter(this.count(170), ROAD_HALF_WIDTH + 5, 70, null).map(p => {
                const s = 0.5 + Math.pow(this.rng(), 2) * 2.8;
                return { x: p.x, y: p.y - s * 0.25, z: p.z, sx: s, sy: s, sz: s * (0.8 + this.rng() * 0.4) };
            });
            this.instanced(this.rockGeometry(0x8f8b84), this.vegMat, rocks, { shadow: true, color: (c) => this.treeColor(c, 1, 0.25) });

            const meadow = this.scatter(this.count(260), ROAD_HALF_WIDTH + 4, 60, (x, z) => this.forestMask(x, z) < 0.3).map(p => {
                const s = 0.4 + this.rng() * 0.9;
                return { x: p.x, y: p.y - 0.1, z: p.z, sx: s, sy: s * 0.8, sz: s };
            });
            this.instanced(this.bushGeometry(0x4c6e2e), this.vegMat, meadow, { color: (c) => this.treeColor(c, 1, 0.3) });

            this.placeHouses(this.houseGeometry({
                w: 9, d: 11, h: 6, roofH: 3, overhang: 1.1, lowerWall: 0xc4bcae, wall: 0x8a5a32,
                roof: 0x4b4039, shutters: 0x7a2e22, window: 0x2a2f36, chimney: 0x9e968a
            }), 10, ROAD_HALF_WIDTH + 18, 90);
        }

        buildCountrysideScenery() {
            const leaf = this.deciduousGeometry(0x5a4632, 0x4b782d, 0x5a8834);
            this.plantForest(leaf, this.vegMat, 700, 1500, 9, 17, (x, z) => this.forestMask(x, z) > 0.35);

            // Alignements de platanes le long de la route
            const planes = [];
            const s = this.samples;
            for (let i = 0; i < s.n; i += 6) {
                if (this.noise.value(i * 0.012, 3.3) < 0.05) continue;
                [-1, 1].forEach(side => {
                    const p = this.sampleFrame(i, side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 2.4), 0);
                    const info = this.roadInfoAt(p.x, p.z);
                    if (info.d < ROAD_HALF_WIDTH + SHOULDER_WIDTH + 1.5) return;
                    const h = 14 + this.rng() * 4;
                    planes.push({ x: p.x, y: this.terrainHeight(p.x, p.z, info) - 0.3, z: p.z, sx: h * 0.7, sy: h, sz: h * 0.7 });
                });
            }
            this.instanced(this.deciduousGeometry(0x9a8f78, 0x557f30, 0x638d38), this.vegMat, planes, { shadow: true, color: (c) => this.treeColor(c, 1, 0.2) });

            // Haies bocagères sur les limites de parcelles
            const ca = Math.cos(0.52), sa = Math.sin(0.52);
            const hedges = [];
            const candidates = this.scatter(this.count(1400), ROAD_HALF_WIDTH + 9, 260, null, 2);
            candidates.forEach(p => {
                const f = countryField(p.x, p.z);
                let u = f.u, v = f.v;
                const du = u - Math.round(u / 115) * 115, dv = v - Math.round(v / 78) * 78;
                if (Math.abs(du) < Math.abs(dv)) u -= du; else v -= dv;
                const x = u * ca - v * sa, z = u * sa + v * ca;
                const info = this.roadInfoAt(x, z);
                if (info.d < ROAD_HALF_WIDTH + 8) return;
                const s2 = 1.6 + this.rng() * 1.6;
                hedges.push({ x: x, y: this.terrainHeight(x, z, info) - 0.2, z: z, sx: s2 * 1.4, sy: s2, sz: s2 * 1.4 });
            });
            this.instanced(this.bushGeometry(0x3f6327), this.vegMat, hedges, { color: (c) => this.treeColor(c, 1, 0.3) });

            // Bottes de foin dans les champs de blé
            const balesGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14);
            balesGeo.rotateZ(Math.PI / 2);
            balesGeo.translate(0, 0.75, 0);
            paint(balesGeo, 0xcfaa55);
            const bales = this.scatter(this.count(90), 18, 220, (x, z) => {
                const f = countryField(x, z);
                return f.crop === 2 && f.edge > 8;
            }, 20).map(p => ({ x: p.x, y: p.y - 0.1, z: p.z }));
            this.instanced(balesGeo, this.vegMat, bales, { shadow: true, color: (c) => this.treeColor(c, 1, 0.15) });

            this.placeHouses(this.houseGeometry({
                w: 8, d: 13, h: 5.5, roofH: 3.4, overhang: 0.5, wall: 0xd8ccb2, roof: 0xa34d33,
                shutters: 0x5f7f8f, chimney: 0xb9ab92, door: 0x5f4430
            }), 12, ROAD_HALF_WIDTH + 18, 140);
            this.placeHouses(this.houseGeometry({
                w: 12, d: 18, h: 6.5, roofH: 3.8, overhang: 0.4, wall: 0x7d5a3c, roof: 0x5d5d5d, door: 0x3a2a1c
            }), 6, 30, 200);
        }

        buildCoastalScenery() {
            // Mer : normal map animée pour les reflets du soleil couchant
            const normalTex = this.trackTexture(this.makeWaterNormalTexture());
            normalTex.repeat.set(260, 260);
            const seaMat = new THREE.MeshPhongMaterial({
                color: lin(0x1d6f93), specular: lin(0xfff0d0), shininess: 70,
                normalMap: normalTex, normalScale: new THREE.Vector2(0.55, 0.55)
            });
            const sea = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), seaMat);
            sea.position.y = -2;
            sea.receiveShadow = true;
            this.addScenery(sea);
            this.water = normalTex;

            const low = (x, z, h) => h > 1.5 && h < 70;
            const palms = this.scatter(this.count(280), ROAD_HALF_WIDTH + 6, 34, low, 10).map(p => {
                const h = 7 + this.rng() * 5;
                return { x: p.x, y: p.y - 0.2, z: p.z, sx: h, sy: h, sz: h };
            });
            this.instanced(this.palmGeometry(), this.vegMatDouble, palms, { shadow: true, color: (c) => this.treeColor(c, 1, 0.2) });

            this.plantForest(this.umbrellaPineGeometry(), this.vegMat, 500, 1100, 9, 15, (x, z, h) => h > 3 && h < 380 && this.forestMask(x, z) > 0.3);

            const bushes = this.scatter(this.count(520), ROAD_HALF_WIDTH + 4, 120, (x, z, h) => h > 2).map(p => {
                const s = 0.5 + this.rng() * 1.2;
                return { x: p.x, y: p.y - 0.15, z: p.z, sx: s, sy: s * 0.75, sz: s };
            });
            this.instanced(this.bushGeometry(0x5c6e33), this.vegMat, bushes, { color: (c) => this.treeColor(c, 1, 0.35) });

            const rocks = this.scatter(this.count(110), ROAD_HALF_WIDTH + 5, 90, (x, z, h) => h > 0).map(p => {
                const s = 0.6 + this.rng() * 2.2;
                return { x: p.x, y: p.y - s * 0.3, z: p.z, sx: s, sy: s, sz: s };
            });
            this.instanced(this.rockGeometry(0xc2b49a), this.vegMat, rocks, { shadow: true, color: (c) => this.treeColor(c, 1, 0.2) });

            this.placeHouses(this.houseGeometry({
                w: 10, d: 12, h: 6.2, roofH: 2.2, overhang: 0.5, wall: 0xf3ece0, roof: 0xc0623a,
                shutters: 0x3f7f8a, chimney: 0xe6dccb, door: 0x6b4a2c
            }), 24, ROAD_HALF_WIDTH + 16, 160);

            this.buildSailboats(8);
        }

        buildSailboats(count) {
            const hullMat = new THREE.MeshStandardMaterial({ color: lin(0xf4f4f0), roughness: 0.5 });
            const sailMat = new THREE.MeshLambertMaterial({ color: lin(0xfbf8f0), side: THREE.DoubleSide });
            const mastMat = new THREE.MeshStandardMaterial({ color: lin(0xb0b4b8), metalness: 0.7, roughness: 0.3 });
            const hullGeo = new THREE.CylinderGeometry(1.2, 0.6, 8, 8, 1);
            hullGeo.rotateX(Math.PI / 2);
            hullGeo.scale(1, 0.55, 1);
            const sailGeo = new THREE.BufferGeometry();
            sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1.2, -0.2, 0, 10.5, -0.2, 0, 1.2, -3.6]), 3));
            sailGeo.computeVertexNormals();
            const mastGeo = new THREE.CylinderGeometry(0.06, 0.08, 10, 6);
            mastGeo.translate(0, 5.5, 0);
            for (let i = 0; i < count; i++) {
                const boat = new THREE.Group();
                boat.add(new THREE.Mesh(hullGeo, hullMat));
                boat.add(new THREE.Mesh(mastGeo, mastMat));
                boat.add(new THREE.Mesh(sailGeo, sailMat));
                const x = (this.rng() - 0.5) * 2600;
                const z = -1000 - this.rng() * 1600;
                boat.position.set(x, -1.6, z);
                boat.rotation.y = this.rng() * TAU;
                boat.userData.phase = this.rng() * TAU;
                this.addScenery(boat);
                this.animatedProps.push(boat);
            }
        }

        makeWaterNormalTexture() {
            const size = 256;
            const waves = [];
            const rand = mulberry32(77);
            for (let i = 0; i < 9; i++) {
                waves.push({ kx: Math.floor(rand() * 7) - 3, ky: 1 + Math.floor(rand() * 6), a: 0.6 / (i + 1), ph: rand() * TAU });
            }
            const hAt = (x, y) => {
                let h = 0;
                waves.forEach(w => { h += w.a * Math.sin(TAU * (w.kx * x + w.ky * y) + w.ph); });
                return h;
            };
            return canvasTexture(size, size, (ctx) => {
                const img = ctx.createImageData(size, size);
                const e = 1 / size;
                for (let j = 0; j < size; j++) {
                    for (let i = 0; i < size; i++) {
                        const x = i / size, y = j / size;
                        const dx = (hAt(x + e, y) - hAt(x - e, y)) * 2.2;
                        const dy = (hAt(x, y + e) - hAt(x, y - e)) * 2.2;
                        const len = Math.sqrt(dx * dx + dy * dy + 1);
                        const o = (j * size + i) * 4;
                        img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
                        img.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
                        img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
                        img.data[o + 3] = 255;
                    }
                }
                ctx.putImageData(img, 0, 0);
            }, false);
        }

        buildCyberpunkScenery() {
            const winTex = this.trackTexture(canvasTexture(512, 512, (ctx, w, h) => {
                const rand = mulberry32(13);
                const colors = ['#ffd9a0', '#9fe8ff', '#ff9ff3', '#fff4d6', '#b49cff'];
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, w, h);
                for (let cy = 0; cy < 16; cy++) {
                    for (let cx = 0; cx < 16; cx++) {
                        const lit = rand() < 0.38;
                        ctx.fillStyle = lit ? colors[Math.floor(rand() * colors.length)] : '#0a0d18';
                        ctx.globalAlpha = lit ? 0.55 + rand() * 0.45 : 1;
                        ctx.fillRect(cx * 32 + 6, cy * 32 + 8, 20, 16);
                    }
                }
                ctx.globalAlpha = 1;
            }));
            const bMat = new THREE.MeshLambertMaterial({ color: lin(0x121624), emissive: lin(0xffffff), emissiveMap: winTex });
            const neon = [0x22d3ee, 0xa855f7, 0xec4899, 0x22c55e, 0xf59e0b];
            const neonMats = neon.map(c => new THREE.MeshBasicMaterial({ color: lin(c), fog: true }));

            const placed = [];
            const spots = this.scatter(this.count(230), 20, 110, (x, z) => {
                for (let k = 0; k < placed.length; k++) {
                    const dx = placed[k].x - x, dz = placed[k].z - z;
                    if (dx * dx + dz * dz < 26 * 26) return false;
                }
                placed.push({ x: x, z: z });
                return true;
            }, 6);
            spots.forEach((p, idx) => {
                const w = 14 + this.rng() * 14, d = 14 + this.rng() * 14;
                const h = 25 + this.rng() * (40 + p.d * 1.1);
                const geo = new THREE.BoxGeometry(w, h, d);
                const uv = geo.attributes.uv;
                const ou = Math.floor(this.rng() * 16) / 16, ov = Math.floor(this.rng() * 16) / 16;
                for (let f = 0; f < 6; f++) {
                    for (let k = 0; k < 4; k++) {
                        const i = f * 4 + k;
                        if (f === 2 || f === 3) { uv.setXY(i, 0.002, 0.002); continue; }
                        const su = f < 2 ? d : w;
                        uv.setXY(i, ou + uv.getX(i) * su / 64, ov + uv.getY(i) * h / 64);
                    }
                }
                const b = new THREE.Mesh(geo, bMat);
                b.position.set(p.x, p.y + h / 2 - 1, p.z);
                b.rotation.y = p.heading;
                const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), neonMats[idx % neonMats.length]);
                rim.position.y = h / 2;
                b.add(rim);
                if (this.rng() < 0.35) {
                    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.8, 0.5), neonMats[(idx + 2) % neonMats.length]);
                    strip.position.set(w / 2 + 0.2, 0, d / 2 + 0.2);
                    b.add(strip);
                }
                this.addScenery(b);
            });

            // Silhouette lointaine de la ville
            const skyGeo = new THREE.BoxGeometry(30, 120, 30);
            const suv = skyGeo.attributes.uv;
            for (let i = 0; i < suv.count; i++) {
                const f = Math.floor(i / 4);
                if (f === 2 || f === 3) suv.setXY(i, 0.002, 0.002);
                else suv.setXY(i, suv.getX(i) * 30 / 64, suv.getY(i) * 120 / 64);
            }
            skyGeo.translate(0, 60, 0);
            const skyline = this.scatter(this.count(420), 140, 1500, null, 4).map(p => {
                const s = 0.6 + this.rng() * 0.9;
                return { x: p.x, y: p.y - 2, z: p.z, sx: s, sy: 0.5 + this.rng() * 1.6, sz: s, rotY: p.heading };
            });
            this.instanced(skyGeo, bMat, skyline, {});

            // Lampadaires néon
            const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
            poleGeo.translate(0, 3.5, 0);
            paint(poleGeo, 0x2a2d3a);
            const headGeo = new THREE.BoxGeometry(0.35, 0.25, 1.6);
            headGeo.translate(0, 7, 0);
            const poles = [], heads = [];
            const s = this.samples;
            for (let i = 0; i < s.n; i += 15) {
                const side = (i / 15) % 2 ? 1 : -1;
                const p = this.sampleFrame(i, side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 0.6), 0);
                poles.push({ x: p.x, y: p.y - 0.1, z: p.z, rotY: p.heading });
                heads.push({ x: p.x, y: p.y - 0.1, z: p.z, rotY: p.heading, hue: i });
            }
            this.instanced(poleGeo, this.vegMat, poles, {});
            const lampColors = [lin(0x22d3ee), lin(0xec4899), lin(0xa855f7)];
            this.instanced(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), heads, {
                color: (c, it) => c.copy(lampColors[(it.hue / 15) % 3])
            });
        }

        // Balises blanches à bande noire au bord de la route
        buildDelineators() {
            const post = new THREE.BoxGeometry(0.12, 1.0, 0.12);
            post.translate(0, 0.5, 0);
            const band = new THREE.BoxGeometry(0.13, 0.2, 0.13);
            band.translate(0, 0.8, 0);
            const refl = new THREE.BoxGeometry(0.06, 0.12, 0.135);
            refl.translate(0, 0.8, 0);
            const geo = mergeGeos([paint(post, 0xf2f2ee), paint(band, 0x161616), paint(refl, 0xff8a1f)]);
            const items = [];
            const s = this.samples;
            for (let i = 0; i < s.n; i += 25) {
                [-1, 1].forEach(side => {
                    const p = this.sampleFrame(i, side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 0.3), 0);
                    items.push({ x: p.x, y: p.y - 0.15, z: p.z, rotY: p.heading });
                });
            }
            this.instanced(geo, this.vegMat, items, {});
        }

        // Public en bord de route : ascension et zone d'arrivée
        buildSpectators() {
            const s = this.samples;
            const items = [];
            const max = this.count(this.theme.night ? 120 : 340);
            for (let i = 0; i < s.n && items.length < max; i++) {
                const ahead = (i + 3) % s.n;
                const slope = (s.y[ahead] - s.y[i]) / (3 * s.step);
                const nearArch = i < 60 || i > s.n - 60;
                const climbing = s.y[i] > 25 && slope > 0.03;
                if (!nearArch && !climbing) continue;
                const density = nearArch ? 0.9 : 0.35 * smoothstep(-0.2, 0.4, this.noise.value(i * 0.03, 8.8));
                if (this.rng() > density) continue;
                const side = this.rng() < 0.5 ? -1 : 1;
                const p = this.sampleFrame(i, side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 0.4 + this.rng() * 2.6), 0);
                const info = this.roadInfoAt(p.x, p.z);
                if (info.d < ROAD_HALF_WIDTH + SHOULDER_WIDTH) continue;
                const sc = 0.92 + this.rng() * 0.16;
                items.push({
                    x: p.x, y: this.terrainHeight(p.x, p.z, info) + 0.05, z: p.z,
                    rotY: p.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (this.rng() - 0.5) * 0.8,
                    sx: sc, sy: sc, sz: sc
                });
            }
            if (!items.length) return;

            const shirt = new THREE.CylinderGeometry(0.17, 0.19, 0.62, 8);
            shirt.translate(0, 1.18, 0);
            const armL = tubeBetween(new THREE.Vector3(0.21, 1.42, 0), new THREE.Vector3(0.28, 1.95, 0.05), 0.05);
            const armR = tubeBetween(new THREE.Vector3(-0.21, 1.42, 0), new THREE.Vector3(-0.24, 0.95, 0.05), 0.05);
            const shirtGeo = mergeGeos([shirt, armL, armR]);
            const legs = new THREE.BoxGeometry(0.32, 0.88, 0.2);
            legs.translate(0, 0.44, 0);
            const head = new THREE.SphereGeometry(0.11, 10, 8);
            head.translate(0, 1.62, 0);
            const cap = new THREE.SphereGeometry(0.115, 10, 6, 0, TAU, 0, Math.PI * 0.45);
            cap.translate(0, 1.65, 0);
            const restGeo = mergeGeos([paint(legs, 0x2c3650), paint(head, 0xd9a57e), paint(cap, 0xf2f2f2)]);

            const shirtColors = [0xef4444, 0xf5c518, 0xffffff, 0x22c55e, 0x3b82f6, 0xf97316, 0xec4899, 0x111827];
            const shirtMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            this.instanced(shirtGeo, shirtMat, items, { shadow: true, color: (c) => c.copy(lin(shirtColors[Math.floor(this.rng() * shirtColors.length)])) });
            this.instanced(restGeo, this.vegMat, items, { shadow: true });
        }

        // Arche gonflable d'arrivée, banderole et ligne en damier
        buildFinishArch() {
            const startPt = this.roadCurve.getPointAt(0);
            const tangent = this.roadCurve.getTangentAt(0);
            tangent.y = 0;
            tangent.normalize();

            const archGroup = new THREE.Group();
            const archMat = new THREE.MeshStandardMaterial({ color: lin(0xd62828), roughness: 0.55 });
            const arch = new THREE.Mesh(new THREE.TorusGeometry(ROAD_HALF_WIDTH + 1.4, 0.55, 12, 40, Math.PI), archMat);
            arch.castShadow = true;
            archGroup.add(arch);

            const bannerTex = this.trackTexture(canvasTexture(1024, 160, (ctx, w, h) => {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#d62828';
                ctx.fillRect(0, 0, w, 14);
                ctx.fillRect(0, h - 14, w, 14);
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 84px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('VÉLOTRAINER  •  ARRIVÉE', w / 2, h / 2 + 4);
            }));
            const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTex });
            [0, Math.PI].forEach(rot => {
                const banner = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.15), bannerMat);
                banner.position.y = ROAD_HALF_WIDTH + 0.35;
                banner.rotation.y = rot;
                banner.position.z = rot ? -0.05 : 0.05;
                archGroup.add(banner);
            });

            const checkerTex = this.trackTexture(canvasTexture(256, 32, (ctx, w, h) => {
                for (let i = 0; i < 16; i++) {
                    for (let j = 0; j < 2; j++) {
                        ctx.fillStyle = (i + j) % 2 ? '#111111' : '#f5f5f5';
                        ctx.fillRect(i * 16, j * 16, 16, 16);
                    }
                }
            }));
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 0.9),
                new THREE.MeshLambertMaterial({ map: checkerTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
            );
            line.rotation.x = -Math.PI / 2;
            line.position.y = 0.02;
            line.receiveShadow = true;
            archGroup.add(line);

            archGroup.position.copy(startPt);
            archGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
            this.addScenery(archGroup);
        }

        buildClouds(count) {
            if (!count) return;
            const textures = [0, 1, 2].map(seed => this.trackTexture(canvasTexture(256, 128, (ctx, w, h) => {
                const rand = mulberry32(seed + 30);
                for (let i = 0; i < 22; i++) {
                    const x = w * (0.18 + rand() * 0.64), y = h * (0.45 + rand() * 0.25);
                    const r = 18 + rand() * 34;
                    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                    g.addColorStop(0, 'rgba(255,255,255,0.55)');
                    g.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, TAU);
                    ctx.fill();
                }
            })));
            this.cloudGroup = new THREE.Group();
            const tint = lin(this.theme.cloudTint);
            for (let i = 0; i < count; i++) {
                const mat = new THREE.SpriteMaterial({
                    map: textures[i % 3], color: tint, transparent: true, depthWrite: false, fog: false,
                    opacity: 0.7 + this.rng() * 0.3
                });
                const sprite = new THREE.Sprite(mat);
                const a = this.rng() * TAU;
                const dist = 2600 + this.rng() * 4800;
                sprite.position.set(Math.cos(a) * dist, 1500 + this.rng() * 1100, Math.sin(a) * dist);
                const w = 1100 + this.rng() * 1800;
                sprite.scale.set(w, w * 0.45, 1);
                this.cloudGroup.add(sprite);
            }
            this.addScenery(this.cloudGroup);
        }

        // ---------- Cyclistes ----------

        createRiderShared() {
            const P = {};
            Object.keys(BIKE).forEach(k => { P[k] = v3(BIKE[k]); });
            const hip = P.hip;
            const at = (x, y, z) => new THREE.Vector3(x, y, z);
            const shared = {
                mats: {
                    black: new THREE.MeshStandardMaterial({ color: lin(0x151515), roughness: 0.6 }),
                    tire: new THREE.MeshStandardMaterial({ color: lin(0x111111), roughness: 0.9 }),
                    rim: new THREE.MeshStandardMaterial({ color: lin(0x1d1f23), roughness: 0.35, metalness: 0.5 }),
                    chrome: new THREE.MeshStandardMaterial({ color: lin(0xb9bdc3), roughness: 0.3, metalness: 0.85 }),
                    skin: new THREE.MeshStandardMaterial({ color: lin(0xd6a27c), roughness: 0.7 }),
                    shorts: new THREE.MeshStandardMaterial({ color: lin(0x131313), roughness: 0.75 }),
                    shoe: new THREE.MeshStandardMaterial({ color: lin(0xf2f2f2), roughness: 0.45 })
                }
            };

            shared.frame = mergeGeos([
                tubeBetween(P.bb, P.seatTop, 0.018),
                tubeBetween(P.seatTop, P.headTop, 0.017),
                tubeBetween(P.bb, P.headBottom, 0.023),
                tubeBetween(P.headBottom, P.headTop, 0.024),
                tubeBetween(at(0.045, P.bb.y, P.bb.z), at(0.06, P.rearAxle.y, P.rearAxle.z), 0.011),
                tubeBetween(at(-0.045, P.bb.y, P.bb.z), at(-0.06, P.rearAxle.y, P.rearAxle.z), 0.011),
                tubeBetween(at(0.03, P.seatTop.y - 0.03, P.seatTop.z), at(0.06, P.rearAxle.y, P.rearAxle.z), 0.009),
                tubeBetween(at(-0.03, P.seatTop.y - 0.03, P.seatTop.z), at(-0.06, P.rearAxle.y, P.rearAxle.z), 0.009),
                tubeBetween(P.headBottom, at(0.05, P.frontAxle.y, P.frontAxle.z), 0.013, 0.01),
                tubeBetween(P.headBottom, at(-0.05, P.frontAxle.y, P.frontAxle.z), 0.013, 0.01)
            ]);

            const saddle = new THREE.BoxGeometry(0.13, 0.035, 0.27);
            saddle.translate(0, 0.85, -0.17);
            const bar = new THREE.CylinderGeometry(0.013, 0.013, 0.42, 8);
            bar.rotateZ(Math.PI / 2);
            bar.translate(0, 0.79, 0.56);
            const chainring = new THREE.TorusGeometry(0.1, 0.008, 4, 24);
            chainring.rotateY(Math.PI / 2);
            chainring.translate(-0.065, P.bb.y, P.bb.z);
            const bottle = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8);
            const bottleGeo = tubeBetween(at(0, 0.42, 0.13), at(0, 0.55, 0.28), 0.034);
            const blackParts = [saddle, bar, chainring, bottleGeo,
                tubeBetween(P.seatTop, at(0, 0.835, -0.165), 0.014),
                tubeBetween(P.headTop, at(0, 0.79, 0.55), 0.016)];
            [-1, 1].forEach(s => {
                blackParts.push(tubeBetween(at(s * 0.2, 0.79, 0.56), at(s * 0.2, 0.81, 0.63), 0.012));
                blackParts.push(tubeBetween(at(s * 0.2, 0.81, 0.63), at(s * 0.2, 0.7, 0.61), 0.012));
            });
            shared.bikeBlack = mergeGeos(blackParts);
            bottle.dispose();

            shared.tire = new THREE.TorusGeometry(0.325, 0.017, 6, 32).rotateY(Math.PI / 2);
            shared.rim = new THREE.TorusGeometry(0.3, 0.02, 4, 32).rotateY(Math.PI / 2);
            const spokes = [];
            for (let k = 0; k < 14; k++) {
                const a = (k / 14) * TAU;
                spokes.push(tubeBetween(at(0, 0, 0), at(0, Math.cos(a) * 0.29, Math.sin(a) * 0.29), 0.0025, 0.0025, 3));
            }
            const hub = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8);
            hub.rotateZ(Math.PI / 2);
            spokes.push(hub);
            shared.spokes = mergeGeos(spokes);

            const armR = new THREE.BoxGeometry(0.018, CRANK_LENGTH, 0.03);
            armR.translate(-0.085, CRANK_LENGTH / 2, 0);
            const armL = new THREE.BoxGeometry(0.018, CRANK_LENGTH, 0.03);
            armL.translate(0.085, -CRANK_LENGTH / 2, 0);
            const pedalR = new THREE.BoxGeometry(0.09, 0.018, 0.07);
            pedalR.translate(-0.125, CRANK_LENGTH, 0);
            const pedalL = new THREE.BoxGeometry(0.09, 0.018, 0.07);
            pedalL.translate(0.125, -CRANK_LENGTH, 0);
            const spindle = new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6);
            spindle.rotateZ(Math.PI / 2);
            shared.crank = mergeGeos([armR, armL, pedalR, pedalL, spindle]);

            // Haut du corps (coordonnées relatives à la hanche)
            const toHip = (g) => { g.translate(-hip.x, -hip.y, -hip.z); return g; };
            const torso = tubeBetween(hip, P.shoulder, 0.135, 0.15, 10, 1.35, 0.8);
            const chest = new THREE.SphereGeometry(0.14, 12, 8);
            chest.scale(1.4, 0.8, 0.95);
            chest.translate(P.shoulder.x, P.shoulder.y - 0.03, P.shoulder.z - 0.02);
            const jerseyParts = [torso, chest];
            const skinParts = [];
            const blackUpper = [];
            [-1, 1].forEach(s => {
                const sh = at(s * 0.2, 1.29, 0.24), el = at(s * 0.215, 1.05, 0.4), hand = at(s * 0.2, 0.82, 0.6);
                jerseyParts.push(tubeBetween(sh, el, 0.048, 0.044, 8));
                skinParts.push(tubeBetween(el, hand, 0.04, 0.032, 8));
                const glove = new THREE.SphereGeometry(0.038, 8, 6);
                glove.translate(hand.x, hand.y, hand.z);
                blackUpper.push(glove);
            });
            skinParts.push(tubeBetween(at(0, 1.33, 0.28), P.head, 0.048, 0.044, 8));
            const face = new THREE.SphereGeometry(0.1, 12, 10);
            face.translate(P.head.x, P.head.y, P.head.z);
            skinParts.push(face);
            const pelvis = new THREE.SphereGeometry(0.13, 12, 8);
            pelvis.scale(1.25, 0.8, 1.15);
            pelvis.translate(hip.x, hip.y, hip.z);
            blackUpper.push(pelvis);
            const glasses = new THREE.BoxGeometry(0.18, 0.035, 0.04);
            glasses.translate(0, P.head.y + 0.005, P.head.z + 0.09);
            blackUpper.push(glasses);
            const helmet = new THREE.SphereGeometry(0.13, 14, 10, 0, TAU, 0, Math.PI * 0.55);
            helmet.scale(0.95, 0.85, 1.25);
            helmet.translate(P.head.x, P.head.y + 0.025, P.head.z - 0.015);

            shared.torso = toHip(mergeGeos(jerseyParts));
            shared.skin = toHip(mergeGeos(skinParts));
            shared.upperBlack = toHip(mergeGeos(blackUpper));
            shared.helmet = toHip(helmet);

            shared.thighShorts = new THREE.CylinderGeometry(0.07, 0.056, THIGH_LENGTH * 0.68, 8).translate(0, -THIGH_LENGTH * 0.34, 0);
            const thighSkin = new THREE.CylinderGeometry(0.056, 0.05, THIGH_LENGTH * 0.32, 8).translate(0, -THIGH_LENGTH * 0.84, 0);
            const knee = new THREE.SphereGeometry(0.05, 8, 6).translate(0, -THIGH_LENGTH, 0);
            shared.thighSkin = mergeGeos([thighSkin, knee]);
            shared.shin = new THREE.CylinderGeometry(0.046, 0.033, SHIN_LENGTH, 8).translate(0, -SHIN_LENGTH / 2, 0);
            shared.shoe = new THREE.BoxGeometry(0.085, 0.065, 0.25).translate(0, 0, 0.03);
            return shared;
        }

        buildRider(frameHex, jerseyHex, helmetHex) {
            const g = this.riderShared || (this.riderShared = this.createRiderShared());
            const M = g.mats;
            const mats = {
                frame: new THREE.MeshStandardMaterial({ color: lin(frameHex), metalness: 0.5, roughness: 0.32 }),
                jersey: new THREE.MeshStandardMaterial({ color: lin(jerseyHex), roughness: 0.68 }),
                helmet: new THREE.MeshStandardMaterial({ color: lin(helmetHex), roughness: 0.3, metalness: 0.1 })
            };
            const group = new THREE.Group();
            group.add(new THREE.Mesh(g.frame, mats.frame));
            group.add(new THREE.Mesh(g.bikeBlack, M.black));

            const wheels = [BIKE.frontAxle, BIKE.rearAxle].map(axle => {
                const w = new THREE.Group();
                w.position.set(axle[0], axle[1], axle[2]);
                w.add(new THREE.Mesh(g.tire, M.tire));
                w.add(new THREE.Mesh(g.rim, M.rim));
                w.add(new THREE.Mesh(g.spokes, M.chrome));
                group.add(w);
                return w;
            });

            const crank = new THREE.Group();
            crank.position.set(BIKE.bb[0], BIKE.bb[1], BIKE.bb[2]);
            crank.add(new THREE.Mesh(g.crank, M.chrome));
            group.add(crank);

            const upper = new THREE.Group();
            upper.position.set(BIKE.hip[0], BIKE.hip[1], BIKE.hip[2]);
            upper.add(new THREE.Mesh(g.torso, mats.jersey));
            upper.add(new THREE.Mesh(g.skin, M.skin));
            upper.add(new THREE.Mesh(g.upperBlack, M.shorts));
            upper.add(new THREE.Mesh(g.helmet, mats.helmet));
            group.add(upper);

            const legs = [-1, 1].map(side => {
                const thigh = new THREE.Group();
                thigh.position.set(side * 0.095, BIKE.hip[1], BIKE.hip[2]);
                thigh.add(new THREE.Mesh(g.thighShorts, M.shorts));
                thigh.add(new THREE.Mesh(g.thighSkin, M.skin));
                const shin = new THREE.Mesh(g.shin, M.skin);
                const foot = new THREE.Mesh(g.shoe, M.shoe);
                group.add(thigh, shin, foot);
                return { side: side, thigh: thigh, shin: shin, foot: foot };
            });

            group.traverse(o => { if (o.isMesh) o.castShadow = true; });
            const rider = { group: group, wheels: wheels, crank: crank, upper: upper, legs: legs, mats: mats, wheelAngle: 0, crankAngle: Math.random() * TAU, lean: 0 };
            this.poseRiderLegs(rider);
            return rider;
        }

        // Cinématique inverse à deux segments : hanche → genou → pédale
        poseRiderLegs(rider) {
            const hipY = BIKE.hip[1], hipZ = BIKE.hip[2];
            rider.legs.forEach(leg => {
                const angle = rider.crankAngle + (leg.side > 0 ? Math.PI : 0);
                const fy = BIKE.bb[1] + CRANK_LENGTH * Math.cos(angle) + 0.035;
                const fz = BIKE.bb[2] + CRANK_LENGTH * Math.sin(angle);
                const vy = fy - hipY, vz = fz - hipZ;
                const dist = clamp(Math.sqrt(vy * vy + vz * vz), 0.05, THIGH_LENGTH + SHIN_LENGTH - 0.001);
                const alpha = Math.atan2(vz, -vy);
                const cosB = clamp((THIGH_LENGTH * THIGH_LENGTH + dist * dist - SHIN_LENGTH * SHIN_LENGTH) / (2 * THIGH_LENGTH * dist), -1, 1);
                const thighA = alpha + Math.acos(cosB);
                const ky = hipY - THIGH_LENGTH * Math.cos(thighA);
                const kz = hipZ + THIGH_LENGTH * Math.sin(thighA);
                const shinA = Math.atan2(fz - kz, -(fy - ky));
                leg.thigh.rotation.x = -thighA;
                leg.shin.position.set(leg.side * 0.11, ky, kz);
                leg.shin.rotation.x = -shinA;
                leg.foot.position.set(leg.side * 0.125, fy, fz);
            });
        }

        animateRider(rider, dt, speedMps, cadenceRpm) {
            rider.wheelAngle += (speedMps * dt) / WHEEL_RADIUS;
            rider.wheels[0].rotation.x = rider.wheelAngle;
            rider.wheels[1].rotation.x = rider.wheelAngle;
            rider.crankAngle += (cadenceRpm / 60) * TAU * dt;
            rider.crank.rotation.x = rider.crankAngle;
            this.poseRiderLegs(rider);
            const effort = clamp(cadenceRpm / 90, 0, 1.2);
            rider.upper.rotation.z = Math.sin(rider.crankAngle) * 0.03 * effort;
        }

        // Position sur la route, cap et inclinaison dans les virages
        placeRider(rider, distance, lateral, speedMps, dt) {
            const t = this.tmp;
            const L = this.roadLength;
            const u = (((distance % L) + L) % L) / L;
            this.roadCurve.getPointAt(u, t.pos);
            this.roadCurve.getTangentAt(u, t.tan);
            t.right.set(-t.tan.z, 0, t.tan.x).normalize();
            t.pos.addScaledVector(t.right, lateral);

            const u2 = (u + 4 / L) % 1;
            this.roadCurve.getTangentAt(u2, t.tan2);
            const curvature = (t.tan.z * t.tan2.x - t.tan.x * t.tan2.z) / 4;
            const targetLean = clamp(Math.atan((speedMps * speedMps * curvature) / 9.81), -0.4, 0.4);
            rider.lean += (targetLean - rider.lean) * (1 - Math.exp(-dt * 3));

            t.x.crossVectors(t.up, t.tan).normalize();
            t.y.crossVectors(t.tan, t.x);
            t.m.makeBasis(t.x, t.y, t.tan);
            rider.group.quaternion.setFromRotationMatrix(t.m);
            t.qRoll.setFromAxisAngle(t.zAxis, -rider.lean);
            rider.group.quaternion.multiply(t.qRoll);
            rider.group.position.copy(t.pos);
            return t.pos;
        }

        createPlayerAvatar() {
            this.playerRider = this.buildRider(0x0b4f8a, 0x1d8fd8, 0xffffff); // Bleu Van Rysel
            this.playerMesh = this.playerRider.group;
            this.playerMesh.visible = this.cameraMode === 'chase';
            this.scene.add(this.playerMesh);
        }

        createCompetitors() {
            this.competitors.forEach(bot => {
                bot.rider = this.buildRider(0x1a1a1a, bot.color, bot.helmet);
                bot.mesh = bot.rider.group;
                bot.cadence = 86 + Math.random() * 10;
                bot.absSpeed = bot.speedBase;
                this.scene.add(bot.mesh);
            });
        }

        // Basculement entre caméra guidon (POV) et poursuite arrière
        toggleCameraMode() {
            this.cameraMode = this.cameraMode === 'chase' ? 'pov' : 'chase';
            if (this.playerMesh) {
                // En mode guidon POV, on cache le corps du joueur pour avoir la vue totalement dégagée
                this.playerMesh.visible = (this.cameraMode === 'chase');
            }
            this.camSnap = true;
            return this.cameraMode;
        }

        setTheme(theme) {
            if (this.currentTheme !== theme) {
                this.currentTheme = theme;
                if (this.isActive) this.buildScenery();
            }
        }

        // Mise à jour de la vitesse et de la position physique
        updatePlayerSpeed(speedKmh) {
            this.playerSpeedMps = (speedKmh || 0) / 3.6;
        }

        updatePlayerCadence(rpm) {
            this.playerCadence = rpm || 0;
            this.hasCadenceData = true;
        }

        roadPointAt(distance, lateral, out) {
            const L = this.roadLength;
            const u = (((distance % L) + L) % L) / L;
            this.roadCurve.getPointAt(u, out);
            if (lateral) {
                this.roadCurve.getTangentAt(u, this.tmp.tan2);
                out.x += -this.tmp.tan2.z * lateral;
                out.z += this.tmp.tan2.x * lateral;
            }
            return out;
        }

        // Boucle d'animation principale (60 FPS)
        animate(timestamp) {
            if (!this.isActive) return;

            const rawDelta = (timestamp - this.lastTimestamp) / 1000;
            const deltaSeconds = Math.min(0.1, Math.max(0, rawDelta));
            this.lastTimestamp = timestamp;
            this.elapsed += deltaSeconds;

            // 1. Avancement du joueur le long de la boucle
            this.playerDistance = (this.playerDistance + this.playerSpeedMps * deltaSeconds) % this.roadLength;
            const playerU = this.playerDistance / this.roadLength;

            // Pente locale lissée sur ±5 m
            const ahead = this.roadPointAt(this.playerDistance + 5, 0, this.tmp.a).y;
            const behind = this.roadPointAt(this.playerDistance - 5, 0, this.tmp.b).y;
            this.currentSlope = parseFloat((((ahead - behind) / 10) * 100).toFixed(1));

            // 2. Avatar joueur
            const cadence = this.hasCadenceData ? this.playerCadence : (this.playerSpeedMps > 0.5 ? 85 : 0);
            const playerPos = this.placeRider(this.playerRider, this.playerDistance, PLAYER_LANE, this.playerSpeedMps, deltaSeconds).clone();
            if (this.playerMesh.visible) this.animateRider(this.playerRider, deltaSeconds, this.playerSpeedMps, cadence);
            else this.playerRider.crankAngle += (cadence / 60) * TAU * deltaSeconds;

            // 3. Caméra
            this.updateCamera(deltaSeconds, playerPos);

            // 4. IA des concurrents
            this.updateCompetitors(deltaSeconds, playerU);

            // 5. Soleil, ciel et décors animés
            if (this.dirLight) {
                this.dirLight.position.copy(playerPos).addScaledVector(this.sunDir, 300);
                this.dirLight.target.position.copy(playerPos);
            }
            this.headLight.position.set(playerPos.x, playerPos.y + 4, playerPos.z);
            this.skyGroup.position.copy(this.camera.position);
            if (this.cloudGroup) this.cloudGroup.rotation.y += deltaSeconds * 0.002;
            if (this.water) {
                this.water.offset.x += deltaSeconds * 0.004;
                this.water.offset.y += deltaSeconds * 0.0025;
            }
            this.animatedProps.forEach(p => {
                p.position.y = -1.6 + Math.sin(this.elapsed * 0.8 + p.userData.phase) * 0.25;
                p.rotation.z = Math.sin(this.elapsed * 0.6 + p.userData.phase) * 0.05;
            });

            // 6. Rendu
            this.renderer.render(this.scene, this.camera);
            this.monitorPerformance(rawDelta);

            this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
        }

        updateCamera(dt, playerPos) {
            const t = this.tmp;
            const snap = this.camSnap;
            this.camSnap = false;
            const posK = snap ? 1 : 1 - Math.exp(-dt * 5);
            const lookK = snap ? 1 : 1 - Math.exp(-dt * 6);

            if (this.cameraMode === 'chase') {
                // Vue 3ème personne : derrière, en suivant les courbes de la route
                this.roadPointAt(this.playerDistance - 4.8, PLAYER_LANE * 0.6, t.camTarget);
                t.camTarget.y = Math.max(t.camTarget.y, playerPos.y) + 1.85;
                this.roadPointAt(this.playerDistance + 9, PLAYER_LANE * 0.8, t.lookTarget);
                t.lookTarget.y += 0.9;
            } else {
                // Vue 1ère personne (guidon) : léger balancement au rythme du pédalage
                const crank = this.playerRider.crankAngle;
                const bob = this.playerSpeedMps > 0.5 ? 1 : 0;
                this.roadPointAt(this.playerDistance + 0.2, PLAYER_LANE + Math.sin(crank) * 0.015 * bob, t.camTarget);
                t.camTarget.y += 1.45 + Math.abs(Math.sin(crank)) * 0.012 * bob;
                this.roadPointAt(this.playerDistance + 32, PLAYER_LANE * 0.6, t.lookTarget);
                t.lookTarget.y += 1.15;
            }

            // Recalage immédiat après un saut de position (nouveau parcours, changement de thème)
            const jump = this.camera.position.distanceToSquared(t.camTarget) > 900;
            this.camera.position.lerp(t.camTarget, this.cameraMode === 'pov' || jump ? 1 : posK);
            this.camLook.lerp(t.lookTarget, jump ? 1 : lookK);
            this.camera.lookAt(this.camLook);
        }

        updateCompetitors(deltaSeconds, playerU) {
            this.competitors.forEach((bot, idx) => {
                // Vitesse selon la pente (les grimpeurs sont plus rapides en montée)
                const botDist = this.playerDistance + bot.distance;
                const y1 = this.roadPointAt(botDist + 5, 0, this.tmp.a).y;
                const y0 = this.roadPointAt(botDist - 5, 0, this.tmp.b).y;
                const slope = ((y1 - y0) / 10) * 100;
                let botSpeed = bot.speedBase * clamp(1 - slope * 0.055, 0.45, 1.35);
                if (slope > 2.0 && bot.name.includes("Tadej")) {
                    botSpeed += 1.2; // Attaque en montée
                } else if (slope < 0 && bot.name.includes("Wout")) {
                    botSpeed += 1.5; // Rapide en descente
                }
                botSpeed += Math.sin(this.elapsed * 0.11 + idx * 1.7) * 0.35;
                bot.absSpeed = botSpeed;

                // Progression relative au joueur
                bot.distance = (bot.distance + (botSpeed - this.playerSpeedMps) * deltaSeconds);

                if (bot.rider) {
                    this.placeRider(bot.rider, this.playerDistance + bot.distance, bot.lane, botSpeed, deltaSeconds);
                    if (Math.abs(bot.distance) < 150) {
                        this.animateRider(bot.rider, deltaSeconds, botSpeed, bot.cadence * clamp(botSpeed / 9, 0.75, 1.1));
                    }
                }
            });

            this.computeRankings();
        }

        computeRankings() {
            const list = [
                { name: "VOUS", distance: 0, isPlayer: true },
                ...this.competitors.map(c => ({ name: c.name, distance: c.distance, isPlayer: false }))
            ];

            list.sort((a, b) => b.distance - a.distance);

            this.rankings = list.map((item, index) => ({
                rank: index + 1,
                name: item.name,
                gapMeters: Math.round(item.distance),
                isPlayer: item.isPlayer
            }));

            this.playerRank = list.findIndex(i => i.isPlayer) + 1;
        }

        // Résolution adaptative : garde une animation fluide sur les TV peu puissantes
        monitorPerformance(rawDelta) {
            if (document.hidden || rawDelta <= 0 || rawDelta > 0.5) return;
            const p = this.perf;
            p.frames++;
            p.time += rawDelta;
            if (p.time < 2.5) return;
            const fps = p.frames / p.time;
            p.frames = 0;
            p.time = 0;
            if (p.warmup > 0) {
                p.warmup--;
                return;
            }
            if (fps < 28 && this.pixelRatio > 0.55) {
                this.pixelRatio = Math.max(0.55, this.pixelRatio - 0.15);
                this.renderer.setPixelRatio(this.pixelRatio);
            }
        }

        onWindowResize() {
            if (!this.container || !this.renderer || !this.camera) return;
            const width = this.container.clientWidth || window.innerWidth;
            const height = this.container.clientHeight || window.innerHeight;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }

        destroy() {
            this.isActive = false;
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
            if (this.renderer && this.renderer.domElement) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
    }

    window.cycling3DWorld = new Cycling3DWorld();
})();
