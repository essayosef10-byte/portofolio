import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'extract_pdf.py'


def write_text_pdf(path: Path, text: str) -> None:
    content = f'BT /F1 12 Tf 20 120 Td ({text}) Tj ET'.encode('ascii')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream',
    ]
    data = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(data))
        data.extend(f'{index} 0 obj\n'.encode())
        data.extend(obj)
        data.extend(b'\nendobj\n')
    xref = len(data)
    data.extend(f'xref\n0 {len(objects) + 1}\n'.encode())
    data.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        data.extend(f'{offset:010d} 00000 n \n'.encode())
    data.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    path.write_bytes(data)


class PdfExtractionTests(unittest.TestCase):
    def test_extracts_text_with_original_pdf_page_number(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf = Path(directory) / 'lecture.pdf'
            write_text_pdf(pdf, 'Lecture concept')
            result = subprocess.run([sys.executable, str(SCRIPT), str(pdf)], capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        payload = json.loads(result.stdout)
        self.assertEqual(payload['totalPages'], 1)
        self.assertEqual(payload['pages'], [{'page': 1, 'text': 'Lecture concept'}])
        self.assertEqual(payload['emptyPages'], [])

    def test_rejects_non_pdf_input_with_json_error(self):
        with tempfile.TemporaryDirectory() as directory:
            file_path = Path(directory) / 'bad.pdf'
            file_path.write_text('not a PDF', encoding='utf-8')
            result = subprocess.run([sys.executable, str(SCRIPT), str(file_path)], capture_output=True, text=True, cwd=ROOT)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('error', json.loads(result.stdout))


if __name__ == '__main__':
    unittest.main()
