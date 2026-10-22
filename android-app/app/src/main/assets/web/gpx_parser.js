// --- ANALYSEUR ET GÉNÉRATEUR DE TRACÉ GPX (STYLE GPX RIDER & FLUX) ---
class GpxRouteEngine {
    constructor() {
        this.currentTrack = null;
        this.stages = {
            alpedhuez: {
                name: "Alpe d'Huez (Les 21 Virages)",
                distanceKm: 13.8,
                elevGainM: 1070,
                desc: "Col mythique du Tour de France avec lacets numérotés.",
                points: this.generateSyntheticClimb(13800, 1070, 21)
            },
            ventoux: {
                name: "Mont Ventoux (Bédoin - Sommet)",
                distanceKm: 21.5,
                elevGainM: 1610,
                desc: "Le Géant de Provence, passage dans la forêt puis le paysage lunaire.",
                points: this.generateSyntheticClimb(21500, 1610, 12)
            },
            champselysees: {
                name: "Paris Champs-Élysées (Critarium Final)",
                distanceKm: 6.8,
                elevGainM: 45,
                desc: "Circuit urbain rapide sur les pavés parisiens et la Place de la Concorde.",
                points: this.generateSyntheticCircuit(6800, 45)
            },
            nice: {
                name: "Promenade des Anglais - Nice",
                distanceKm: 10.0,
                elevGainM: 60,
                desc: "Bord de mer méditerranéen plat et ensoleillé, idéal pour rouler à bloc.",
                points: this.generateSyntheticCircuit(10000, 60)
            }
        };
    }

    // Génère des points 3D réalistes (distance, altitude, pente) pour une ascension
    generateSyntheticClimb(totalDistMeters, elevGainMeters, numHairpins) {
        const points = [];
        const numSamples = 150;
        let cumDist = 0;
        const stepDist = totalDistMeters / numSamples;

        for (let i = 0; i <= numSamples; i++) {
            const frac = i / numSamples;
            cumDist = i * stepDist;

            // Élévation progressive avec sections plus raides et replats
            const elev = Math.pow(frac, 1.1) * elevGainMeters;

            // Virages en lacet (alternance gauche/droite)
            const angle = frac * numHairpins * Math.PI;
            const lateral = Math.sin(angle) * 80;

            // Calcul de la pente locale (%)
            let slope = (elevGainMeters / totalDistMeters) * 100;
            slope += Math.sin(frac * 12) * 1.8;
            // Borner aux capacités du Van Rysel D100 (max 6%)
            slope = Math.max(-2.0, Math.min(6.0, parseFloat(slope.toFixed(1))));

            points.push({
                distanceM: cumDist,
                elevationM: Math.round(elev),
                slopePct: slope,
                x: Math.cos(frac * Math.PI * 4) * (400 - frac * 150) + lateral,
                y: elev * 0.1, // mise à l'échelle 3D
                z: Math.sin(frac * Math.PI * 4) * (400 - frac * 150)
            });
        }
        return points;
    }

    // Génère un circuit fermé roulant
    generateSyntheticCircuit(totalDistMeters, elevGainMeters) {
        const points = [];
        const numSamples = 120;
        const stepDist = totalDistMeters / numSamples;

        for (let i = 0; i <= numSamples; i++) {
            const frac = i / numSamples;
            const angle = frac * Math.PI * 2;
            const elev = Math.sin(angle * 2) * (elevGainMeters / 2);
            const slope = Math.cos(angle * 2) * 2.5;

            points.push({
                distanceM: i * stepDist,
                elevationM: Math.round(Math.max(0, elev + 20)),
                slopePct: parseFloat(slope.toFixed(1)),
                x: Math.cos(angle) * 500,
                y: (elev + 20) * 0.2,
                z: Math.sin(angle) * 380
            });
        }
        return points;
    }

    // Analyser un fichier GPX téléchargé depuis Strava, Komoot ou Garmin
    parseGpxText(gpxXmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxXmlText, "text/xml");
            const trkpts = xmlDoc.querySelectorAll("trkpt");

            if (!trkpts || trkpts.length === 0) {
                alert("Aucun point de trace trouvé dans ce fichier GPX.");
                return null;
            }

            const rawPoints = [];
            let totalDist = 0;
            let lastLat = null;
            let lastLon = null;
            let lastEle = 0;

            for (let i = 0; i < trkpts.length; i++) {
                const pt = trkpts[i];
                const lat = parseFloat(pt.getAttribute("lat"));
                const lon = parseFloat(pt.getAttribute("lon"));
                const eleNode = pt.querySelector("ele");
                const ele = eleNode ? parseFloat(eleNode.textContent) : lastEle;

                if (lastLat !== null && lastLon !== null) {
                    const distStep = this.computeHaversineDistance(lastLat, lastLon, lat, lon);
                    totalDist += distStep;

                    const deltaEle = ele - lastEle;
                    let slope = distStep > 0 ? (deltaEle / distStep) * 100 : 0;
                    slope = Math.max(-6.0, Math.min(6.0, parseFloat(slope.toFixed(1))));

                    rawPoints.push({
                        distanceM: totalDist,
                        elevationM: Math.round(ele),
                        slopePct: slope,
                        lat: lat,
                        lon: lon
                    });
                } else {
                    rawPoints.push({
                        distanceM: 0,
                        elevationM: Math.round(ele),
                        slopePct: 0,
                        lat: lat,
                        lon: lon
                    });
                }

                lastLat = lat;
                lastLon = lon;
                lastEle = ele;
            }

            this.currentTrack = {
                name: "Parcours GPX Importé",
                distanceKm: parseFloat((totalDist / 1000).toFixed(1)),
                points: rawPoints
            };

            return this.currentTrack;

        } catch (e) {
            console.error("Erreur parsing GPX:", e);
            alert("Erreur lors de la lecture du fichier GPX.");
            return null;
        }
    }

    // Calcul de distance GPS en mètres (Formule de Haversine)
    computeHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Rayon terre en mètres
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}

window.gpxEngine = new GpxRouteEngine();
