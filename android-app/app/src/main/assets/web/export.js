// --- MODULE D'EXPORTATION STRAVA / GARMIN / CSV (TCX & CSV) ---
class ActivityExporter {
    constructor() {
        this.records = [];
        this.startTime = null;
    }

    startSession() {
        this.records = [];
        this.startTime = new Date();
    }

    addRecord(data) {
        if (!this.startTime) this.startTime = new Date();
        this.records.push({
            timestamp: new Date(),
            elapsedSeconds: data.elapsedSeconds || 0,
            powerWatts: data.powerWatts || 0,
            cadenceRpm: data.cadenceRpm || 0,
            speedKmh: data.speedKmh || 0,
            distanceMeters: data.distanceMeters || 0,
            heartRateBpm: data.heartRateBpm || 0,
            targetPowerWatts: data.targetPowerWatts || 0
        });
    }

    // Exporter au format TCX (Standard universel accepté nativement par Strava, Decathlon Connect, Garmin)
    exportTCX(filename = "seance_van_rysel_d100.tcx") {
        if (this.records.length === 0) {
            alert("Aucune donnée enregistrée dans la séance actuelle.");
            return;
        }

        const startIso = (this.startTime || new Date()).toISOString();
        let trackpoints = "";

        this.records.forEach(r => {
            const timeIso = r.timestamp.toISOString();
            const speedMps = (r.speedKmh / 3.6).toFixed(2);
            trackpoints += `
        <Trackpoint>
          <Time>${timeIso}</Time>
          <DistanceMeters>${r.distanceMeters.toFixed(1)}</DistanceMeters>
          <Cadence>${r.cadenceRpm}</Cadence>
          <Extensions>
            <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
              <Speed>${speedMps}</Speed>
              <Watts>${r.powerWatts}</Watts>
            </TPX>
          </Extensions>
        </Trackpoint>`;
        });

        const totalTimeSeconds = this.records.length > 0 ? this.records[this.records.length - 1].elapsedSeconds : 0;
        const totalDistanceMeters = this.records.length > 0 ? this.records[this.records.length - 1].distanceMeters : 0;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startIso}</Id>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${totalTimeSeconds}</TotalTimeSeconds>
        <DistanceMeters>${totalDistanceMeters}</DistanceMeters>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          ${trackpoints}
        </Track>
      </Lap>
      <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <Name>Van Rysel D100 Interactive Trainer</Name>
        <UnitId>5224600</UnitId>
      </Creator>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

        this.downloadFile(xml, filename, "application/vnd.garmin.tcx+xml");
    }

    // Exporter au format CSV classique
    exportCSV(filename = "seance_van_rysel_d100.csv") {
        if (this.records.length === 0) {
            alert("Aucune donnée enregistrée.");
            return;
        }

        let csv = "Timestamp,Temps_s,Puissance_Watts,Cadence_RPM,Vitesse_kmh,Distance_m\n";
        this.records.forEach(r => {
            csv += `${r.timestamp.toISOString()},${r.elapsedSeconds},${r.powerWatts},${r.cadenceRpm},${r.speedKmh},${r.distanceMeters}\n`;
        });

        this.downloadFile(csv, filename, "text/csv;charset=utf-8;");
    }

    downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

window.activityExporter = new ActivityExporter();
