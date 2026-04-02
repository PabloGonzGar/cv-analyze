from pathlib import Path
 
def extract_text_from_pdf(path: Path) -> str:
    """Extrae texto de un PDF usando pdfplumber (más fiable que PyPDF2 para CVs)."""
    try:
        import pdfplumber
        texto = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    texto.append(t)
        return "\n".join(texto)
    except ImportError:
        # Fallback a PyPDF2 si pdfplumber no está instalado
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(str(path))
            return "\n".join(
                page.extract_text() or "" for page in reader.pages
            )
        except Exception:
            return ""
    except Exception:
        return ""