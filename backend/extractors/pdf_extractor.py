import fitz  # PyMuPDF
import io
import logging

logger = logging.getLogger(__name__)

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extrae texto de un archivo PDF dado su ruta.
    """
    try:
        doc = fitz.open(file_path)
        text = ""
        for page_num in range(len(doc)):
            page = doc[page_num]
            text += page.get_text()
        return text.strip()
    except Exception as e:
        logger.error(f"Error al extraer texto del PDF {file_path}: {e}")
        return ""

def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    """
    Extrae texto de un PDF en formato de bytes (útil para archivos subidos vía API).
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page_num in range(len(doc)):
            page = doc[page_num]
            text += page.get_text()
        return text.strip()
    except Exception as e:
        logger.error(f"Error al extraer texto del PDF desde bytes: {e}")
        return ""
