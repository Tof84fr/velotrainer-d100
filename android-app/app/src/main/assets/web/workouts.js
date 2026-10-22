// --- CATALOGUE D'ENTRAÎNEMENTS STRUCTURÉS (WORKOUTS EN MODE ERG) ---
class WorkoutEngine {
    constructor() {
        this.activeWorkout = null;
        this.currentBlockIndex = 0;
        this.blockElapsedSeconds = 0;
        this.totalElapsedSeconds = 0;
        this.isRunning = false;

        // Définition des séances d'entraînement
        // targetType: 'watts' (absolu) ou 'pct_ftp' (pourcentage de la FTP)
        this.catalog = {
            warmup: {
                id: 'warmup',
                title: 'Échauffement Pyramidal',
                description: 'Montée progressive en température pour préparer le système cardio-vasculaire.',
                durationMinutes: 12,
                blocks: [
                    { name: 'Réveil Musculaire', duration: 180, targetPower: 110, zone: 'Z1' },
                    { name: 'Montée Palier 1', duration: 180, targetPower: 140, zone: 'Z2' },
                    { name: 'Montée Palier 2', duration: 180, targetPower: 175, zone: 'Z3' },
                    { name: 'Déblocage Cardio', duration: 60, targetPower: 220, zone: 'Z4' },
                    { name: 'Souplesse de pédalage', duration: 120, targetPower: 120, zone: 'Z1' }
                ]
            },
            hiit: {
                id: 'hiit',
                title: 'Fractionné Explosif 30/30 (HIIT)',
                description: 'Améliore la PMA / VO2 Max et la tolérance aux changements de rythme intenses.',
                durationMinutes: 15,
                blocks: [
                    { name: 'Échauffement', duration: 180, targetPower: 120, zone: 'Z2' },
                    // Répétitions 30s effort / 30s récup
                    { name: 'Série 1 - Effort', duration: 30, targetPower: 280, zone: 'Z5' },
                    { name: 'Série 1 - Récup', duration: 30, targetPower: 110, zone: 'Z1' },
                    { name: 'Série 2 - Effort', duration: 30, targetPower: 280, zone: 'Z5' },
                    { name: 'Série 2 - Récup', duration: 30, targetPower: 110, zone: 'Z1' },
                    { name: 'Série 3 - Effort', duration: 30, targetPower: 285, zone: 'Z5' },
                    { name: 'Série 3 - Récup', duration: 30, targetPower: 110, zone: 'Z1' },
                    { name: 'Série 4 - Effort', duration: 30, targetPower: 290, zone: 'Z6' },
                    { name: 'Série 4 - Récup', duration: 30, targetPower: 110, zone: 'Z1' },
                    { name: 'Série 5 - Effort', duration: 30, targetPower: 295, zone: 'Z6' },
                    { name: 'Série 5 - Récup', duration: 30, targetPower: 110, zone: 'Z1' },
                    { name: 'Série 6 - Effort Max', duration: 30, targetPower: 310, zone: 'Z6' },
                    { name: 'Série 6 - Récup', duration: 30, targetPower: 110, zone: 'Z1' },
                    { name: 'Retour au Calme', duration: 180, targetPower: 100, zone: 'Z1' }
                ]
            },
            sweetspot: {
                id: 'sweetspot',
                title: 'Sweet Spot (FTP Booster)',
                description: 'Séance clé pour repousser son seuil anaérobie sans épuisement nerveux excessif.',
                durationMinutes: 25,
                blocks: [
                    { name: 'Échauffement', duration: 300, targetPower: 130, zone: 'Z2' },
                    { name: 'Bloc Sweet Spot 1', duration: 360, targetPower: 205, zone: 'Z4' },
                    { name: 'Récupération active', duration: 120, targetPower: 120, zone: 'Z1' },
                    { name: 'Bloc Sweet Spot 2', duration: 360, targetPower: 210, zone: 'Z4' },
                    { name: 'Retour au Calme', duration: 360, targetPower: 100, zone: 'Z1' }
                ]
            },
            endurance: {
                id: 'endurance',
                title: 'Endurance Fondamentale (Zone 2)',
                description: 'Entraînement régulier et aérobie pour brûler les graisses et développer le volume.',
                durationMinutes: 30,
                blocks: [
                    { name: 'Mise en route', duration: 300, targetPower: 120, zone: 'Z1' },
                    { name: 'Endurance Régulière', duration: 1200, targetPower: 155, zone: 'Z2' },
                    { name: 'Récupération', duration: 300, targetPower: 100, zone: 'Z1' }
                ]
            },
            recovery: {
                id: 'recovery',
                title: 'Récupération Active (Lendemain de course)',
                description: 'Pédalage très souple à haute cadence pour éliminer les toxines musculaires.',
                durationMinutes: 10,
                blocks: [
                    { name: 'Souplesse de pédalage', duration: 600, targetPower: 95, zone: 'Z1' }
                ]
            }
        };
    }

    loadWorkout(workoutId, riderFtp = 220) {
        const template = this.catalog[workoutId];
        if (!template) return false;

        // Cloner la structure et ajuster selon la FTP si besoin
        this.activeWorkout = JSON.parse(JSON.stringify(template));
        this.currentBlockIndex = 0;
        this.blockElapsedSeconds = 0;
        this.totalElapsedSeconds = 0;
        return true;
    }

    getCurrentBlock() {
        if (!this.activeWorkout) return null;
        return this.activeWorkout.blocks[this.currentBlockIndex] || null;
    }

    // Avancement d'une seconde dans le workout
    tick(onIntervalChange, onCountdown) {
        if (!this.activeWorkout) return null;

        const currentBlock = this.getCurrentBlock();
        if (!currentBlock) return null;

        this.blockElapsedSeconds++;
        this.totalElapsedSeconds++;

        const remainingInBlock = currentBlock.duration - this.blockElapsedSeconds;

        // Bips sonores dans les 3 dernières secondes
        if (remainingInBlock === 3 || remainingInBlock === 2 || remainingInBlock === 1) {
            if (onCountdown) onCountdown(remainingInBlock);
        }

        // Fin de bloc atteinte ?
        if (this.blockElapsedSeconds >= currentBlock.duration) {
            this.currentBlockIndex++;
            this.blockElapsedSeconds = 0;

            const nextBlock = this.getCurrentBlock();
            if (nextBlock) {
                if (onIntervalChange) onIntervalChange(nextBlock, this.currentBlockIndex, this.activeWorkout.blocks.length);
            } else {
                // Séance terminée
                return { isFinished: true };
            }
        }

        return {
            isFinished: false,
            blockIndex: this.currentBlockIndex,
            totalBlocks: this.activeWorkout.blocks.length,
            blockName: currentBlock.name,
            targetPower: currentBlock.targetPower,
            zone: currentBlock.zone,
            blockDuration: currentBlock.duration,
            blockElapsed: this.blockElapsedSeconds,
            remainingInBlock: Math.max(0, currentBlock.duration - this.blockElapsedSeconds),
            progressPercent: Math.min(100, Math.round((this.blockElapsedSeconds / currentBlock.duration) * 100))
        };
    }
}

window.workoutEngine = new WorkoutEngine();
