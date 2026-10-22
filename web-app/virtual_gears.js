// --- SIMULATEUR DE VITESSES VIRTUELLES POUR ZWIFT COG (VAN RYSEL D100) ---
class VirtualGearSystem {
    constructor() {
        // Le Van Rysel D100 Zwift Edition dispose du Zwift Cog (14 dents uniques)
        // Nous simulons ici 24 rapports de transmission virtuels ultra-réalistes
        this.currentGear = 12; // Démarre sur la vitesse 12 (rapport moyen, plat)
        this.totalGears = 24;

        // Ratios équivalents (Plateau avant / Pignon arrière virtuel)
        // De V1 (34x34 = 1.00 pour les pentes raides) à V24 (53x11 = 4.82 pour le sprint)
        this.gearRatios = [
            { gear: 1, ratio: 1.00, desc: "Grimpeur Extrême (34x34)" },
            { gear: 2, ratio: 1.06, desc: "Col Raide (34x32)" },
            { gear: 3, ratio: 1.13, desc: "Côte Forte (34x30)" },
            { gear: 4, ratio: 1.21, desc: "Côte Modérée (34x28)" },
            { gear: 5, ratio: 1.36, desc: "Faux Plat Montant (34x25)" },
            { gear: 6, ratio: 1.48, desc: "Faux Plat Léger (34x23)" },
            { gear: 7, ratio: 1.62, desc: "Transition Basse (34x21)" },
            { gear: 8, ratio: 1.79, desc: "Transition (34x19)" },
            { gear: 9, ratio: 2.00, desc: "Plat Souple (34x17)" },
            { gear: 10, ratio: 2.15, desc: "Rythme Modéré (39x18)" },
            { gear: 11, ratio: 2.33, desc: "Plat Régulier (42x18)" },
            { gear: 12, ratio: 2.50, desc: "Plat Standard (50x20)" },
            { gear: 13, ratio: 2.63, desc: "Allure Peloton (50x19)" },
            { gear: 14, ratio: 2.78, desc: "Allure Rapide (50x18)" },
            { gear: 15, ratio: 2.94, desc: "Tempo (50x17)" },
            { gear: 16, ratio: 3.13, desc: "Tempo Élevé (50x16)" },
            { gear: 17, ratio: 3.33, desc: "Contre-la-Montre (50x15)" },
            { gear: 18, ratio: 3.57, desc: "Faux Plat Descendant (50x14)" },
            { gear: 19, ratio: 3.85, desc: "Descente Rapide (50x13)" },
            { gear: 20, ratio: 4.17, desc: "Sprint Long (50x12)" },
            { gear: 21, ratio: 4.42, desc: "Sprint Majeur (53x12)" },
            { gear: 22, ratio: 4.55, desc: "Haute Vitesse (50x11)" },
            { gear: 23, ratio: 4.82, desc: "Descente Pleine Vitesse (53x11)" },
            { gear: 24, ratio: 5.00, desc: "Super Sprint (55x11)" }
        ];

        this.wheelCircumference = 2.105; // 700x25c standard en mètres
    }

    getGearInfo(gearNumber = this.currentGear) {
        return this.gearRatios[gearNumber - 1] || this.gearRatios[11];
    }

    shiftUp() {
        if (this.currentGear < this.totalGears) {
            this.currentGear++;
            if (window.sounds) window.sounds.playGearShift(true);
            return true;
        }
        return false;
    }

    shiftDown() {
        if (this.currentGear > 1) {
            this.currentGear--;
            if (window.sounds) window.sounds.playGearShift(false);
            return true;
        }
        return false;
    }

    setGear(gear) {
        const g = Math.max(1, Math.min(this.totalGears, parseInt(gear, 10)));
        if (g !== this.currentGear) {
            const up = g > this.currentGear;
            this.currentGear = g;
            if (window.sounds) window.sounds.playGearShift(up);
            return true;
        }
        return false;
    }

    // Calcule la résistance cible (ou watts équivalents) pour le D100
    // en fonction de la cadence et de la vitesse virtuelle
    computeResistance(cadenceRpm, riderWeightKg = 75, slopePercent = 0.0) {
        const info = this.getGearInfo();
        const ratio = info.ratio;

        // Vitesse virtuelle théorique en m/s : Cadence (tr/min) / 60 * ratio * circonférence
        const cadence = Math.max(30, cadenceRpm || 75);
        const wheelRps = (cadence / 60) * ratio;
        const speedMps = wheelRps * this.wheelCircumference;
        const speedKmh = speedMps * 3.6;

        // Modèle physique de puissance cycliste :
        // P = P_roulement + P_aero + P_gravite
        const totalMass = riderWeightKg + 9; // vélo 9kg
        const Crr = 0.004; // coefficient roulement pneu route
        const CdA = 0.32;  // surface frontale aéro
        const rho = 1.225; // densité air
        const g = 9.81;

        const pRolling = Crr * totalMass * g * speedMps;
        const pAero = 0.5 * CdA * rho * Math.pow(speedMps, 3);
        const pSlope = totalMass * g * (slopePercent / 100) * speedMps;

        let totalPower = Math.round(pRolling + pAero + pSlope);

        // Borner entre 40W et 600W (limite maximale du Van Rysel D100)
        totalPower = Math.max(40, Math.min(600, totalPower));

        return {
            targetPower: totalPower,
            speedKmh: parseFloat(speedKmh.toFixed(1)),
            gear: this.currentGear,
            ratio: ratio,
            desc: info.desc
        };
    }
}

window.virtualGears = new VirtualGearSystem();
