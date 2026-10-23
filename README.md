# VéloTrainer — Van Rysel D100

Application locale d'entraînement pour home trainer Van Rysel D100 Zwift Edition. Le projet comprend une application Web (PC, téléphone ou navigateur TV) et une application Android native pour connecter directement le home trainer en Bluetooth depuis Android TV.

**APK Android TV :** [Télécharger directement VéloTrainer 1.0.0](https://github.com/Tof84fr/velotrainer-d100/raw/refs/heads/main/VeloTrainer-AndroidTV-debug.apk) (APK de débogage, 6,7 Mo) — voir [l'installation pas à pas](#installer-lapk-sur-android-tv).

> **Projet indépendant :** VéloTrainer n'est pas affilié à Van Rysel, Decathlon ou Zwift. La compatibilité dépend du matériel et du navigateur/appareil utilisés.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Quelle version utiliser ?](#quelle-version-utiliser-)
- [Lancer la version Web sous Windows](#lancer-la-version-web-sous-windows)
- [Accéder à l'application depuis une TV](#accéder-à-lapplication-depuis-une-tv)
- [Connecter le home trainer en Bluetooth](#connecter-le-home-trainer-en-bluetooth)
- [Installer et compiler l'application Android](#installer-et-compiler-lapplication-android)
- [Installer l'APK sur Android TV](#installer-lapk-sur-android-tv)
- [Architecture du projet](#architecture-du-projet)
- [Commandes et modes](#commandes-et-modes)
- [Dépannage](#dépannage)
- [Confidentialité et limites](#confidentialité-et-limites)
- [Dépendances et licence](#dépendances-et-licence)

## Fonctionnalités

- Tableau de bord d'entraînement : puissance, cadence, vitesse, distance et durée.
- Bluetooth LE FTMS pour recevoir les données du home trainer et, si l'appareil accepte les commandes FTMS, régler la résistance.
- Vitesses virtuelles, mode ERG et simulation de pente.
- Environnements 3D, caméra, concurrents virtuels et commandes clavier/manette dans la version Web.
- Import de fichiers GPX et export d'activités TCX/CSV dans la version Web.
- Application Android Kotlin avec interface TV, commandes par télécommande, WebView 3D et gestion BLE native.
- Mode Démo dans la version Web pour essayer l'interface sans home trainer.

## Quelle version utiliser ?

| Besoin | Version conseillée | Remarque |
|---|---|---|
| Essayer immédiatement l'interface sur PC | Web | Démarrer le petit serveur Python fourni. |
| Afficher le tableau de bord dans le navigateur de la TV | Web | Le PC et la TV doivent être sur le même réseau local. |
| Utiliser le Bluetooth depuis un navigateur | Web sur navigateur/appareil compatible, servi en HTTPS | Une adresse locale en HTTP ne constitue généralement pas une origine sécurisée pour Web Bluetooth. |
| Connecter le D100 directement à une Android TV | Android native | La TV doit avoir le Bluetooth LE et autoriser l'application à rechercher les appareils à proximité. |

## Lancer la version Web sous Windows

### Prérequis

- Windows 10/11.
- Python 3 installé et accessible par le lanceur `py` ou la commande `python`.
- Navigateur moderne. La disponibilité du Bluetooth Web varie selon le navigateur et la plateforme.

### Démarrage

1. Téléchargez ou clonez ce dépôt.
2. Ouvrez le dossier du projet dans l'Explorateur de fichiers.
3. Double-cliquez sur `demarrer_application.bat`.
4. Laissez la fenêtre du serveur ouverte pendant l'utilisation.
5. Le navigateur du PC s'ouvre sur `http://localhost:8080/`. Les adresses réseau disponibles, le cas échéant, sont affichées dans la fenêtre.

Le serveur n'utilise que la bibliothèque standard de Python. Il sert les fichiers de `web-app/` sur le port **8080** et accepte les connexions du réseau local.

Lancement manuel depuis PowerShell, à la racine du projet :

```powershell
py server.py
```

Pour arrêter le serveur, revenez à sa fenêtre et appuyez sur **Ctrl+C**.

## Accéder à l'application depuis une TV

1. Connectez le PC et la TV au même réseau Wi-Fi. Évitez le réseau invité, qui peut isoler les appareils.
2. Lancez le serveur et repérez l'adresse de réseau affichée, par exemple `http://192.168.1.40:8080/`.
3. Saisissez cette adresse avec le préfixe **`http://`**, et non `https://`, dans le navigateur de la TV.
4. Si la page ne s'ouvre pas, vérifiez le Pare-feu Windows. Sur un réseau domestique de confiance uniquement, utilisez le profil **Privé** et autorisez Python sur ce réseau.

Le serveur local n'active pas HTTPS. La page peut s'afficher sur la TV sans que le navigateur TV autorise le Bluetooth Web, l'installation PWA ou toutes les fonctions hors ligne. Pour le Bluetooth direct sur Android TV, utilisez de préférence l'application native décrite ci-dessous.

## Connecter le home trainer en Bluetooth

### Version Web

La connexion Web dépend de la prise en charge de **Web Bluetooth** par le navigateur, de l'OS et de l'origine de la page. Les adresses `http://192.168...` sont normalement considérées comme non sécurisées pour cette API ; afficher la page sur la TV ne garantit donc pas que son bouton Bluetooth fonctionnera. Un serveur HTTPS correctement configuré est nécessaire pour un accès Web Bluetooth depuis le réseau.

### Version Android native

1. Activez le Bluetooth dans les réglages de la TV.
2. Branchez et allumez le D100.
3. Fermez Zwift et toute autre application actuellement connectée au home trainer.
4. Lancez VéloTrainer sur Android TV et sélectionnez **Connecter Home Trainer**.
5. Accordez à l'application l'autorisation **Appareils à proximité** lorsqu'elle est demandée.
6. Suivez le message d'état affiché pendant la recherche.

Le scan s'arrête après environ 20 secondes s'il ne trouve pas l'appareil. La présence d'une puce Bluetooth LE sur la TV est nécessaire. Le support du service FTMS et des commandes de résistance dépend également du micrologiciel du home trainer.

## Installer et compiler l'application Android

Le projet Android se trouve dans `android-app/`.

### Prérequis de développement

- Android Studio avec Android SDK Platform 34.
- JDK 17.
- Connexion Internet lors de la première synchronisation, afin qu'Android Studio puisse télécharger les plugins et dépendances Gradle.
- Android 8.0/API 26 ou ultérieur pour l'appareil cible.

### Créer un APK de test

1. Dans Android Studio, ouvrez le dossier `android-app/` (celui qui contient `settings.gradle.kts`).
2. Acceptez la synchronisation Gradle et attendez la fin de l'indexation.
3. Choisissez **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. Android Studio indique l'emplacement de l'APK de débogage généré, généralement sous `app/build/outputs/apk/debug/`.
5. Transférez l'APK sur l'appareil Android et installez-le. L'installation depuis une source inconnue peut nécessiter une autorisation dans Android TV.

Le dépôt ne contient pas de Gradle Wrapper. Android Studio doit donc fournir Gradle pour synchroniser et compiler le projet.

### Installer l'APK sur Android TV

Un APK de débogage précompilé est disponible en **[téléchargement direct](https://github.com/Tof84fr/velotrainer-d100/raw/refs/heads/main/VeloTrainer-AndroidTV-debug.apk)**. Il s'agit de la version **1.0.0**, générée à partir de ce projet pour simplifier l'installation sans Android Studio. Sa taille est d'environ **6,7 Mo**.

1. Téléchargez l'APK depuis la page GitHub du projet, ou copiez-le sur une clé USB.
2. Ouvrez le fichier sur la TV avec un gestionnaire de fichiers.
3. Si Android TV le demande, autorisez temporairement ce gestionnaire à **installer des applications inconnues**, puis confirmez l'installation.
4. Ouvrez **VéloTrainer D100**, activez le Bluetooth et suivez les instructions [de connexion au D100](#connecter-le-home-trainer-en-bluetooth).

Cet APK est un **build de débogage**, non une version publiée sur le Play Store. Android peut afficher un avertissement lors de l'installation. Pour créer vous-même un build, utilisez Android Studio en suivant les étapes ci-dessus. Une installation déjà signée avec une autre clé peut devoir être désinstallée avant d'installer cet APK.

Empreinte SHA-256 de cet APK :

```text
E83D3295EAF871EAF5A153EF3B5751EC9A6E40ED218D523D92E11162C784A547
```

## Architecture du projet

```text
.
├── server.py                         # Serveur HTTP local Python
├── demarrer_application.bat          # Lanceur Windows
├── create_archive.py                 # Création de l'archive ZIP de distribution
├── generate_pdf.py                   # Génération du guide général
├── generate_apk_guide_pdf.py          # Génération du guide d'installation Android
├── requirements.txt                  # Dépendance Python des générateurs PDF
├── web-app/                          # Application Web autonome
│   ├── index.html                    # Interface
│   ├── app.js                        # État de séance et interactions
│   ├── ftms.js                       # Connexion Web Bluetooth / FTMS
│   ├── world3d.js                    # Environnement 3D
│   ├── gpx_parser.js                 # Import de routes GPX
│   ├── export.js                     # Exports TCX/CSV
│   ├── sw.js                         # Cache Service Worker
│   └── three.min.js                  # Three.js embarqué
└── android-app/                      # Application Android Kotlin
    └── app/src/main/
        ├── java/com/velotrainer/vanrysel/
        │   ├── MainActivity.kt       # Écran, commandes et séance
        │   ├── FtmsManager.kt        # BLE natif et protocole FTMS
        │   └── VirtualGearCalculator.kt
        ├── res/                      # Interface, couleurs et ressources
        └── assets/web/               # Version Web embarquée dans la WebView
```

`android-app/app/src/main/assets/web/` embarque les ressources Web pour la vue 3D. Si une modification de l'interface Web doit aussi apparaître dans la version Android, reportez la ressource modifiée dans ce dossier.

## Commandes et modes

Dans l'application Web, les commandes disponibles dépendent de l'élément sélectionné :

- **Vitesses virtuelles** : flèches haut/bas ou boutons dédiés pour changer le rapport virtuel.
- **Mode ERG** : ajuste une puissance cible.
- **Simulation de pente** : ajuste la pente demandée au home trainer.
- **Course 3D** : touches de caméra et contrôles affichés à l'écran.
- **Séance** : démarrer, mettre en pause, réinitialiser et exporter.

Dans l'application Android, utilisez les boutons à l'écran ou la télécommande. Les flèches haut/bas contrôlent le mode actif ; **OK/Centre** démarre ou met en pause la séance ; **Retour** ferme la vue 3D si elle est affichée.

## Dépannage

### La TV affiche « Page Web non disponible »

- Vérifiez que l'adresse commence par `http://`, pas `https://`.
- Vérifiez que la fenêtre du serveur est toujours ouverte et qu'elle n'affiche pas d'erreur.
- Essayez l'adresse IP affichée par le serveur et vérifiez que PC et TV sont sur le même réseau, hors Wi-Fi invité.
- Vérifiez le profil réseau et l'autorisation Python dans le Pare-feu Windows pour votre réseau domestique.

### La page s'affiche, mais le Bluetooth ne se connecte pas dans le navigateur TV

C'est une limite distincte de l'accès réseau : le navigateur peut rendre la page tout en ne prenant pas en charge Web Bluetooth ou en le bloquant sur une origine HTTP. Utilisez l'application Android native sur une TV compatible BLE, ou servez la version Web depuis HTTPS avec un navigateur compatible.

### La recherche native ne trouve pas le D100

- Vérifiez que le Bluetooth de la TV est activé et que la TV prend en charge BLE.
- Allumez le home trainer et placez-le à proximité.
- Déconnectez-le des autres applications/appareils, puis relancez la recherche.
- Vérifiez que l'autorisation **Appareils à proximité** a été accordée à l'application.
- Si l'appareil est trouvé mais que FTMS échoue, vérifiez la compatibilité FTMS du modèle et de son micrologiciel.

### L'APK ne se construit pas

Vérifiez que JDK 17 et Android SDK 34 sont installés, que le dossier `android-app/` a été ouvert comme projet racine Android, et que Gradle a terminé sa première synchronisation.

## Confidentialité et limites

- Le serveur Python est destiné au réseau local et n'implémente ni HTTPS, ni comptes, ni authentification. Ne l'exposez pas directement à Internet.
- Les mesures Bluetooth sont traitées localement par l'application. Les exportations sont initiées par l'utilisateur ; consultez les autorisations du navigateur et les fonctions d'export avant une séance.
- Le navigateur TV peut avoir des limites de performance, d'entrée télécommande, de WebGL et de Bluetooth selon le fabricant.
- L'application et le simulateur ne remplacent pas un avis médical ni les limites et instructions du fabricant. Arrêtez en cas de douleur ou de dysfonctionnement matériel.

## Dépendances et licence

- L'application Web utilise Three.js, dont la version embarquée conserve son en-tête de licence MIT.
- L'application Android utilise AndroidX, Material Components, ConstraintLayout, Leanback et Kotlin Coroutines via Gradle.
- Le code du projet est publié sous licence MIT ; voir [`LICENSE`](./LICENSE). Three.js conserve sa propre notice et sa licence MIT dans son fichier embarqué.
- Les marques et noms de produits restent la propriété de leurs détenteurs respectifs.

Les guides PDF fournis avec le projet sont :

- [Guide VéloTrainer D100](./Guide_VeloTrainer_VanRysel_D100.pdf)
- [Guide d'installation Android TV](./Guide_Installation_APK_VeloTrainer_AndroidTV.pdf)

Les générateurs PDF nécessitent ReportLab. Pour les exécuter ou recréer l'archive ZIP :

```powershell
py -m pip install -r requirements.txt
py generate_pdf.py
py generate_apk_guide_pdf.py
py create_archive.py
```
