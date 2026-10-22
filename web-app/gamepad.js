// --- SUPPORT MANETTES & COMMANDES AU GUIDON SANS FIL (STYLE OPENBIKECONTROL) ---
// Inspiré du projet GitHub OpenBikeControl / bikecontrol
// Permet d'utiliser n'importe quelle télécommande Bluetooth, manette (8BitDo, PlayStation, Xbox, ou bouton guidon)
// pour passer les vitesses virtuelles Zwift Cog sans toucher à l'écran !

class GamepadController {
    constructor() {
        this.hasGamepad = false;
        this.pollInterval = null;
        this.lastButtonStates = {};

        window.addEventListener("gamepadconnected", (e) => {
            console.log(`Manette / Commande connectée : ${e.gamepad.id}`);
            this.hasGamepad = true;
            this.startPolling();
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            console.log(`Manette déconnectée : ${e.gamepad.id}`);
            this.hasGamepad = false;
        });
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.poll(), 50); // 20 fois par seconde pour une réactivité instantanée
    }

    poll() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp) continue;

            // Détection des touches pour le passage des vitesses
            // Boutons d'action (A = 0, B = 1, X = 2, Y = 3, L1 = 4, R1 = 5)
            // Croix D-Pad (Up = 12, Down = 13, Left = 14, Right = 15)

            // Vitesse Supérieure (Bouton R1, Bouton Y, ou D-Pad Haut)
            const upPressed = (gp.buttons[5] && gp.buttons[5].pressed) ||
                              (gp.buttons[12] && gp.buttons[12].pressed) ||
                              (gp.buttons[3] && gp.buttons[3].pressed);

            // Vitesse Inférieure (Bouton L1, Bouton A, ou D-Pad Bas)
            const downPressed = (gp.buttons[4] && gp.buttons[4].pressed) ||
                                (gp.buttons[13] && gp.buttons[13].pressed) ||
                                (gp.buttons[0] && gp.buttons[0].pressed);

            // Bouton Pause (Start = 9, Select = 8)
            const pausePressed = (gp.buttons[9] && gp.buttons[9].pressed) ||
                                 (gp.buttons[8] && gp.buttons[8].pressed);

            // Détection du front montant (clic unique)
            if (upPressed && !this.lastButtonStates[`${i}_up`]) {
                if (window.app) window.app.handleActionUp();
            }
            if (downPressed && !this.lastButtonStates[`${i}_down`]) {
                if (window.app) window.app.handleActionDown();
            }
            if (pausePressed && !this.lastButtonStates[`${i}_pause`]) {
                if (window.app) window.app.togglePlayPause();
            }

            this.lastButtonStates[`${i}_up`] = upPressed;
            this.lastButtonStates[`${i}_down`] = downPressed;
            this.lastButtonStates[`${i}_pause`] = pausePressed;
        }
    }
}

window.gamepadController = new GamepadController();

