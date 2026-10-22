// --- MOTEUR DE MONDE 3D ET COURSE CYCLISTE IMMERSIVE (STYLE ZWIFT / ROUVY) ---
// Utilise Three.js pour générer un monde 3D dynamique à 60 FPS sur grand écran TV

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
        this.currentSlope = 0.0; // en %

        // Thèmes disponibles : 'alps', 'coastal', 'cyberpunk', 'countryside'
        this.currentTheme = 'alps';

        // Profil de la route (segments avec courbes et dénivelé)
        this.roadLength = 5000; // 5 km de boucle
        this.roadPoints = [];
        this.roadCurve = null;
        this.roadMesh = null;
        this.terrainMesh = null;
        this.sceneryObjects = [];

        // Concurrents virtuels (IA Bots)
        this.competitors = [
            { name: "Julian (Attaquant)", color: 0xef4444, jersey: "Rouge", speedBase: 9.8, distance: 40, mesh: null, rank: 2 },
            { name: "Tadej (Grimpeur)",   color: 0xf59e0b, jersey: "Jaune", speedBase: 9.5, distance: 80, mesh: null, rank: 1 },
            { name: "Wout (Rouleur)",     color: 0x22c55e, jersey: "Vert",  speedBase: 9.2, distance: 15, mesh: null, rank: 3 },
            { name: "Mathieu (Puncheur)", color: 0x8b5cf6, jersey: "Violet",speedBase: 9.0, distance: -30, mesh: null, rank: 5 }
        ];

        // Avatar joueur
        this.playerMesh = null;

        this.animationFrameId = null;
        this.lastTimestamp = 0;
    }

    init(containerElement) {
        this.container = containerElement;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        // 1. Scène Three.js
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0xd0e8ff, 0.002);

        // 2. Caméra
        this.camera = new THREE.PerspectiveCamera(65, width / height, 0.5, 2000);
        this.camera.position.set(0, 5, -10);

        // 3. Renderer WebGL avec ombres douces et antialiasing
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.appendChild(this.renderer.domElement);
        this.canvas = this.renderer.domElement;

        // Redimensionnement dynamique
        window.addEventListener('resize', () => this.onWindowResize());

        // 4. Lumières
        this.setupLights();

        // 5. Génération du tracé et de l'environnement
        this.generateCircuit();
        this.buildScenery();
        this.createPlayerAvatar();
        this.createCompetitors();

        this.isActive = true;
        this.lastTimestamp = performance.now();
        this.animate(this.lastTimestamp);
    }

    setupLights() {
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.7);
        hemiLight.position.set(0, 200, 0);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
        this.dirLight.position.set(100, 250, 100);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 800;
        const d = 150;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.scene.add(this.dirLight);
    }

    // Génération mathématique d'un circuit réaliste de 5 km (virages, montées et faux-plats)
    generateCircuit() {
        this.roadPoints = [];
        const numPoints = 120;
        const radiusX = 600;
        const radiusZ = 450;

        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            
            // Ondulations organiques du tracé (virages en lacets)
            const rX = radiusX + Math.sin(angle * 3) * 120 + Math.cos(angle * 5) * 40;
            const rZ = radiusZ + Math.cos(angle * 2) * 100 + Math.sin(angle * 4) * 60;
            
            const x = Math.cos(angle) * rX;
            const z = Math.sin(angle) * rZ;

            // Relief : montée de col (jusqu'à +6%), plateau et descente souple
            let y = 0;
            if (angle > 0.5 && angle < 2.5) {
                // Section Montée de Col des Alpes
                y = Math.sin((angle - 0.5) / 2.0 * Math.PI) * 75;
            } else if (angle >= 2.5 && angle < 4.0) {
                // Plateau sommital
                y = 75 - ((angle - 2.5) / 1.5) * 20;
            } else {
                // Descente progressive
                y = Math.max(0, 55 * (1 - (angle - 4.0) / (Math.PI * 2 - 4.0)));
            }

            this.roadPoints.push(new THREE.Vector3(x, y, z));
        }

        // Créer une courbe 3D fermée fluide
        this.roadCurve = new THREE.CatmullRomCurve3(this.roadPoints, true, 'centripetal');
        this.roadLength = this.roadCurve.getLength();

        // 1. Maillage de la route (Asphalte)
        const roadGeo = new THREE.TubeGeometry(this.roadCurve, 400, 4.2, 8, true);
        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x22262c,
            roughness: 0.8,
            metalness: 0.1
        });
        this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
        this.roadMesh.receiveShadow = true;
        this.scene.add(this.roadMesh);

        // 2. Ligne blanche centrale de la route
        const lineGeo = new THREE.TubeGeometry(this.roadCurve, 400, 0.15, 4, true);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.position.y += 0.05;
        this.scene.add(lineMesh);
    }

    // Création des décors spectaculaires selon le thème choisi
    buildScenery() {
        // Supprimer anciens décors
        this.sceneryObjects.forEach(obj => this.scene.remove(obj));
        this.sceneryObjects = [];

        if (this.currentTheme === 'alps') {
            this.buildAlpsScenery();
        } else if (this.currentTheme === 'coastal') {
            this.buildCoastalScenery();
        } else if (this.currentTheme === 'cyberpunk') {
            this.buildCyberpunkScenery();
        } else {
            this.buildCountrysideScenery();
        }
    }

    // Décor 1 : Col des Alpes (Montagnes majestueuses, sapins alpins, rochers, chalets)
    buildAlpsScenery() {
        this.scene.background = new THREE.Color(0xb0d8ff);
        this.scene.fog = new THREE.FogExp2(0xb0d8ff, 0.0018);

        // Terrain montagneux verdoyant
        const terrainGeo = new THREE.PlaneGeometry(2400, 2400, 60, 60);
        terrainGeo.rotateX(-Math.PI / 2);
        const pos = terrainGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getZ(i);
            const dist = Math.sqrt(vx * vx + vz * vz);
            if (dist > 350) {
                // Grandes chaînes de montagnes en arrière-plan
                const height = Math.sin(vx * 0.005) * Math.cos(vz * 0.005) * 160 + (dist - 350) * 0.25;
                pos.setY(i, Math.max(0, height));
            } else {
                pos.setY(i, (Math.sin(vx * 0.02) + Math.cos(vz * 0.02)) * 6);
            }
        }
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            color: 0x3d6b38,
            roughness: 0.9,
            flatShading: true
        });
        const terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.position.y = -2;
        terrain.receiveShadow = true;
        this.scene.add(terrain);
        this.sceneryObjects.push(terrain);

        // Sapins et rochers le long de la route
        const treeGeo = new THREE.ConeGeometry(3, 9, 5);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d4a23, roughness: 0.8, flatShading: true });
        const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });

        const rockGeo = new THREE.DodecahedronGeometry(2.5);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c858d, roughness: 0.9, flatShading: true });

        for (let i = 0; i < 350; i++) {
            const u = Math.random();
            const pointOnCurve = this.roadCurve.getPointAt(u);
            const tangent = this.roadCurve.getTangentAt(u);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            // Distance de 8 à 45 mètres du bord de la route
            const side = Math.random() > 0.5 ? 1 : -1;
            const dist = 8 + Math.random() * 45;
            const posTree = pointOnCurve.clone().add(normal.clone().multiplyScalar(dist * side));

            if (Math.random() > 0.3) {
                // Sapin
                const group = new THREE.Group();
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 1.5;
                const foliage = new THREE.Mesh(treeGeo, treeMat);
                foliage.position.y = 6;
                group.add(trunk);
                group.add(foliage);

                const scale = 0.7 + Math.random() * 0.8;
                group.scale.set(scale, scale, scale);
                group.position.copy(posTree);
                group.position.y = pointOnCurve.y - 0.5;

                this.scene.add(group);
                this.sceneryObjects.push(group);
            } else {
                // Rocher alpin
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.copy(posTree);
                rock.position.y = pointOnCurve.y + 0.5;
                const scale = 0.6 + Math.random() * 1.2;
                rock.scale.set(scale, scale, scale);
                this.scene.add(rock);
                this.sceneryObjects.push(rock);
            }
        }

        // Banderoles et arches de départ / arrivée
        this.buildFinishArch();
    }

    // Décor 2 : Côte d'Azur / Bord de Mer (Océan turquoise, palmiers, soleil couchant)
    buildCoastalScenery() {
        this.scene.background = new THREE.Color(0xfde047); // Coucher de soleil doré
        this.scene.fog = new THREE.FogExp2(0xfcd34d, 0.0015);

        // Océan miroitant
        const seaGeo = new THREE.PlaneGeometry(2500, 2500);
        seaGeo.rotateX(-Math.PI / 2);
        const seaMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            roughness: 0.1,
            metalness: 0.8
        });
        const sea = new THREE.Mesh(seaGeo, seaMat);
        sea.position.y = -5;
        this.scene.add(sea);
        this.sceneryObjects.push(sea);

        // Palmiers
        const palmLeafGeo = new THREE.ConeGeometry(4, 3, 5);
        const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, flatShading: true });
        const trunkGeo = new THREE.CylinderGeometry(0.4, 0.8, 10, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f });

        for (let i = 0; i < 200; i++) {
            const u = Math.random();
            const pt = this.roadCurve.getPointAt(u);
            const tangent = this.roadCurve.getTangentAt(u);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const side = Math.random() > 0.5 ? 1 : -1;
            const dist = 7 + Math.random() * 25;
            const palmPos = pt.clone().add(normal.multiplyScalar(dist * side));

            const palm = new THREE.Group();
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 5;
            trunk.rotation.z = (Math.random() - 0.5) * 0.2;
            const top = new THREE.Mesh(palmLeafGeo, palmLeafMat);
            top.position.y = 10;
            palm.add(trunk);
            palm.add(top);

            palm.position.copy(palmPos);
            palm.position.y = pt.y - 1;
            this.scene.add(palm);
            this.sceneryObjects.push(palm);
        }
        this.buildFinishArch();
    }

    // Décor 3 : Criterium Cyberpunk Nocturne (Néons, gratte-ciels, asphalte sombre)
    buildCyberpunkScenery() {
        this.scene.background = new THREE.Color(0x050814);
        this.scene.fog = new THREE.FogExp2(0x0a0f24, 0.0025);

        // Gratte-ciels avec fenêtres néons
        const buildingMat1 = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3 });
        const neonColors = [0x38bdf8, 0xa855f7, 0xec4899, 0x22c55e];

        for (let i = 0; i < 180; i++) {
            const h = 40 + Math.random() * 120;
            const w = 15 + Math.random() * 20;
            const bGeo = new THREE.BoxGeometry(w, h, w);
            const building = new THREE.Mesh(bGeo, buildingMat1);

            const u = Math.random();
            const pt = this.roadCurve.getPointAt(u);
            const tangent = this.roadCurve.getTangentAt(u);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const side = Math.random() > 0.5 ? 1 : -1;
            const dist = 18 + Math.random() * 60;
            const bPos = pt.clone().add(normal.multiplyScalar(dist * side));

            building.position.copy(bPos);
            building.position.y = pt.y + h / 2 - 2;

            // Anneau néon au sommet
            const neonMat = new THREE.MeshBasicMaterial({ color: neonColors[i % neonColors.length] });
            const ringGeo = new THREE.BoxGeometry(w + 1, 2, w + 1);
            const ring = new THREE.Mesh(ringGeo, neonMat);
            ring.position.y = h / 2;
            building.add(ring);

            this.scene.add(building);
            this.sceneryObjects.push(building);
        }
        this.buildFinishArch();
    }

    // Décor 4 : Campagne Verdoyante
    buildCountrysideScenery() {
        this.buildAlpsScenery();
    }

    // Arche d'arrivée et départ
    buildFinishArch() {
        const startPt = this.roadCurve.getPointAt(0);
        const tangent = this.roadCurve.getTangentAt(0);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const archGroup = new THREE.Group();
        const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, 8, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xd97706 }); // Orange
        
        const p1 = new THREE.Mesh(poleGeo, poleMat);
        p1.position.copy(normal.clone().multiplyScalar(-3.5));
        p1.position.y = 4;

        const p2 = new THREE.Mesh(poleGeo, poleMat);
        p2.position.copy(normal.clone().multiplyScalar(3.5));
        p2.position.y = 4;

        const bannerGeo = new THREE.BoxGeometry(7.5, 1.8, 0.4);
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.y = 7.5;

        archGroup.add(p1);
        archGroup.add(p2);
        archGroup.add(banner);

        archGroup.position.copy(startPt);
        archGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

        this.scene.add(archGroup);
        this.sceneryObjects.push(archGroup);
    }

    // Modélisation de l'avatar cycliste (Vélo + Cycliste stylisé)
    createPlayerAvatar() {
        this.playerMesh = this.buildBicycleMesh(0x0284c7, 0x38bdf8); // Bleu Van Rysel
        this.scene.add(this.playerMesh);
    }

    // Création des concurrents IA
    createCompetitors() {
        this.competitors.forEach((bot, idx) => {
            bot.mesh = this.buildBicycleMesh(bot.color, bot.color);
            this.scene.add(bot.mesh);
        });
    }

    // Construction d'un modèle 3D géométrique de vélo + cycliste
    buildBicycleMesh(frameColor, jerseyColor) {
        const bikeGroup = new THREE.Group();

        // 1. Roues (tores fins noirs)
        const wheelGeo = new THREE.TorusGeometry(0.7, 0.08, 8, 20);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
        frontWheel.position.set(0, 0.7, 1.1);
        bikeGroup.add(frontWheel);

        const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
        rearWheel.position.set(0, 0.7, -1.1);
        bikeGroup.add(rearWheel);

        // 2. Cadre de vélo
        const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.6, roughness: 0.4 });
        const tubeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);

        // Tube diagonal
        const tube1 = new THREE.Mesh(tubeGeo, frameMat);
        tube1.position.set(0, 1.1, 0.0);
        tube1.rotation.x = Math.PI / 4;
        bikeGroup.add(tube1);

        // Tube supérieur
        const tube2 = new THREE.Mesh(tubeGeo, frameMat);
        tube2.position.set(0, 1.5, 0.0);
        tube2.rotation.x = Math.PI / 2;
        bikeGroup.add(tube2);

        // 3. Corps du Cycliste (Torse penché en position aéro)
        const torsoGeo = new THREE.BoxGeometry(0.6, 0.9, 0.5);
        const torsoMat = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.7 });
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.set(0, 2.0, -0.1);
        torso.rotation.x = Math.PI / 5; // Position aéro de course
        bikeGroup.add(torso);

        // Tête & Casque
        const headGeo = new THREE.SphereGeometry(0.25, 12, 12);
        const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const head = new THREE.Mesh(headGeo, helmetMat);
        head.position.set(0, 2.5, 0.3);
        bikeGroup.add(head);

        bikeGroup.scale.set(0.9, 0.9, 0.9);
        return bikeGroup;
    }

    // Basculement entre caméra guidon (POV) et poursuite arrière
    toggleCameraMode() {
        this.cameraMode = this.cameraMode === 'chase' ? 'pov' : 'chase';
        if (this.playerMesh) {
            // En mode guidon POV, on cache le corps du joueur pour avoir la vue totalement dégagée
            this.playerMesh.visible = (this.cameraMode === 'chase');
        }
        return this.cameraMode;
    }

    setTheme(theme) {
        if (this.currentTheme !== theme) {
            this.currentTheme = theme;
            this.buildScenery();
        }
    }

    // Mise à jour de la vitesse et de la position physique
    updatePlayerSpeed(speedKmh) {
        this.playerSpeedMps = (speedKmh || 0) / 3.6;
    }

    // Boucle d'animation principale (60 FPS)
    animate(timestamp) {
        if (!this.isActive) return;

        const deltaSeconds = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
        this.lastTimestamp = timestamp;

        // 1. Avancement du joueur le long de la boucle de 5 km
        this.playerDistance = (this.playerDistance + this.playerSpeedMps * deltaSeconds) % this.roadLength;
        const playerU = this.playerDistance / this.roadLength;

        // Position et orientation sur la route
        const playerPos = this.roadCurve.getPointAt(playerU);
        const playerTangent = this.roadCurve.getTangentAt(playerU);

        // Calcul de la pente locale (dérivée verticale par rapport à la distance)
        const nextU = (playerU + 0.002) % 1.0;
        const nextPos = this.roadCurve.getPointAt(nextU);
        const segmentDist = playerPos.distanceTo(nextPos);
        const deltaY = nextPos.y - playerPos.y;
        this.currentSlope = segmentDist > 0 ? parseFloat(((deltaY / segmentDist) * 100).toFixed(1)) : 0.0;

        // Positionnement avatar joueur
        if (this.playerMesh) {
            this.playerMesh.position.copy(playerPos);
            this.playerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), playerTangent);
        }

        // 2. Gestion de la Caméra
        if (this.cameraMode === 'chase') {
            // Vue 3ème personne : derrière et légèrement au-dessus
            const camOffset = playerTangent.clone().multiplyScalar(-6.5);
            camOffset.y += 3.0;
            this.camera.position.copy(playerPos).add(camOffset);

            const lookTarget = playerPos.clone().add(playerTangent.clone().multiplyScalar(15));
            lookTarget.y += 1.5;
            this.camera.lookAt(lookTarget);
        } else {
            // Vue 1ère personne (POV au guidon) : immersion totale
            const camPos = playerPos.clone();
            camPos.y += 1.8;
            camPos.add(playerTangent.clone().multiplyScalar(0.5));
            this.camera.position.copy(camPos);

            const lookTarget = playerPos.clone().add(playerTangent.clone().multiplyScalar(25));
            lookTarget.y += 1.6;
            this.camera.lookAt(lookTarget);
        }

        // 3. IA des Concurrents (Bots)
        this.updateCompetitors(deltaSeconds, playerU);

        // 4. Suivi de la lumière directionnelle avec le joueur
        if (this.dirLight) {
            this.dirLight.position.set(playerPos.x + 80, playerPos.y + 160, playerPos.z + 80);
            this.dirLight.target.position.copy(playerPos);
        }

        // 5. Rendu de la scène
        this.renderer.render(this.scene, this.camera);

        this.animationFrameId = requestAnimationFrame((t) => this.animate(t));
    }

    updateCompetitors(deltaSeconds, playerU) {
        // Avancement dynamique des concurrents
        this.competitors.forEach((bot, idx) => {
            // Variation réaliste de vitesse selon la pente (les grimpeurs sont plus rapides en montée)
            let botSpeed = bot.speedBase;
            if (this.currentSlope > 2.0 && bot.name.includes("Tadej")) {
                botSpeed += 1.2; // Attaque en montée
            } else if (this.currentSlope < 0 && bot.name.includes("Wout")) {
                botSpeed += 1.5; // Rapide en descente
            }

            // Progression
            bot.distance = (bot.distance + (botSpeed - this.playerSpeedMps) * deltaSeconds);

            // Position absolue sur le circuit
            let botDistOnRoad = (this.playerDistance + bot.distance) % this.roadLength;
            if (botDistOnRoad < 0) botDistOnRoad += this.roadLength;

            const botU = botDistOnRoad / this.roadLength;
            const bPos = this.roadCurve.getPointAt(botU);
            const bTangent = this.roadCurve.getTangentAt(botU);
            const bNormal = new THREE.Vector3(-bTangent.z, 0, bTangent.x).normalize();

            // Décalage latéral sur la voie (pour éviter qu'ils se superposent)
            const laneOffset = (idx % 2 === 0 ? 1 : -1) * (1.1 + (idx * 0.3));
            bPos.add(bNormal.multiplyScalar(laneOffset));

            if (bot.mesh) {
                bot.mesh.position.copy(bPos);
                bot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), bTangent);
            }
        });

        // Calcul des classements
        this.computeRankings();
    }

    computeRankings() {
        const list = [
            { name: "VOUS", distance: 0, isPlayer: true },
            ...this.competitors.map(c => ({ name: c.name, distance: c.distance, isPlayer: false }))
        ];

        // Trier par distance (le plus en avant est premier)
        list.sort((a, b) => b.distance - a.distance);

        this.rankings = list.map((item, index) => ({
            rank: index + 1,
            name: item.name,
            gapMeters: Math.round(item.distance),
            isPlayer: item.isPlayer
        }));

        this.playerRank = list.findIndex(i => i.isPlayer) + 1;
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
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
