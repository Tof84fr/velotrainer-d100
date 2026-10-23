from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

PROJECT_DIR = Path(__file__).resolve().parent
PDF_PATH = PROJECT_DIR / "Guide_Installation_APK_VeloTrainer_AndroidTV.pdf"

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
            self.drawString(54, 800, "VeloTrainer — Guide d'Installation APK | Android TV & Smartphone")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 792, 541, 792)

        # Pied de page
        page_str = f"Page {self._pageNumber} sur {page_count}"
        self.drawRightString(541, 35, page_str)
        self.drawString(54, 35, "VeloTrainer pour Home Trainer Van Rysel D100 (Zwift Edition)")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 48, 541, 48)
        self.restoreState()

def create_guide_pdf(filename):
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
    style_title = ParagraphStyle(
        'MainTitle',
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=28,
        textColor=colors.HexColor('#0F172A'),
        alignment=1,
        spaceAfter=8
    )

    style_subtitle = ParagraphStyle(
        'SubTitle',
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0284C7'),
        alignment=1,
        spaceAfter=20
    )

    style_h1 = ParagraphStyle(
        'Heading1_Custom',
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'Heading2_Custom',
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#0369A1'),
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'Body_Custom',
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=6
    )

    style_body_bold = ParagraphStyle(
        'Body_Bold_Custom',
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=6
    )

    style_bullet = ParagraphStyle(
        'Bullet_Custom',
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=4
    )

    style_callout = ParagraphStyle(
        'Callout_Text',
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=colors.HexColor('#0C4A6E')
    )

    story = []

    # --- EN-TÊTE ---
    story.append(Paragraph("VELOTRAINER", style_title))
    story.append(Paragraph("Guide d'Installation APK Pas-à-Pas (Option Clé USB)", style_subtitle))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0284C7'), spaceBefore=5, spaceAfter=15))

    # Tableau résumé
    summary_data = [
        [Paragraph("<b>Application</b>", style_body_bold), Paragraph("VeloTrainer Native Android (Kotlin / WebGL 3D)", style_body)],
        [Paragraph("<b>Matériel Cible</b>", style_body_bold), Paragraph("Android TV / Google TV & Smartphone Android", style_body)],
        [Paragraph("<b>Équipement</b>", style_body_bold), Paragraph("Van Rysel D100 - Zwift Edition (Bluetooth FTMS)", style_body)],
        [Paragraph("<b>Méthode TV</b>", style_body_bold), Paragraph("<b>Option A : Installation via Clé USB</b>", style_body)],
        [Paragraph("<b>Licence</b>", style_body_bold), Paragraph("100% Gratuit à vie (sans abonnement)", style_body)]
    ]
    t_sum = Table(summary_data, colWidths=[120, 360])
    t_sum.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_sum)
    story.append(Spacer(1, 12))

    # --- ENCADRÉ AVANTAGES ---
    callout_box = [
        [Paragraph("<b>Pourquoi l'Application Native APK ?</b><br/>L'application Android native s'exécute directement sur votre Android TV et Smartphone. Elle gère nativement le Bluetooth LE (FTMS) avec votre Van Rysel D100, accélère les graphismes 3D matériellement et prend en charge la télécommande TV ainsi que les bannières d'accueil Android TV.", style_callout)]
    ]
    t_callout = Table(callout_box, colWidths=[480])
    t_callout.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#E0F2FE')),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#0284C7')),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_callout)
    story.append(Spacer(1, 10))

    # --- SECTION 1 : COMPILATION DANS ANDROID STUDIO ---
    story.append(Paragraph("1. Générer le Fichier APK sur PC", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1. Ouvrez <b>Android Studio</b> et chargez le dossier du projet : <code>android-app</code>.", style_bullet))
    story.append(Paragraph("2. Laissez Gradle effectuer la synchronisation initiale du projet.", style_bullet))
    story.append(Paragraph("3. Dans le menu supérieur, cliquez sur <b>Build > Build Bundle(s) / APK(s) > Build APK(s)</b>.", style_bullet))
    story.append(Paragraph("4. Une fois la compilation terminée, une pop-up apparaît en bas à droite : cliquez sur <b>locate</b>.", style_bullet))
    story.append(Paragraph("5. Le fichier APK se trouve à cet emplacement sur votre disque dur :<br/><code>android-app\\app\\build\\outputs\\apk\\debug\\app-debug.apk</code>", style_bullet))
    story.append(Paragraph("6. Pour plus de facilité, renommez le fichier <code>app-debug.apk</code> en <b><code>VeloTrainer.apk</code></b>.", style_bullet))

    story.append(Spacer(1, 10))

    # --- SECTION 2 : INSTALLATION VIA CLÉ USB (OPTION A) ---
    story.append(Paragraph("2. Procédure d'Installation Pas-à-Pas sur Android TV (Option A)", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=8))

    steps_data = [
        [Paragraph("<b>Étape 1</b><br/>Copie USB", style_body_bold), Paragraph("• Branchez une clé USB (formatée en FAT32 ou exFAT) sur votre PC.<br/>• Copiez le fichier <b><code>VeloTrainer.apk</code></b> à la racine de la clé USB.<br/>• Éjectez proprement la clé USB du PC.", style_body)],
        [Paragraph("<b>Étape 2</b><br/>Gestionnaire TV", style_body_bold), Paragraph("• Sur votre Android TV, ouvrez le Play Store.<br/>• Recherchez et installez un gestionnaire de fichiers gratuit (ex: <b>FX File Explorer</b>, <b>AnExplorer</b> ou <b>File Commander</b>).", style_body)],
        [Paragraph("<b>Étape 3</b><br/>Autorisation", style_body_bold), Paragraph("• Sur la TV, allez dans <b>Paramètres (Engrenage) > Applications > Sécurité et restrictions</b> (ou <i>Accès spécial des applications</i>).<br/>• Sélectionnez <b>Installer des applications inconnues</b>.<br/>• Activez l'autorisation pour votre gestionnaire de fichiers (ex: <i>FX File Explorer</i>).", style_body)],
        [Paragraph("<b>Étape 4</b><br/>Installation", style_body_bold), Paragraph("• Insérez la clé USB dans le port USB de votre Android TV.<br/>• Ouvrez le gestionnaire de fichiers sur la TV et naviguez jusqu'à la clé USB.<br/>• Sélectionnez <b><code>VeloTrainer.apk</code></b> et cliquez sur <b>Installer</b>.", style_body)],
        [Paragraph("<b>Étape 5</b><br/>Lancement", style_body_bold), Paragraph("• L'application apparaît immédiatement sur l'écran d'accueil Android TV avec sa bannière dedicated.<br/>• Vous n'avez plus qu'à la lancer avec la télécommande TV !", style_body)]
    ]
    t_steps = Table(steps_data, colWidths=[90, 390])
    t_steps.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_steps)

    story.append(Spacer(1, 10))

    # --- SECTION 3 : INSTALLATION SUR SMARTPHONE ANDROID ---
    story.append(Paragraph("3. Installation Rapide sur Smartphone Android", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1. Transférez le fichier <code>VeloTrainer.apk</code> sur votre téléphone (par câble USB, Google Drive, WhatsApp ou Email).", style_bullet))
    story.append(Paragraph("2. Ouvrez le fichier sur votre Smartphone.", style_bullet))
    story.append(Paragraph("3. Si Android le demande, autorisez votre navigateur / gestionnaire à installer des applications inconnues.", style_bullet))
    story.append(Paragraph("4. Cliquez sur <b>Installer</b> puis lancez VeloTrainer.", style_bullet))

    story.append(PageBreak())

    # --- SECTION 4 : COMMANDES TÉLÉCOMMANDE TV ---
    story.append(Paragraph("4. Raccourcis Télécommande Android TV", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=8))

    remote_data = [
        [Paragraph("<b>Touche Télécommande</b>", style_body_bold), Paragraph("<b>Action dans l'Application VeloTrainer</b>", style_body_bold)],
        [Paragraph("<b>Flèches directionnelles</b>", style_body), Paragraph("Déplacer le focus dans les boutons et menus. Elles ne changent plus les vitesses.", style_body)],
        [Paragraph("<b>OK / Centre</b>", style_body), Paragraph("Activer le bouton ou le menu sélectionné. Dans la course, utiliser le bouton « Démarrer séance » pour commencer ou mettre en pause.", style_body)],
        [Paragraph("<b>Chaîne + / CH +</b>", style_body), Paragraph("Monter d'une vitesse virtuelle (Zwift Cog V1 à V24), ou augmenter la cible en modes ERG et Simulation.", style_body)],
        [Paragraph("<b>Chaîne − / CH −</b>", style_body), Paragraph("Descendre d'une vitesse virtuelle, ou réduire la cible en modes ERG et Simulation.", style_body)],
        [Paragraph("<b>Touche RETOUR (Back)</b>", style_body), Paragraph("Fermer le mode Course 3D et revenir au tableau de bord des compteurs.", style_body)],
        [Paragraph("<b>Bouton 'Connecter Trainer'</b>", style_body), Paragraph("Démarre la recherche automatique Bluetooth FTMS du Van Rysel D100.", style_body)]
    ]
    t_remote = Table(remote_data, colWidths=[150, 330])
    t_remote.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0284C7')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#F8FAFC')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_remote)

    story.append(Spacer(1, 15))

    # --- SECTION 5 : CONSEILS D'UTILISATION ---
    story.append(Paragraph("5. Conseils d'Utilisation & Dépannage", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E2E8F0'), spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("• <b>Allumage du D100 :</b> Allumez votre home trainer Van Rysel D100 avant de cliquer sur 'Connecter Home Trainer' dans l'application.", style_bullet))
    story.append(Paragraph("• <b>Déconnexion Zwift/Kinomap :</b> Assurez-vous que le D100 n'est pas déjà connecté en Bluetooth à votre téléphone ou à une autre application. Le Bluetooth BLE ne permet qu'une seule connexion active à la fois.", style_bullet))
    story.append(Paragraph("• <b>Autorisation Appareils à proximité :</b> Lors du premier lancement sur la TV, acceptez la demande de permission Bluetooth / Appareils à proximité pour permettre au scan de détecter le D100.", style_bullet))
    story.append(Paragraph("• <b>Mode Vitesse Virtuelle (Zwift Cog) :</b> Utilisez les touches Chaîne + / Chaîne − de la télécommande pour changer de rapport. Les flèches directionnelles restent disponibles pour naviguer dans les menus.", style_bullet))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF généré avec succès : {filename}")

if __name__ == "__main__":
    create_guide_pdf(PDF_PATH)
