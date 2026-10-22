// --- PILOTE BLUETOOTH FTMS (FITNESS MACHINE SERVICE) - VAN RYSEL D100 ---
class FtmsDriver {
    constructor() {
        // UUIDs officiels Bluetooth SIG
        this.UUID_FTMS_SERVICE = 0x1826;
        this.UUID_INDOOR_BIKE_DATA = 0x2AD2;
        this.UUID_CONTROL_POINT = 0x2AD9;
        this.UUID_FITNESS_STATUS = 0x2ADA;
        this.UUID_FITNESS_FEATURE = 0x2ACC;

        // Alternatives compatibles (Cycling Power & CSC)
        this.UUID_CYCLING_POWER_SERVICE = 0x1818;
        this.UUID_POWER_MEASUREMENT = 0x2A63;

        this.device = null;
        this.server = null;
        this.ftmsService = null;
        this.dataCharacteristic = null;
        this.controlPointCharacteristic = null;

        this.isConnected = false;
        this.hasControl = false;

        // Callbacks
        this.onDataReceived = null;
        this.onConnectionChanged = null;
        this.onError = null;
    }

    // Vérifie si l'API Web Bluetooth est supportée par le navigateur
    isSupported() {
        return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
    }

    // Scanner et se connecter au Van Rysel D100
    async connect() {
        if (!this.isSupported()) {
            throw new Error("Le Bluetooth n'est pas supporté par ce navigateur. Utilisez Chrome ou Edge sur Android/PC.");
        }

        try {
            console.log("Recherche d'un appareil Bluetooth FTMS...");
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [this.UUID_FTMS_SERVICE] },
                    { namePrefix: 'D100' },
                    { namePrefix: 'VAN RYSEL' },
                    { namePrefix: 'VanRysel' },
                    { namePrefix: 'Zwift' }
                ],
                optionalServices: [
                    this.UUID_FTMS_SERVICE,
                    this.UUID_CYCLING_POWER_SERVICE,
                    'heart_rate'
                ]
            });

            this.device.addEventListener('gattserverdisconnected', () => {
                console.warn("Périphérique déconnecté");
                this.isConnected = false;
                this.hasControl = false;
                if (this.onConnectionChanged) this.onConnectionChanged(false, this.device.name);
            });

            console.log(`Connexion à ${this.device.name || 'Appareil FTMS'}...`);
            this.server = await this.device.gatt.connect();

            // Obtenir le service FTMS
            try {
                this.ftmsService = await this.server.getPrimaryService(this.UUID_FTMS_SERVICE);
            } catch (e) {
                console.warn("Service FTMS non trouvé, tentative d'accès via Cycling Power...");
            }

            if (this.ftmsService) {
                // Écouter les données du vélo (Indoor Bike Data)
                try {
                    this.dataCharacteristic = await this.ftmsService.getCharacteristic(this.UUID_INDOOR_BIKE_DATA);
                    await this.dataCharacteristic.startNotifications();
                    this.dataCharacteristic.addEventListener('characteristicvaluechanged', (evt) => {
                        this.parseIndoorBikeData(evt.target.value);
                    });
                    console.log("Notifications Indoor Bike Data activées avec succès !");
                } catch (e) {
                    console.warn("Impossible d'activer Indoor Bike Data:", e);
                }

                // Initialiser le Control Point pour piloter la résistance
                try {
                    this.controlPointCharacteristic = await this.ftmsService.getCharacteristic(this.UUID_CONTROL_POINT);
                    // Écouter les indications du Control Point
                    await this.controlPointCharacteristic.startNotifications();
                    this.controlPointCharacteristic.addEventListener('characteristicvaluechanged', (evt) => {
                        this.parseControlPointResponse(evt.target.value);
                    });

                    // Demander le contrôle (OpCode 0x00)
                    await this.requestControl();
                } catch (e) {
                    console.warn("Point de contrôle FTMS non accessible ou déjà en cours:", e);
                }
            }

            this.isConnected = true;
            if (this.onConnectionChanged) this.onConnectionChanged(true, this.device.name || "Van Rysel D100");
            return true;

        } catch (error) {
            console.error("Erreur de connexion Bluetooth:", error);
            this.isConnected = false;
            if (this.onError) this.onError(error.message);
            throw error;
        }
    }

    // Déconnexion manuelle
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.hasControl = false;
        if (this.onConnectionChanged) this.onConnectionChanged(false);
    }

    // Demande de contrôle du frein (Opcode 0x00)
    async requestControl() {
        if (!this.controlPointCharacteristic) return;
        try {
            const data = new Uint8Array([0x00]);
            await this.controlPointCharacteristic.writeValueWithResponse(data);
            this.hasControl = true;
            console.log("Contrôle du home trainer acquis !");
        } catch (e) {
            console.warn("Erreur lors de la demande de contrôle:", e);
        }
    }

    // Démarrage de session (OpCode 0x07)
    async startOrResumeSession() {
        if (!this.controlPointCharacteristic) return;
        try {
            const data = new Uint8Array([0x07]);
            await this.controlPointCharacteristic.writeValueWithResponse(data);
        } catch (e) {
            console.warn("Erreur startOrResumeSession:", e);
        }
    }

    // Pause ou Arrêt (OpCode 0x08)
    async pauseSession() {
        if (!this.controlPointCharacteristic) return;
        try {
            const data = new Uint8Array([0x08, 0x01]); // 0x01 = STOP/PAUSE
            await this.controlPointCharacteristic.writeValueWithResponse(data);
        } catch (e) {
            console.warn("Erreur pauseSession:", e);
        }
    }

    // Définir la Puissance Cible en Watts (MODE ERG - OpCode 0x05)
    async setTargetPower(watts) {
        if (!this.controlPointCharacteristic) return;
        const target = Math.max(0, Math.min(600, Math.round(watts))); // Le D100 est limité à 600W
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);
        view.setUint8(0, 0x05); // Opcode Set Target Power
        view.setInt16(1, target, true); // Little-endian

        try {
            await this.controlPointCharacteristic.writeValueWithResponse(new Uint8Array(buffer));
            console.log(`[FTMS] Puissance cible réglée à ${target} W`);
        } catch (e) {
            console.warn("Erreur setTargetPower:", e);
        }
    }

    // Définir la Pente Simulée (MODE SIMULATION - OpCode 0x11)
    // Grade en pourcentage (ex: 2.5% = 250 dans la spec, unité 0.01%)
    async setSimulationParameters(gradePercent = 0.0, windSpeedMps = 0.0) {
        if (!this.controlPointCharacteristic) return;
        // Le D100 supporte une pente maximale de 6.0%
        const clampedGrade = Math.max(-10.0, Math.min(6.0, gradePercent));
        const gradeValue = Math.round(clampedGrade * 100); // 0.01%
        const windValue = Math.round(windSpeedMps * 1000);  // 0.001 m/s

        const buffer = new ArrayBuffer(7);
        const view = new DataView(buffer);
        view.setUint8(0, 0x11); // Opcode Set Indoor Bike Simulation
        view.setInt16(1, windValue, true); // Wind Speed
        view.setInt16(3, gradeValue, true); // Grade
        view.setUint8(5, 0x33); // Crr (0.0051)
        view.setUint8(6, 0x33); // Cw (0.51)

        try {
            await this.controlPointCharacteristic.writeValueWithResponse(new Uint8Array(buffer));
            console.log(`[FTMS] Pente réglée à ${clampedGrade}%`);
        } catch (e) {
            console.warn("Erreur setSimulationParameters:", e);
        }
    }

    // Définir le Niveau de Résistance (OpCode 0x04)
    async setTargetResistance(levelPercent) {
        if (!this.controlPointCharacteristic) return;
        const level = Math.max(0, Math.min(100, Math.round(levelPercent)));
        const buffer = new Uint8Array([0x04, level]);

        try {
            await this.controlPointCharacteristic.writeValueWithResponse(buffer);
            console.log(`[FTMS] Niveau de résistance réglé à ${level}%`);
        } catch (e) {
            console.warn("Erreur setTargetResistance:", e);
        }
    }

    // Décodage des trames Indoor Bike Data (0x2AD2)
    parseIndoorBikeData(dataView) {
        if (!dataView || dataView.byteLength < 4) return;

        const flags = dataView.getUint16(0, true);
        let offset = 2;

        let speedKmh = 0;
        let cadenceRpm = 0;
        let powerWatts = 0;
        let distanceMeters = 0;
        let resistanceLevel = 0;
        let heartRateBpm = 0;
        let expendedEnergyKcal = 0;

        // Vitesse instantanée : bit 0 = 0 -> présente (résolution 0.01 km/h)
        const moreData = (flags & 0x0001) !== 0;
        if (!moreData) {
            speedKmh = dataView.getUint16(offset, true) * 0.01;
            offset += 2;
        }

        // Vitesse moyenne : bit 1
        if (flags & 0x0002) {
            offset += 2;
        }

        // Cadence instantanée : bit 2 (résolution 0.5 RPM)
        if (flags & 0x0004) {
            cadenceRpm = Math.round(dataView.getUint16(offset, true) * 0.5);
            offset += 2;
        }

        // Cadence moyenne : bit 3
        if (flags & 0x0008) {
            offset += 2;
        }

        // Distance totale : bit 4 (uint24, en mètres)
        if (flags & 0x0010) {
            const b0 = dataView.getUint8(offset);
            const b1 = dataView.getUint8(offset + 1);
            const b2 = dataView.getUint8(offset + 2);
            distanceMeters = b0 | (b1 << 8) | (b2 << 16);
            offset += 3;
        }

        // Niveau de résistance : bit 5 (sint16)
        if (flags & 0x0020) {
            resistanceLevel = dataView.getInt16(offset, true);
            offset += 2;
        }

        // Puissance instantanée : bit 6 (sint16 en Watts)
        if (flags & 0x0040) {
            powerWatts = dataView.getInt16(offset, true);
            offset += 2;
        }

        // Puissance moyenne : bit 7
        if (flags & 0x0080) {
            offset += 2;
        }

        // Énergie dépensée (kcal) : bit 8
        if (flags & 0x0100) {
            expendedEnergyKcal = dataView.getUint16(offset, true);
            offset += 2; // total kcal
            offset += 2; // energy per hour
            offset += 1; // energy per minute
        }

        // Fréquence cardiaque : bit 9
        if (flags & 0x0200) {
            heartRateBpm = dataView.getUint8(offset);
            offset += 1;
        }

        const parsed = {
            powerWatts: Math.max(0, powerWatts),
            cadenceRpm: Math.max(0, cadenceRpm),
            speedKmh: parseFloat(speedKmh.toFixed(1)),
            distanceMeters: distanceMeters,
            resistanceLevel: resistanceLevel,
            heartRateBpm: heartRateBpm,
            expendedEnergyKcal: expendedEnergyKcal
        };

        if (this.onDataReceived) {
            this.onDataReceived(parsed);
        }
    }

    parseControlPointResponse(dataView) {
        const responseOpCode = dataView.getUint8(0);
        const requestOpCode = dataView.getUint8(1);
        const resultCode = dataView.getUint8(2);

        if (resultCode === 0x01) {
            console.log(`[FTMS Response] Commande ${requestOpCode} exécutée avec succès`);
        } else {
            console.warn(`[FTMS Response] Échec de la commande ${requestOpCode}, code d'erreur: ${resultCode}`);
        }
    }
}

window.ftmsDriver = new FtmsDriver();
