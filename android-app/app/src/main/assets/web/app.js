// --- CONTRÔLEUR PRINCIPAL DE L'APPLICATION VÉLOTRAINER ---
class AppController {
    constructor() {
        // État de session
        this.sessionState = {
            isRunning: false,
            isPaused: false,
            elapsedSeconds: 0,
            timerInterval: null,
            mode: 'gear', // 'gear', 'erg', 'sim', 'workout'
            targetWatts: 150,
            targetGrade: 0.0,
            isDemoMode: false,
            demoInterval: null
        };

        // Données instantanées et statistiques
        this.metrics = {
            power: 0,
            cadence: 0,
            speed: 0,
            distance: 0, // km
            calories: 0,
            avgPower: 0,
            maxPower: 0,
            avgCadence: 0,
            maxCadence: 0,
            avgSpeed: 0,
            historyPower: [],
            historyCadence: [],
            historyTarget: []
        };

        // Profil utilisateur
        this.userProfile = {
            weightKg: 75,
            ftpWatts: 220
        };

        this.wakeLock = null;
        this.chartCanvas = null;
        this.chartCtx = null;
        this.is3DMode = false;
        this.trainerDifficulty = 100; // 100% de réalisme par défaut

        this.initDOMElements();
        this.bindEvents();
        this.setupChart();
        this.updateControlDisplay();
        this.requestWakeLock();
    }

    initDOMElements() {
        // Boutons principaux
        this.btnToggle3D = document.getElementById('btnToggle3D');
        this.btnConnect = document.getElementById('btnConnect');
        this.bleIndicator = document.getElementById('bleIndicator');
        this.bleStatusText = document.getElementById('bleStatusText');
        this.btnDemo = document.getElementById('btnDemo');
        this.btnFullscreen = document.getElementById('btnFullscreen');
        this.btnPlayPause = document.getElementById('btnPlayPause');
        this.playPauseIcon = document.getElementById('playPauseIcon');
        this.playPauseText = document.getElementById('playPauseText');
        this.btnReset = document.getElementById('btnReset');
        this.btnExport = document.getElementById('btnExport');

        // Éléments du Monde 3D & Course
        this.race3DOverlay = document.getElementById('race3DOverlay');
        this.threeContainer = document.getElementById('threeContainer');
        this.btnExit3D = document.getElementById('btnExit3D');
        this.selectStage = document.getElementById('selectStage');
        this.btnLoadGpx = document.getElementById('btnLoadGpx');
        this.inputGpx = document.getElementById('inputGpx');
        this.selectScenery = document.getElementById('selectScenery');
        this.btnSwitchCamera = document.getElementById('btnSwitchCamera');
        this.lblCameraMode = document.getElementById('lblCameraMode');
        this.slopeIndicatorBox = document.getElementById('slopeIndicatorBox');
        this.slopeIcon = document.getElementById('slopeIcon');
        this.slopeText = document.getElementById('slopeText');
        this.slopeDescText = document.getElementById('slopeDescText');
        this.selectDifficulty = document.getElementById('selectDifficulty');
        this.elevationCanvas = document.getElementById('elevationCanvas');
        this.elevationCtx = this.elevationCanvas ? this.elevationCanvas.getContext('2d') : null;
        this.elevationStatusText = document.getElementById('elevationStatusText');
        this.raceLeaderboard = document.getElementById('raceLeaderboard');
        this.leaderboardList = document.getElementById('leaderboardList');
        this.playerRankBadge = document.getElementById('playerRankBadge');

        this.hudPower = document.getElementById('hudPower');
        this.hudCadence = document.getElementById('hudCadence');
        this.hudSpeed = document.getElementById('hudSpeed');
        this.hudDistance = document.getElementById('hudDistance');
        this.hudGear = document.getElementById('hudGear');
        this.hudTimer = document.getElementById('hudTimer');
        this.hudWkg = document.getElementById('hudWkg');

        // Onglets modes
        this.tabModeGear = document.getElementById('tabModeGear');
        this.tabModeErg = document.getElementById('tabModeErg');
        this.tabModeSim = document.getElementById('tabModeSim');
        this.tabModeWorkout = document.getElementById('tabModeWorkout');

        // Affichages télémétrie
        this.valPower = document.getElementById('valPower');
        this.valAvgPower = document.getElementById('valAvgPower');
        this.valMaxPower = document.getElementById('valMaxPower');
        this.valWkg = document.getElementById('valWkg');
        this.powerZoneBadge = document.getElementById('powerZoneBadge');

        this.valCadence = document.getElementById('valCadence');
        this.valAvgCadence = document.getElementById('valAvgCadence');
        this.valMaxCadence = document.getElementById('valMaxCadence');

        this.valSpeed = document.getElementById('valSpeed');
        this.valAvgSpeed = document.getElementById('valAvgSpeed');
        this.valDistance = document.getElementById('valDistance');
        this.valCalories = document.getElementById('valCalories');

        this.sessionTimer = document.getElementById('sessionTimer');

        // Commande active
        this.controllerTitle = document.getElementById('controllerTitle');
        this.valTargetControl = document.getElementById('valTargetControl');
        this.lblTargetControl = document.getElementById('lblTargetControl');
        this.btnCtrlUp = document.getElementById('btnCtrlUp');
        this.btnCtrlDown = document.getElementById('btnCtrlDown');
        this.presetRow = document.getElementById('presetRow');

        // Workouts
        this.workoutSelectWrapper = document.getElementById('workoutSelectWrapper');
        this.workoutSelect = document.getElementById('workoutSelect');
        this.workoutProgressContainer = document.getElementById('workoutProgressContainer');
        this.workoutIntervalTitle = document.getElementById('workoutIntervalTitle');
        this.workoutIntervalTime = document.getElementById('workoutIntervalTime');
        this.workoutProgressBar = document.getElementById('workoutProgressBar');
    }

