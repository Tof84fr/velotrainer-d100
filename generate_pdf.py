from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

PROJECT_DIR = Path(__file__).resolve().parent
PDF_PATH = PROJECT_DIR / "Guide_VeloTrainer_VanRysel_D100.pdf"

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # En-tête (sauf page 1)
        if self._pageNumber > 1:
            self.drawString(54, 800, "VeloTrainer — Van Rysel D100 (Zwift Edition) | Guide Technique")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 792, 541, 792)

        # Pied de page
        page_str = f"Page {self._pageNumber} sur {page_count}"
        self.drawRightString(541, 35, page_str)
        self.drawString(54, 35, "Application Gratuite Smartphone & Android TV — Décathlon Van Rysel D100")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 48, 541, 48)
        self.restoreState()

def create_manual_pdf(filename):
    filename = str(filename)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Styles personnalisés
    style_cover_title = ParagraphStyle(
        'CoverTitle',
        fontName='Helvetica-Bold',
        fontSize=26,
        leading=32,
        textColor=colors.HexColor('#0F172A'),
        alignment=1, # Centré
        spaceAfter=12
    )

    style_cover_subtitle = ParagraphStyle(
        'CoverSubTitle',
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0284C7'),
        alignment=1,
        spaceAfter=25
    )

    style_h1 = ParagraphStyle(
        'Heading1_Custom',
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'Heading2_Custom',
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0369A1'),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'Body_Custom',
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=7
    )

    style_body_bold = ParagraphStyle(
        'Body_Bold_Custom',
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=7
    )

    style_bullet = ParagraphStyle(
        'Bullet_Custom',
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#334155'),
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    style_callout = ParagraphStyle(
        'Callout_Text',
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#0C4A6E')
    )

    story = []

    # --- PAGE DE COUVERTURE ---
    story.append(Spacer(1, 40))
    story.append(Paragraph("VÉLOTRAINER", style_cover_title))
    story.append(Paragraph("Application d'Entraînement & Simulateur 3D pour Home Trainer", style_cover_subtitle))
    story.append(Paragraph("<b>Spécialement développé pour le Van Rysel D100 (Zwift Edition)</b><br/>Smartphone Android & Android TV (Grand Écran)", ParagraphStyle('CoverDesc', fontName='Helvetica', fontSize=11, leading=16, alignment=1, textColor=colors.HexColor('#475569'))))
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0284C7'), spaceBefore=10, spaceAfter=20))

    # Tableau résumé
    specs_data = [
        [Paragraph("<b>Matériel</b>", style_body_bold), Paragraph("Van Rysel D100 Interactive Home Trainer (Zwift Edition)", style_body)],
        [Paragraph("<b>Réf. Décathlon</b>", style_body_bold), Paragraph("5224600 / CC: 355194 / ART# 52246 00", style_body)],
        [Paragraph("<b>Transmission</b>", style_body_bold), Paragraph("Direct Drive (Transmission directe) avec pignon unique Zwift Cog 14 dents", style_body)],
        [Paragraph("<b>Connectivité</b>", style_body_bold), Paragraph("Bluetooth Low Energy (FTMS - Fitness Machine Service)", style_body)],
        [Paragraph("<b>Puissance Max</b>", style_body_bold), Paragraph("600 Watts (à 60 km/h) | Pente max simulée : +6.0%", style_body)],
        [Paragraph("<b>Plateformes</b>", style_body_bold), Paragraph("Android TV / Google TV, Smartphone Android, Tablette, PC", style_body)],
        [Paragraph("<b>Coût d'usage</b>", style_body_bold), Paragraph("<b>100% Gratuit à vie</b> (sans abonnement Zwift/Kinomap)", style_body)]
    ]
    t_specs = Table(specs_data, colWidths=[130, 350])
    t_specs.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_specs)
    story.append(Spacer(1, 25))

    # Encadré d'introduction
    intro_callout = [
        [Paragraph("<b>Objectif de la solution :</b> Vous permettre d'exploiter immédiatement 100% du potentiel de votre home trainer Décathlon Van Rysel D100 sans débourser les 19,99 €/mois d'abonnement Zwift. Vous disposez d'un simulateur de vitesses virtuelles (pour compenser le pignon unique), d'un monde 3D avec décors grandioses pour votre télévision, d'un asservissement physique de la résistance à la pente, et d'un support des télécommandes TV et manettes au guidon.", style_callout)]
    ]
    t_intro = Table(intro_callout, colWidths=[480])
    t_intro.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#E0F2FE')),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#0284C7')),
        ('PADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_intro)

    story.append(PageBreak())

    # --- SECTION 1 : FONCTIONNEMENT DÉTAILLÉ DE L'APPLICATION ---
    story.append(Paragraph("1. Fonctionnement Détaillé de l'Application", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=12))

    story.append(Paragraph("1.1 Le Protocole Bluetooth FTMS (Standard Universel)", style_h2))
    story.append(Paragraph("Le Van Rysel D100 communique via la norme internationale <b>Bluetooth FTMS (Fitness Machine Service - UUID 0x1826)</b>. L'application se connecte directement à l'appareil sans passer par aucun serveur externe ni compte utilisateur :", style_body))
    story.append(Paragraph("• <b>Caractéristique Indoor Bike Data (0x2AD2) :</b> L'application écoute en continu les trames émises par le home trainer (60 fois par minute) pour extraire la <b>puissance réelle en Watts</b>, la <b>cadence de pédalage en RPM</b>, la <b>vitesse en km/h</b> et la distance cumulée.", style_bullet))
    story.append(Paragraph("• <b>Point de Contrôle (Control Point 0x2AD9) :</b> L'application envoie les instructions directes au frein électromagnétique : demande de contrôle (0x00), démarrage de session (0x07), consigne de puissance cible ERG (0x05) et simulation de pente (0x11).", style_bullet))

    story.append(Paragraph("1.2 Système de Vitesses Virtuelles (Pour le Zwift Cog)", style_h2))
    story.append(Paragraph("Votre home trainer étant la version <b>Zwift Edition</b>, il ne possède pas de cassette classique mais un <b>pignon unique de 14 dents</b>. Sans vitesses virtuelles, rouler sur un pignon fixe serait monotone et inconfortable :", style_body))
    story.append(Paragraph("• L'application embarque un <b>modèle mathématique à 24 rapports de transmission</b> (de V1 = rapport grimpeur 34x34 jusqu'à V24 = grand braquet de sprint 53x11).", style_bullet))
    story.append(Paragraph("• Chaque passage de vitesse (via les touches Chaîne + / Chaîne − de la télécommande TV, l'écran ou une manette) recalcule instantanément l'effort requis selon l'équation physique cycliste :", style_body))
    story.append(Paragraph("<b>Puissance Cible = P_roulement + P_aérodynamique + P_gravité (Pente)</b>", ParagraphStyle('Formula', fontName='Helvetica-Bold', fontSize=9.5, alignment=1, textColor=colors.HexColor('#0369A1'), spaceBefore=4, spaceAfter=6)))
    story.append(Paragraph("• Un effet sonore mécanique de passage de vitesse (synthétisé via l'API Web Audio) procure un ressenti tactile immédiat à chaque changement de braquet.", style_bullet))

    story.append(Paragraph("1.3 Course 3D & Décors Immersifs sur votre TV", style_h2))
    story.append(Paragraph("Conçu pour transformer votre séance d'entraînement en véritable jeu vidéo immersif sans abonnement :", style_body))
    story.append(Paragraph("• <b>Moteur 3D temps réel (Three.js WebGL à 60 FPS) :</b> Génère une route fluide avec virages, relief, végétation et éclairage dynamique.", style_bullet))
    story.append(Paragraph("• <b>4 Décors au Choix :</b> Le Col des Alpes (montagne, chalets, sapins), la Côte d'Azur (mer turquoise, palmiers, crépuscule), le Critérium Cyberpunk (nuit urbaine illuminée de néons) et la Campagne bocagère.", style_bullet))
    story.append(Paragraph("• <b>Deux Vues Caméra :</b> Vue 1ère personne (POV au guidon, immersion totale face à la route) et Vue 3ème personne (caméra suiveuse derrière votre cycliste).", style_bullet))
    story.append(Paragraph("• <b>4 Concurrents Virtuels (Bots IA) :</b> Julian (attaquant puncheur), Tadej (grimpeur d'élite), Wout (rouleur puissant) et Mathieu (polyvalent). Un bandeau de classement affiche les écarts en mètres en direct.", style_bullet))

    story.append(Paragraph("1.4 Changement Physique de Résistance Selon le Relief", style_h2))
    story.append(Paragraph("Le relief affiché sur la TV modifie directement la dureté de vos pédales :", style_body))
    story.append(Paragraph("• <b>En montée (+1% à +6%) :</b> L'application envoie l'angle de pente au Van Rysel D100. Le frein électromagnétique se resserre physiquement. Pédaler devient dur et lourd. Vous passez sur un plus petit braquet virtuel (V2–V4) avec la télécommande pour continuer à mouliner souplement.", style_bullet))
    story.append(Paragraph("• <b>En descente :</b> Le frein se relâche, le pédalage s'allège et vous passez en V20 pour sprinter à plus de 45 km/h.", style_bullet))
    story.append(Paragraph("• <b>Profil Altimétrique & Jauge de Pente :</b> Une barre dynamique au bas de la TV affiche le profil complet des 5 km avec un repère mobile indiquant votre position exacte.", style_bullet))
    story.append(Paragraph("• <b>Curseur de Difficulté Réaliste (25% à 100%) :</b> Comme sur Zwift, réglez l'intensité des pentes selon votre forme du jour.", style_bullet))

    story.append(PageBreak())

    # --- SECTION 2 : FONCTIONNALITÉS COMPLÉMENTAIRES (GITHUB) ---
    story.append(Paragraph("2. Inspirations Open-Source & Fonctionnalités Avancées", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=12))

    story.append(Paragraph("2.1 Importation de Tracés GPX Réels (Inspiré de GPX Rider)", style_h2))
    story.append(Paragraph("Vous pouvez charger vos propres parcours GPS (fichiers <b>.gpx</b>) créés sur Strava, Komoot ou Garmin :", style_body))
    story.append(Paragraph("• Cliquez sur le bouton <b>📁 Importer GPX</b> : le profil altimétrique et la pente réelle du parcours sont instantanément calculés et simulés.", style_bullet))
    story.append(Paragraph("• <b>4 Cols Mythiques Intégrés :</b> L'Alpe d'Huez (13.8 km, 21 lacets), le Mont Ventoux (21.5 km), les Champs-Élysées (6.8 km) et la Promenade de Nice (10 km).", style_bullet))

    story.append(Paragraph("2.2 Support des Manettes Bluetooth au Guidon (Inspiré d'OpenBikeControl)", style_h2))
    story.append(Paragraph("L'application intègre l'API Gamepad : connectez n'importe quelle petite manette Bluetooth (ex: 8BitDo Micro à 15€ ou manette de console) fixée au guidon. Les gâchettes <b>R1/L1</b> ou les boutons <b>Haut/Bas</b> passent vos vitesses virtuelles instantanément sans lâcher le cintre !", style_body))

    story.append(Paragraph("2.3 Entraînements Structurés & Mode ERG (Inspiré de Flux)", style_h2))
    story.append(Paragraph("• <b>Mode ERG (Puissance Cible Constante) :</b> Choisissez une puissance (ex: 180W). Le home trainer s'adapte automatiquement à votre cadence de pédalage pour maintenir exactement vos Watts.", style_bullet))
    story.append(Paragraph("• <b>Programmes Pré-intégrés :</b> Échauffement pyramidal (12 min), Fractionné HIIT 30/30 (15 min), Sweet Spot FTP Booster (25 min) et Endurance active.", style_bullet))

    story.append(Paragraph("2.4 Exportation Vers Strava & Décathlon Connect", style_h2))
    story.append(Paragraph("À la fin de votre séance, cliquez sur <b>Exporter Séance (TCX Strava)</b> pour télécharger un fichier au format universel <b>.tcx</b> contenant chaque seconde d'effort (Watts, cadence, vitesse, dénivelé). Glissez-le directement dans votre compte Strava ou Garmin Connect.", style_body))

    story.append(Spacer(1, 10))

    # --- SECTION 3 : GUIDE DE LANCEMENT PAS-À-PAS ---
    story.append(Paragraph("3. Guide Pratique de Mise en Route", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=12))

    guide_steps = [
        [Paragraph("<b>Étape 1</b>", style_body_bold), Paragraph("Allumez votre home trainer Van Rysel D100 (la LED clignote en attente de connexion BLE).", style_body)],
        [Paragraph("<b>Étape 2</b>", style_body_bold), Paragraph("Sur votre PC, double-cliquez sur le fichier <b>demarrer_application.bat</b> situé dans le dossier du projet.", style_body)],
        [Paragraph("<b>Étape 3</b>", style_body_bold), Paragraph("Pour rouler sur votre <b>Android TV</b> : connectez la TV au même réseau Wi-Fi, ouvrez son navigateur internet (ex: <i>BrowseHere</i> ou <i>TV Bro</i>) et saisissez l'adresse locale affichée dans la console (ex: <code>http://192.168.1.XX:8080</code>).", style_body)],
        [Paragraph("<b>Étape 4</b>", style_body_bold), Paragraph("Pour rouler sur votre <b>Smartphone Android</b> : ouvrez l'adresse dans Chrome, puis cliquez sur le menu (3 points) > <b>'Ajouter à l'écran d'accueil'</b> pour installer l'application sur votre téléphone.", style_body)],
        [Paragraph("<b>Étape 5</b>", style_body_bold), Paragraph("Cliquez sur <b>'Connecter Home Trainer'</b> puis sur <b>'Course 3D & Décors TV'</b>. Montez sur le vélo et commencez à pédaler !", style_body)]
    ]
    t_guide = Table(guide_steps, colWidths=[80, 400])
    t_guide.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_guide)

    story.append(Spacer(1, 15))

    # --- SECTION 4 : TOUCHES DE LA TÉLÉCOMMANDE TV ---
    story.append(Paragraph("4. Raccourcis Télécommande Android TV", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=12))

    remote_data = [
        [Paragraph("<b>Touche</b>", style_body_bold), Paragraph("<b>Action dans l'Application</b>", style_body_bold)],
        [Paragraph("<b>Flèches directionnelles</b>", style_body), Paragraph("Naviguer entre les boutons et les menus ; elles ne changent pas les vitesses.", style_body)],
        [Paragraph("<b>OK / Centre</b>", style_body), Paragraph("Activer l'élément sélectionné. Dans la course, utiliser « Démarrer séance » pour démarrer ou mettre en pause.", style_body)],
        [Paragraph("<b>Chaîne + / CH +</b>", style_body), Paragraph("Monter d'une vitesse virtuelle ou augmenter la cible ERG / simulation.", style_body)],
        [Paragraph("<b>Chaîne − / CH −</b>", style_body), Paragraph("Descendre d'une vitesse virtuelle ou réduire la cible ERG / simulation.", style_body)],
        [Paragraph("<b>Touche C</b>", style_body), Paragraph("Basculer la caméra : Vue Guidon (POV 1ère personne) ou Vue 3ème personne", style_body)],
        [Paragraph("<b>Touche R</b>", style_body), Paragraph("Ouvrir / Fermer le mode Course 3D plein écran", style_body)],
        [Paragraph("<b>Touche Retour</b>", style_body), Paragraph("Quitter la course 3D et revenir au tableau de bord des compteurs", style_body)]
    ]
    t_remote = Table(remote_data, colWidths=[140, 340])
    t_remote.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0284C7')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_remote)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF généré avec succès : {filename}")

if __name__ == "__main__":
    create_manual_pdf(PDF_PATH)
