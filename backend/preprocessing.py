#pip install pymupdf

import zipfile
import fitz  # PyMuPDF
import csv
import os
import re

def limpiar_texto(texto):
    """Limpia el texto quitando ruidos comunes de la extracción de PDF."""
    # Convertir a minúsculas
    texto = texto.lower()
    # Quitar URLs
    texto = re.sub(r'http\S+|www\S+|https\S+', '', texto, flags=re.MULTILINE)
    # Quitar caracteres especiales pero mantener letras y números básicos
    texto = re.sub(r'[^\w\sáéíóúñ@.,]', '', texto)
    # Reemplazar múltiples espacios o saltos de línea por uno solo
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto

def procesar_zip_a_csv(ruta_zip, carpeta_destino="cvs_limpios"):
    # Crear carpeta de destino si no existe
    if not os.path.exists(carpeta_destino):
        os.makedirs(carpeta_destino)
        print(f"📁 Carpeta '{carpeta_destino}' creada.")

    try:
        with zipfile.ZipFile(ruta_zip, 'r') as z:
            # Listar solo archivos PDF
            archivos_pdf = [f for f in z.namelist() if f.lower().endswith('.pdf')]
            
            if not archivos_pdf:
                print("❌ No se encontraron archivos PDF en el ZIP.")
                return

            print(f"📦 Encontrados {len(archivos_pdf)} PDFs. Procesando...")

            for nombre_pdf in archivos_pdf:
                try:
                    # 1. Leer PDF desde el ZIP
                    with z.open(nombre_pdf) as f:
                        pdf_bytes = f.read()
                        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                        texto_crudo = ""
                        for pagina in doc:
                            texto_crudo += pagina.get_text()
                    
                    # 2. Limpiar texto
                    texto_limpio = limpiar_texto(texto_crudo)

                    # 3. Crear nombre para el CSV (quitando .pdf)
                    nombre_base = os.path.basename(nombre_pdf).replace('.pdf', '')
                    ruta_csv = os.path.join(carpeta_destino, f"{nombre_base}.csv")

                    # 4. Guardar en CSV
                    with open(ruta_csv, 'w', newline='', encoding='utf-8') as csvfile:
                        writer = csv.writer(csvfile)
                        writer.writerow(['archivo', 'contenido']) # Cabecera
                        writer.writerow([nombre_pdf, texto_limpio])
                    
                    print(f"✅ Procesado: {nombre_base}.csv")

                except Exception as e:
                    print(f"⚠️ Error procesando {nombre_pdf}: {e}")

    except Exception as e:
        print(f"❌ Error al abrir el ZIP: {e}")

# --- EJECUCIÓN ---
if __name__ == "__main__":
    # Cambia esto por el nombre de tu archivo ZIP
    procesar_zip_a_csv("mis_curriculums.zip")