    bindEvents() {
        // Mode Course 3D
        if (this.btnToggle3D) {
            this.btnToggle3D.addEventListener('click', () => this.toggle3DMode(true));
        }
        if (this.btnExit3D) {
            this.btnExit3D.addEventListener('click', () => this.toggle3DMode(false));
        }
        if (this.btnLoadGpx && this.inputGpx) {
            this.btnLoadGpx.addEventListener('click', () => this.inputGpx.click());
            this.inputGpx.addEventListener('change', (e) => this.handleGpxFileUpload(e));
        }
        if (this.selectStage) {
            this.selectStage.addEventListener('change', (e) => this.handleStageChange(e.target.value));
        }
        if (this.selectScenery) {
            this.selectScenery.addEventListener('change', (e) => {
                if (window.cycling3DWorld) window.cycling3DWorld.setTheme(e.target.value);
            });
        }
        if (this.selectDifficulty) {
            this.selectDifficulty.addEventListener('change', (e) => {
                this.trainerDifficulty = parseInt(e.target.value, 10);
                this.syncTrainerResistance();
            });
        }
        if (this.btnSwitchCamera) {
            this.btnSwitchCamera.addEventListener('click', () => this.switchCamera());
        }

        // Connexion BLE
        this.btnConnect.addEventListener('click', () => this.toggleBleConnection());

        // Mode Démo
        this.btnDemo.addEventListener('click', () => this.toggleDemoMode());

        // Plein écran (TV & mobile)
        this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

        // Session Play / Pause
        this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
        this.btnReset.addEventListener('click', () => this.resetSession());
        this.btnExport.addEventListener('click', () => window.activityExporter.exportTCX());

        // Sélecteurs de modes
        const modeButtons = [
            { el: this.tabModeGear, mode: 'gear' },
            { el: this.tabModeErg, mode: 'erg' },
            { el: this.tabModeSim, mode: 'sim' },
            { el: this.tabModeWorkout, mode: 'workout' }
        ];

        modeButtons.forEach(item => {
            item.el.addEventListener('click', () => this.setMode(item.mode));
        });

        // Contrôles Up / Down
        this.btnCtrlUp.addEventListener('click', () => this.handleActionUp());
        this.btnCtrlDown.addEventListener('click', () => this.handleActionDown());

        // Workouts
        this.workoutSelect.addEventListener('change', (e) => {
            if (this.sessionState.mode === 'workout') {
                window.workoutEngine.loadWorkout(e.target.value, this.userProfile.ftpWatts);
                this.updateWorkoutUI();
            }
        });

        // Driver FTMS Callbacks
        window.ftmsDriver.onDataReceived = (data) => this.onTrainerDataReceived(data);
        window.ftmsDriver.onConnectionChanged = (connected, name) => this.onBleConnectionChanged(connected, name);

        // NAVIGATION TÉLÉCOMMANDE ANDROID TV (D-PAD & Touches clavier)
        window.addEventListener('keydown', (e) => this.handleKeyboardAndTvRemote(e));
    }

