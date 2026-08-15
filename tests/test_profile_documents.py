import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from profile_documents import (
    PdfImportError, decode_pdf_data, extract_pdf_links, extract_pdf_text, import_pdf,
    normalize_profile_import,
)


class _Page:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class _Reader:
    is_encrypted = False
    pages = [_Page("Python\n• Built the import flow\n"), _Page("Skills\nLangGraph\n")]


class _LinkPage:
    def __init__(self, urls):
        self.urls = urls

    def get(self, name):
        if name != "/Annots":
            return None
        return [{"/Subtype": "/Link", "/A": {"/URI": url}} for url in self.urls]


class _LinkReader:
    is_encrypted = False
    pages = [_LinkPage([
        "https://github.com/example",
        "https://www.linkedin.com/in/example",
        "https://ieeexplore.ieee.org/document/123",
    ])]


class ProfileDocumentTests(unittest.TestCase):
    def test_decodes_only_a_base64_pdf_payload(self):
        data_url = "data:application/pdf;base64," + base64.b64encode(b"%PDF-test").decode()
        self.assertEqual(decode_pdf_data(data_url), b"%PDF-test")
        with self.assertRaises(PdfImportError):
            decode_pdf_data("data:text/plain;base64,SGVsbG8=")

    @patch("profile_documents.PdfReader", return_value=_Reader())
    def test_extracts_line_content_without_rewriting_bullets(self, _reader):
        text, pages = extract_pdf_text(b"%PDF-test")
        self.assertEqual(pages, 2)
        self.assertIn("• Built the import flow", text)
        self.assertIn("LangGraph", text)

    @patch("profile_documents.PdfReader", return_value=_Reader())
    def test_import_retains_source_and_extracted_sidecar(self, _reader):
        data_url = "data:application/pdf;base64," + base64.b64encode(b"%PDF-test").decode()
        with tempfile.TemporaryDirectory() as temp:
            result = import_pdf(Path(temp), "resume.pdf", data_url)
            source = Path(temp) / "documents" / "resume.pdf"
            sidecar = Path(temp) / "documents" / "resume.pdf.txt"
            self.assertEqual(result["source"], "pdf")
            self.assertEqual(source.read_bytes(), b"%PDF-test")
            self.assertIn("• Built the import flow", sidecar.read_text(encoding="utf-8"))

    @patch("profile_documents.PdfReader", return_value=_LinkReader())
    def test_extracts_embedded_link_annotations(self, _reader):
        links = extract_pdf_links(b"%PDF-test")
        self.assertEqual([link["label"] for link in links], ["GitHub", "LinkedIn", "Publication"])
        self.assertEqual(links[0]["kind"], "contact")
        self.assertEqual(links[2]["kind"], "publication")

    def test_normalizes_known_agent_aliases_without_creating_profile_facts(self):
        normalized = normalize_profile_import({
            "contact": {"links": ["GitHub", {"label": "Portfolio", "url": "https://example.com"}]},
            "skill_buckets": [{"name": "Tools", "skills": ["Python"]}],
            "experience": [{"start_date": "June 2024", "end_date": "Present", "highlights": ["Built it"]}],
            "projects": [{"name": "Persona", "tech_stack": ["Python"], "link": "https://example.com"}],
            "education": [{"degree": "BTech", "institution": "Example University", "end_date": "2025"}],
        })
        self.assertEqual(normalized["skill_buckets"], [{"category": "Tools", "skills": ["Python"]}])
        self.assertEqual(normalized["experience"][0]["start"], "June 2024")
        self.assertEqual(normalized["projects"][0]["tech"], ["Python"])
        self.assertEqual(normalized["contact"]["links"], [{"label": "Portfolio", "url": "https://example.com"}])
        self.assertEqual(normalized["education"][0]["year"], "2025")
