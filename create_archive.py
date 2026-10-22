import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_ZIP = BASE_DIR / "VeloTrainer_VanRysel_D100.zip"

# Éléments à inclure dans l'archive
INCLUDED = [
    "Guide_VeloTrainer_VanRysel_D100.pdf",
    "Guide_Installation_APK_VeloTrainer_AndroidTV.pdf",
    "demarrer_application.bat",
    "server.py",
    "README.md",
    ".gitignore",
    "LICENSE",
    "requirements.txt",
    "generate_pdf.py",
    "generate_apk_guide_pdf.py",
    "web-app",
    "android-app"
]

def make_zip():
    print(f"Création de l'archive : {OUTPUT_ZIP}...")
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in INCLUDED:
            full_path = BASE_DIR / item
            if not full_path.exists():
                print(f"Attention : {item} introuvable, ignoré.")
                continue

            if full_path.is_dir():
                for path in full_path.rglob("*"):
                    if not path.is_file():
                        continue
                    if any(part in {".git", ".idea", ".gradle", "build", "__pycache__"} for part in path.parts):
                        continue
                    if path.suffix == ".pyc":
                        continue
                    zf.write(path, path.relative_to(BASE_DIR).as_posix())
            else:
                zf.write(full_path, item)

    print(f"Archive créée avec succès ! Taille : {OUTPUT_ZIP.stat().st_size / (1024*1024):.2f} Mo")

if __name__ == "__main__":
    make_zip()