    // Gestion des touches de télécommande Android TV et clavier
    handleKeyboardAndTvRemote(e) {
        // Flèche HAUT ou D-Pad HAUT : Vitesse supérieure / +Watts / +Pente
        if (e.key === 'ArrowUp' || e.keyCode === 19 || e.keyCode === 38) {
            e.preventDefault();
            this.handleActionUp();
        }
        // Flèche BAS ou D-Pad BAS : Vitesse inférieure / -Watts / -Pente
        else if (e.key === 'ArrowDown' || e.keyCode === 20 || e.keyCode === 40) {
            e.preventDefault();
            this.handleActionDown();
        }
        // Touche ESPACE, ENTREE ou D-PAD OK (keyCode 23 sur Android TV)
        else if (e.key === ' ' || e.key === 'Enter' || e.keyCode === 23 || e.keyCode === 66) {
            // Si le focus n'est pas sur un bouton interactif spécifique
            if (document.activeElement === document.body || document.activeElement === this.btnPlayPause) {
                e.preventDefault();
                this.togglePlayPause();
            }
        }
        // Touche C : Changement d'angle de caméra dans le Monde 3D
        else if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            this.switchCamera();
        }
        // Touche R : Bascule rapide Course 3D
        else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            this.toggle3DMode(!this.is3DMode);
        }
    }

    handleActionUp() {
        if (this.sessionState.mode === 'gear') {
            window.virtualGears.shiftUp();
            this.updateControlDisplay();
            this.syncTrainerResistance();
        } else if (this.sessionState.mode === 'erg') {
            this.sessionState.targetWatts = Math.min(600, this.sessionState.targetWatts + 10);
            if (window.sounds) window.sounds.playGearShift(true);
            this.updateControlDisplay();
            window.ftmsDriver.setTargetPower(this.sessionState.targetWatts);
        } else if (this.sessionState.mode === 'sim') {
            this.sessionState.targetGrade = Math.min(6.0, parseFloat((this.sessionState.targetGrade + 0.5).toFixed(1)));
            if (window.sounds) window.sounds.playGearShift(true);
            this.updateControlDisplay();
            window.ftmsDriver.setSimulationParameters(this.sessionState.targetGrade);
        }
    }

    handleActionDown() {
        if (this.sessionState.mode === 'gear') {
            window.virtualGears.shiftDown();
            this.updateControlDisplay();
            this.syncTrainerResistance();
        } else if (this.sessionState.mode === 'erg') {
            this.sessionState.targetWatts = Math.max(50, this.sessionState.targetWatts - 10);
            if (window.sounds) window.sounds.playGearShift(false);
            this.updateControlDisplay();
            window.ftmsDriver.setTargetPower(this.sessionState.targetWatts);
        } else if (this.sessionState.mode === 'sim') {
            this.sessionState.targetGrade = Math.max(-5.0, parseFloat((this.sessionState.targetGrade - 0.5).toFixed(1)));
            if (window.sounds) window.sounds.playGearShift(false);
            this.updateControlDisplay();
            window.ftmsDriver.setSimulationParameters(this.sessionState.targetGrade);
        }
    }

    setMode(mode) {
        this.sessionState.mode = mode;
        const buttons = [this.tabModeGear, this.tabModeErg, this.tabModeSim, this.tabModeWorkout];
        buttons.forEach(b => b.classList.remove('active'));

        if (mode === 'gear') this.tabModeGear.classList.add('active');
        if (mode === 'erg') this.tabModeErg.classList.add('active');
        if (mode === 'sim') this.tabModeSim.classList.add('active');
        if (mode === 'workout') this.tabModeWorkout.classList.add('active');

        if (mode === 'workout') {
            this.workoutSelectWrapper.classList.remove('hidden');
            this.workoutProgressContainer.classList.remove('hidden');
            window.workoutEngine.loadWorkout(this.workoutSelect.value, this.userProfile.ftpWatts);
            this.updateWorkoutUI();
        } else {
            this.workoutSelectWrapper.classList.add('hidden');
            this.workoutProgressContainer.classList.add('hidden');
        }

        this.updateControlDisplay();
        this.syncTrainerResistance();
    }

    updateControlDisplay() {
        const mode = this.sessionState.mode;

        if (mode === 'gear') {
            const info = window.virtualGears.getGearInfo();
            this.controllerTitle.textContent = "VITESSES VIRTUELLES (ZWIFT COG)";
            this.valTargetControl.textContent = `V ${window.virtualGears.currentGear}`;
            this.lblTargetControl.textContent = info.desc;

            this.presetRow.innerHTML = `
                <span class="preset-chip" onclick="window.app.setQuickGear(1)">V1 (Col)</span>
                <span class="preset-chip" onclick="window.app.setQuickGear(6)">V6 (Côte)</span>
                <span class="preset-chip" onclick="window.app.setQuickGear(12)">V12 (Plat)</span>
                <span class="preset-chip" onclick="window.app.setQuickGear(18)">V18 (Tempo)</span>
                <span class="preset-chip" onclick="window.app.setQuickGear(24)">V24 (Sprint)</span>
            `;
        } else if (mode === 'erg') {
            this.controllerTitle.textContent = "MODE ERG (PUISSANCE CIBLE)";
            this.valTargetControl.textContent = `${this.sessionState.targetWatts} W`;
            this.lblTargetControl.textContent = `Résistance asservie automatiquement`;

            this.presetRow.innerHTML = `
                <span class="preset-chip" onclick="window.app.setQuickWatts(120)">120W</span>
                <span class="preset-chip" onclick="window.app.setQuickWatts(160)">160W</span>
                <span class="preset-chip" onclick="window.app.setQuickWatts(200)">200W</span>
                <span class="preset-chip" onclick="window.app.setQuickWatts(250)">250W</span>
                <span class="preset-chip" onclick="window.app.setQuickWatts(300)">300W</span>
            `;
        } else if (mode === 'sim') {
            this.controllerTitle.textContent = "SIMULATION PENTE (VAN RYSEL D100)";
            this.valTargetControl.textContent = `${this.sessionState.targetGrade >= 0 ? '+' : ''}${this.sessionState.targetGrade}%`;
            this.lblTargetControl.textContent = `Limite max du home trainer : +6.0%`;

            this.presetRow.innerHTML = `
                <span class="preset-chip" onclick="window.app.setQuickGrade(0.0)">0% Plat</span>
                <span class="preset-chip" onclick="window.app.setQuickGrade(1.5)">+1.5%</span>
                <span class="preset-chip" onclick="window.app.setQuickGrade(3.0)">+3.0%</span>
                <span class="preset-chip" onclick="window.app.setQuickGrade(4.5)">+4.5%</span>
                <span class="preset-chip" onclick="window.app.setQuickGrade(6.0)">+6.0% Max</span>
            `;
        } else if (mode === 'workout') {
            const block = window.workoutEngine.getCurrentBlock();
            const targetW = block ? block.targetPower : 150;
            this.controllerTitle.textContent = "ENTRAÎNEMENT STRUCTURÉ";
            this.valTargetControl.textContent = `${targetW} W`;
            this.lblTargetControl.textContent = block ? block.name : "Intervalle en cours";
            this.presetRow.innerHTML = '';
        }
    }

    setQuickGear(g) {
        window.virtualGears.setGear(g);
        this.updateControlDisplay();
        this.syncTrainerResistance();
    }

    setQuickWatts(w) {
        this.sessionState.targetWatts = w;
        this.updateControlDisplay();
        window.ftmsDriver.setTargetPower(w);
    }

    setQuickGrade(g) {
        this.sessionState.targetGrade = g;
        this.updateControlDisplay();
        window.ftmsDriver.setSimulationParameters(g);
    }

    // Synchronisation de la résistance selon le mode
    syncTrainerResistance() {
        if (!this.sessionState.isRunning && !this.sessionState.isDemoMode) return;

        // Calcul de la pente active (asservie au monde 3D si ouvert, avec réglage de difficulté)
        let activeSlope = 0.0;
        if (this.is3DMode && window.cycling3DWorld) {
            const rawSlope = window.cycling3DWorld.currentSlope || 0.0;
            activeSlope = rawSlope * (this.trainerDifficulty / 100.0);
        } else if (this.sessionState.mode === 'sim') {
            activeSlope = this.sessionState.targetGrade;
        }

        if (this.sessionState.mode === 'gear') {
            const result = window.virtualGears.computeResistance(
                this.metrics.cadence,
                this.userProfile.weightKg,
                activeSlope // Pente réelle transmise au modèle physique !
            );
            window.ftmsDriver.setTargetPower(result.targetPower);
        } else if (this.sessionState.mode === 'erg') {
            window.ftmsDriver.setTargetPower(this.sessionState.targetWatts);
        } else if (this.sessionState.mode === 'sim') {
            window.ftmsDriver.setSimulationParameters(activeSlope);
        }
    }

    // Réception des données en temps réel depuis le Van Rysel D100
    onTrainerDataReceived(data) {
        this.metrics.power = data.powerWatts;
        this.metrics.cadence = data.cadenceRpm;
        this.metrics.speed = data.speedKmh;

        if (this.sessionState.isRunning) {
            // Mettre à jour les stats
            this.updateSessionMetrics(data);
        }

        this.updateTelemetryUI();

        // En mode virtuel, recalibrer la résistance si la cadence change
        if (this.sessionState.mode === 'gear') {
            this.syncTrainerResistance();
        }
    }

    updateSessionMetrics(data) {
        const p = data.powerWatts;
        const c = data.cadenceRpm;
        const s = data.speedKmh;

        if (p > this.metrics.maxPower) this.metrics.maxPower = p;
        if (c > this.metrics.maxCadence) this.metrics.maxCadence = c;

        // Historique pour graphe
        this.metrics.historyPower.push(p);
        this.metrics.historyCadence.push(c);

        let target = this.sessionState.targetWatts;
        if (this.sessionState.mode === 'gear') {
            const r = window.virtualGears.computeResistance(c, this.userProfile.weightKg);
            target = r.targetPower;
        } else if (this.sessionState.mode === 'workout') {
            const b = window.workoutEngine.getCurrentBlock();
            target = b ? b.targetPower : 150;
        }
        this.metrics.historyTarget.push(target);

        // Garder les 120 derniers points (2 minutes glissantes)
        if (this.metrics.historyPower.length > 120) {
            this.metrics.historyPower.shift();
            this.metrics.historyCadence.shift();
            this.metrics.historyTarget.shift();
        }

        // Calcul des moyennes
        const len = this.sessionState.elapsedSeconds;
        if (len > 0) {
            this.metrics.avgPower = Math.round(
                (this.metrics.avgPower * (len - 1) + p) / len
            );
            if (c > 0) {
                this.metrics.avgCadence = Math.round(
                    (this.metrics.avgCadence * (len - 1) + c) / len
                );
            }
            this.metrics.avgSpeed = parseFloat(
                ((this.metrics.avgSpeed * (len - 1) + s) / len).toFixed(1)
            );
        }

        // Distance estimée : v (km/h) / 3600 par seconde
        this.metrics.distance += (s / 3600);

        // Calories estimées (1 Watt pendant 1 heure = 3.6 kJ ~ 0.86 kcal métaboliques)
        this.metrics.calories += (p * 0.86) / 3600;

        // Enregistrer pour export Strava
        window.activityExporter.addRecord({
            elapsedSeconds: this.sessionState.elapsedSeconds,
            powerWatts: p,
            cadenceRpm: c,
            speedKmh: s,
            distanceMeters: this.metrics.distance * 1000,
            targetPowerWatts: target
        });
    }

    updateTelemetryUI() {
        this.valPower.textContent = this.metrics.power;
        this.valCadence.textContent = this.metrics.cadence;
        this.valSpeed.textContent = this.metrics.speed.toFixed(1);
        this.valDistance.textContent = this.metrics.distance.toFixed(2);
        this.valCalories.textContent = Math.round(this.metrics.calories);

        this.valAvgPower.textContent = `${this.metrics.avgPower} W`;
        this.valMaxPower.textContent = `${this.metrics.maxPower} W`;
        this.valAvgCadence.textContent = `${this.metrics.avgCadence} RPM`;
        this.valMaxCadence.textContent = `${this.metrics.maxCadence} RPM`;
        this.valAvgSpeed.textContent = `${this.metrics.avgSpeed} km/h`;

        const wkg = (this.metrics.power / this.userProfile.weightKg).toFixed(1);
        this.valWkg.textContent = wkg;

        // Zone Coggan de puissance
        const pctFtp = (this.metrics.power / this.userProfile.ftpWatts) * 100;
        let zoneText = "Zone 1 - Récupération";
        let zoneBg = "#64748b";

        if (pctFtp >= 150) { zoneText = "Zone 7 - Neuromusculaire"; zoneBg = "#a855f7"; }
        else if (pctFtp >= 120) { zoneText = "Zone 6 - Anaérobie"; zoneBg = "#ef4444"; }
        else if (pctFtp >= 105) { zoneText = "Zone 5 - VO2 Max"; zoneBg = "#f97316"; }
        else if (pctFtp >= 90) { zoneText = "Zone 4 - Seuil (FTP)"; zoneBg = "#eab308"; }
        else if (pctFtp >= 75) { zoneText = "Zone 3 - Tempo"; zoneBg = "#22c55e"; }
        else if (pctFtp >= 55) { zoneText = "Zone 2 - Endurance"; zoneBg = "#38bdf8"; }

        this.powerZoneBadge.textContent = zoneText;
        this.powerZoneBadge.style.backgroundColor = zoneBg;

        this.drawChart();

        // Mise à jour de l'affichage HUD dans le Monde 3D TV
        this.update3DHud(wkg, zoneBg);
    }

    update3DHud(wkg, zoneBg) {
        if (!this.hudPower) return;

        this.hudPower.textContent = this.metrics.power;
        this.hudCadence.textContent = this.metrics.cadence;
        this.hudSpeed.textContent = this.metrics.speed.toFixed(1);
        this.hudDistance.textContent = this.metrics.distance.toFixed(2);
        this.hudWkg.textContent = `${wkg} W/kg`;
        this.hudGear.textContent = `V ${window.virtualGears.currentGear}`;
        this.hudTimer.textContent = this.formatSeconds(this.sessionState.elapsedSeconds);

        if (window.cycling3DWorld) {
            // Transmettre la vitesse réelle au monde 3D
            window.cycling3DWorld.updatePlayerSpeed(this.metrics.speed);

            // Mettre à jour l'indicateur de pente et la description
            const slope = window.cycling3DWorld.currentSlope || 0.0;
            const effectiveSlope = slope * (this.trainerDifficulty / 100.0);
            this.slopeText.textContent = `${slope >= 0 ? '+' : ''}${slope.toFixed(1)} %`;
            this.slopeIcon.textContent = slope >= 0 ? "▲" : "▼";
            this.slopeIcon.style.color = slope > 3.0 ? "#ef4444" : (slope > 0 ? "#f59e0b" : "#38bdf8");

            if (this.slopeDescText) {
                if (slope >= 3.5) {
                    this.slopeDescText.textContent = `COL RAIDE (+${slope.toFixed(1)}%) - RÉSISTANCE MAX`;
                    this.slopeDescText.style.color = "#ef4444";
                } else if (slope >= 1.5) {
                    this.slopeDescText.textContent = `CÔTE (+${slope.toFixed(1)}%) - FREIN ACTIF`;
                    this.slopeDescText.style.color = "#f59e0b";
                } else if (slope <= -1.5) {
                    this.slopeDescText.textContent = `DESCENTE (${slope.toFixed(1)}%) - ROUE LIBRE`;
                    this.slopeDescText.style.color = "#38bdf8";
                } else {
                    this.slopeDescText.textContent = "PLAT ROULANT";
                    this.slopeDescText.style.color = "#4ade80";
                }
            }

            // Si en mode 3D et session active : asservir la résistance physique du Van Rysel D100 à la pente de la route !
            if (this.is3DMode && this.sessionState.isRunning) {
                window.ftmsDriver.setSimulationParameters(effectiveSlope);
            }

            // Mettre à jour le classement en direct de la course
            this.updateLeaderboardUI();
        }
        // Mettre à jour le profil altimétrique de l'étape
        this.drawElevationProfile();
    }

    drawElevationProfile() {
        if (!this.elevationCtx || !this.elevationCanvas || !window.cycling3DWorld) return;
        const ctx = this.elevationCtx;
        const w = this.elevationCanvas.width;
        const h = this.elevationCanvas.height;

        ctx.clearRect(0, 0, w, h);

        const curve = window.cycling3DWorld.roadCurve;
        if (!curve) return;

        const totalPoints = 100;
        const playerU = (window.cycling3DWorld.playerDistance || 0) / (window.cycling3DWorld.roadLength || 5000);

        // Profil d'élévation
        ctx.beginPath();
        ctx.moveTo(0, h);

        let currentAlt = 0;
        for (let i = 0; i <= totalPoints; i++) {
            const u = i / totalPoints;
            const pt = curve.getPointAt(u);
            const x = (i / totalPoints) * w;
            const y = h - 6 - (pt.y / 85) * (h - 12);
            ctx.lineTo(x, y);

            if (Math.abs(u - playerU) < 0.015) {
                currentAlt = Math.round(pt.y);
            }
        }
        ctx.lineTo(w, h);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.6)');
        grad.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Curseur rouge représentant la position en direct sur le col
        const playerX = playerU * w;
        const playerPt = curve.getPointAt(playerU);
        const playerY = h - 6 - (playerPt.y / 85) * (h - 12);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(playerX, playerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (this.elevationStatusText) {
            const slope = window.cycling3DWorld.currentSlope || 0;
            this.elevationStatusText.textContent = `Altitude : ${currentAlt} m | Pente : ${slope >= 0 ? '+' : ''}${slope.toFixed(1)}% | Difficulté D100 : ${this.trainerDifficulty}%`;
        }
    }

    updateLeaderboardUI() {
        if (!window.cycling3DWorld || !this.leaderboardList) return;
        const ranks = window.cycling3DWorld.rankings || [];
        this.playerRankBadge.textContent = `Position : ${window.cycling3DWorld.playerRank || 1}e / 5`;

        let html = '';
        ranks.forEach(r => {
            const gapStr = r.isPlayer ? "VOUS" : (r.gapMeters >= 0 ? `+${r.gapMeters}m` : `${r.gapMeters}m`);
            html += `
                <li class="lb-item ${r.isPlayer ? 'is-player' : ''}">
                    <span><strong>${r.rank}.</strong> ${r.name}</span>
                    <span>${gapStr}</span>
                </li>
            `;
        });
        this.leaderboardList.innerHTML = html;
    }

    // Basculer vers le Monde 3D Plein Écran
    toggle3DMode(enable) {
        this.is3DMode = enable;
        if (enable) {
            this.race3DOverlay.classList.remove('hidden');
            if (window.cycling3DWorld && !window.cycling3DWorld.isActive) {
                window.cycling3DWorld.init(this.threeContainer);
            }
            // Passer en plein écran automatiquement pour le confort TV
            this.toggleFullscreen();
        } else {
            this.race3DOverlay.classList.add('hidden');
        }
    }

    handleStageChange(stageId) {
        if (!window.gpxEngine) return;
        const stage = window.gpxEngine.stages[stageId];
        if (stage) {
            console.log(`Chargement de l'étape : ${stage.name}`);
            if (this.elevationStatusText) {
                this.elevationStatusText.textContent = `${stage.name} (${stage.distanceKm} km)`;
            }
            if (window.sounds) window.sounds.playStart();
        }
    }

    handleGpxFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const track = window.gpxEngine.parseGpxText(content);
            if (track) {
                alert(`Tracé GPX chargé : ${track.name} (${track.distanceKm} km, ${track.points.length} points) !`);
                if (this.elevationStatusText) {
                    this.elevationStatusText.textContent = `${track.name} (${track.distanceKm} km)`;
                }
            }
        };
        reader.readAsText(file);
    }

    switchCamera() {
        if (window.cycling3DWorld) {
            const mode = window.cycling3DWorld.toggleCameraMode();
            if (this.lblCameraMode) {
                this.lblCameraMode.textContent = mode === 'chase' ? "Vue 3e Personne" : "Vue Guidon (POV)";
            }
        }
    }

    // Gestion du chronomètre et de l'avancement de séance
    togglePlayPause() {
        if (!this.sessionState.isRunning) {
            // Démarrer la séance
            this.sessionState.isRunning = true;
            this.sessionState.isPaused = false;
            this.playPauseIcon.textContent = "⏸";
            this.playPauseText.textContent = "Pause";
            this.btnPlayPause.className = "btn btn-action btn-pause";

            if (window.sounds) window.sounds.playStart();
            window.activityExporter.startSession();
            window.ftmsDriver.startOrResumeSession();

            this.sessionState.timerInterval = setInterval(() => this.onSecondTick(), 1000);
        } else {
            // Mettre en pause ou reprendre
            this.sessionState.isPaused = !this.sessionState.isPaused;
            if (this.sessionState.isPaused) {
                this.playPauseIcon.textContent = "▶";
                this.playPauseText.textContent = "Reprendre";
                this.btnPlayPause.className = "btn btn-action btn-play";
                window.ftmsDriver.pauseSession();
            } else {
                this.playPauseIcon.textContent = "⏸";
                this.playPauseText.textContent = "Pause";
                this.btnPlayPause.className = "btn btn-action btn-pause";
                window.ftmsDriver.startOrResumeSession();
            }
        }
    }

    onSecondTick() {
        if (this.sessionState.isPaused) return;

        this.sessionState.elapsedSeconds++;
        this.sessionTimer.textContent = this.formatSeconds(this.sessionState.elapsedSeconds);

        // Si entraînement structuré en cours
        if (this.sessionState.mode === 'workout') {
            const status = window.workoutEngine.tick(
                (nextBlock) => {
                    if (window.sounds) window.sounds.playBeepLong();
                    this.updateWorkoutUI();
                    window.ftmsDriver.setTargetPower(nextBlock.targetPower);
                },
                (count) => {
                    if (window.sounds) window.sounds.playBeepShort();
                }
            );

            if (status) {
                if (status.isFinished) {
                    alert("Félicitations ! Vous avez terminé votre séance d'entraînement !");
                    this.togglePlayPause();
                } else {
                    this.updateWorkoutUI(status);
                }
            }
        }
    }

    updateWorkoutUI(status) {
        if (!status) {
            const block = window.workoutEngine.getCurrentBlock();
            if (block) {
                this.workoutIntervalTitle.textContent = `${block.name} (${block.targetPower} W)`;
                this.workoutIntervalTime.textContent = this.formatSeconds(block.duration);
                this.workoutProgressBar.style.width = '0%';
            }
            return;
        }

        this.workoutIntervalTitle.textContent = `${status.blockName} (${status.targetPower} W)`;
        this.workoutIntervalTime.textContent = `${this.formatSeconds(status.remainingInBlock)} restant`;
        this.workoutProgressBar.style.width = `${status.progressPercent}%`;
    }

    resetSession() {
        if (confirm("Réinitialiser le chronomètre et les statistiques de la séance ?")) {
            this.sessionState.isRunning = false;
            this.sessionState.isPaused = false;
            this.sessionState.elapsedSeconds = 0;
            clearInterval(this.sessionState.timerInterval);

            this.metrics.distance = 0;
            this.metrics.calories = 0;
            this.metrics.avgPower = 0;
            this.metrics.maxPower = 0;
            this.metrics.avgCadence = 0;
            this.metrics.maxCadence = 0;
            this.metrics.avgSpeed = 0;
            this.metrics.historyPower = [];
            this.metrics.historyCadence = [];
            this.metrics.historyTarget = [];

            this.sessionTimer.textContent = "00:00:00";
            this.playPauseIcon.textContent = "▶";
            this.playPauseText.textContent = "Démarrer Session";
            this.btnPlayPause.className = "btn btn-action btn-play";

            this.updateTelemetryUI();
        }
    }

    // Gestion de la connexion BLE
    async toggleBleConnection() {
        if (!window.ftmsDriver.isConnected) {
            try {
                this.bleStatusText.textContent = "Recherche BLE...";
                await window.ftmsDriver.connect();
            } catch (err) {
                this.bleStatusText.textContent = "Erreur Connexion";
                this.bleIndicator.className = "status-indicator disconnected";
            }
        } else {
            window.ftmsDriver.disconnect();
        }
    }

    onBleConnectionChanged(connected, name) {
        if (connected) {
            this.bleIndicator.className = "status-indicator connected";
            this.bleStatusText.textContent = name || "Van Rysel D100 Connecté";
            this.btnConnect.classList.add('connected');
        } else {
            this.bleIndicator.className = "status-indicator disconnected";
            this.bleStatusText.textContent = "Connecter Home Trainer";
            this.btnConnect.classList.remove('connected');
        }
    }

    // Mode Démo pour tester l'application sans home trainer allumé
    toggleDemoMode() {
        this.sessionState.isDemoMode = !this.sessionState.isDemoMode;

        if (this.sessionState.isDemoMode) {
            this.btnDemo.style.background = "#059669";
            this.btnDemo.innerHTML = "<span>🎮</span> Démo Active";

            let simCadence = 85;
            let simPower = 175;

            this.sessionState.demoInterval = setInterval(() => {
                // Variations réalistes
                simCadence += (Math.random() - 0.5) * 3;
                simCadence = Math.max(70, Math.min(105, simCadence));

                let target = this.sessionState.targetWatts;
                if (this.sessionState.mode === 'gear') {
                    const r = window.virtualGears.computeResistance(simCadence, this.userProfile.weightKg);
                    target = r.targetPower;
                }
                simPower += (target - simPower) * 0.2 + (Math.random() - 0.5) * 6;

                const speed = (simCadence * 0.35).toFixed(1);

                this.onTrainerDataReceived({
                    powerWatts: Math.round(simPower),
                    cadenceRpm: Math.round(simCadence),
                    speedKmh: parseFloat(speed),
                    distanceMeters: this.metrics.distance * 1000
                });
            }, 1000);
        } else {
            this.btnDemo.style.background = "";
            this.btnDemo.innerHTML = "<span>🎮</span> Mode Démo";
            clearInterval(this.sessionState.demoInterval);
        }
    }

    // Graphique Canvas Haute Performance (60 FPS)
    setupChart() {
        this.chartCanvas = document.getElementById('liveChart');
        this.chartCtx = this.chartCanvas.getContext('2d');
    }

    drawChart() {
        if (!this.chartCtx || !this.chartCanvas) return;

        const ctx = this.chartCtx;
        const w = this.chartCanvas.width;
        const h = this.chartCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // Grille de fond
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        const dataPower = this.metrics.historyPower;
        const dataTarget = this.metrics.historyTarget;
        const dataCadence = this.metrics.historyCadence;

        if (dataPower.length < 2) return;

        const maxScalePower = 450;
        const stepX = w / 120; // 120 points d'historique

        // 1. Tracer la ligne Cible (jaune pointillé)
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        dataTarget.forEach((val, idx) => {
            const x = idx * stepX;
            const y = h - (val / maxScalePower) * h;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Tracer la Puissance réelle (bleu néon avec dégradé)
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        dataPower.forEach((val, idx) => {
            const x = idx * stepX;
            const y = h - (val / maxScalePower) * h;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 3. Tracer la Cadence (vert fin)
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        dataCadence.forEach((val, idx) => {
            const x = idx * stepX;
            // Cadence mise à l'échelle (max 140 RPM)
            const y = h - (val / 140) * h;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Basculer en mode Plein Écran
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.log(e));
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    }

    // WakeLock pour garder l'écran allumé pendant la séance de vélo
    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log("WakeLock actif : l'écran restera allumé.");
            }
        } catch (e) {
            console.log("WakeLock non supporté ou refusé.");
        }
    }

    formatSeconds(totalSec) {
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}

// Initialisation globale
window.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});
