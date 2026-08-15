"""Persona-owned import helpers for profile source documents."""
from __future__ import annotations

import base64
import json
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

from pypdf import PdfReader


MAX_PDF_BYTES = 20 * 1024 * 1024


class PdfImportError(ValueError):
    """Raised when a PDF cannot safely provide selectable text."""


def pdf_filename(name: str) -> str:
    """Return a safe PDF filename without accepting path components."""
    filename = Path(name or "").name
    if not filename or filename in {".", ".."} or Path(filename).suffix.lower() != ".pdf":
        raise PdfImportError("Choose a PDF file")
    return filename


def decode_pdf_data(data_url: str) -> bytes:
    """Decode the browser's base64 PDF payload and reject non-PDF input."""
    prefix, separator, payload = (data_url or "").partition(",")
    if not separator or ";base64" not in prefix.lower():
        raise PdfImportError("The PDF upload data was invalid")
    try:
        data = base64.b64decode(payload, validate=True)
    except ValueError as error:
        raise PdfImportError("The PDF upload data was invalid") from error
    if not data.startswith(b"%PDF-"):
        raise PdfImportError("The selected file is not a PDF")
    if len(data) > MAX_PDF_BYTES:
        raise PdfImportError("PDF files must be 20 MB or smaller")
    return data


def extract_pdf_text(data: bytes) -> tuple[str, int]:
    """Extract selectable PDF text without rewriting its line-level content."""
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise PdfImportError("Password-protected PDFs are not supported yet")
        pages = [
            (page.extract_text() or "").replace("\r\n", "\n").replace("\r", "\n").rstrip()
            for page in reader.pages
        ]
    except PdfImportError:
        raise
    except Exception as error:
        raise PdfImportError("Persona could not read this PDF") from error

    text = "\n\n".join(page for page in pages if page.strip()).strip()
    if not text:
        raise PdfImportError(
            "No selectable text was found. Scanned PDFs need OCR, which is not supported yet."
        )
    return text, len(pages)


def _link_metadata(url: str, page: int, order: int) -> dict[str, object]:
    """Classify common resume link annotations without changing their URL."""
    host = (urlparse(url).hostname or "").lower()
    if "github.com" in host:
        return {"label": "GitHub", "kind": "contact", "url": url, "page": page, "order": order}
    if "linkedin.com" in host:
        return {"label": "LinkedIn", "kind": "contact", "url": url, "page": page, "order": order}
    if "scholar.google" in host:
        return {"label": "Google Scholar", "kind": "contact", "url": url, "page": page, "order": order}
    if any(value in host for value in ("ieeexplore.ieee.org", "doi.org", "arxiv.org")):
        return {"label": "Publication", "kind": "publication", "url": url, "page": page, "order": order}
    return {"label": "Link", "kind": "other", "url": url, "page": page, "order": order}


def extract_pdf_links(data: bytes) -> list[dict[str, object]]:
    """Read HTTP(S) link annotations that are invisible to text extraction."""
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            return []
        links: list[dict[str, object]] = []
        seen: set[str] = set()
        for page_number, page in enumerate(reader.pages, start=1):
            for annotation in page.get("/Annots") or []:
                annotation = annotation.get_object() if hasattr(annotation, "get_object") else annotation
                if annotation.get("/Subtype") != "/Link":
                    continue
                action = annotation.get("/A") or {}
                action = action.get_object() if hasattr(action, "get_object") else action
                url = str(action.get("/URI") or "").strip()
                if not url or url in seen or urlparse(url).scheme not in {"http", "https"}:
                    continue
                seen.add(url)
                links.append(_link_metadata(url, page_number, len(links)))
        return links
    except Exception:
        # Link metadata is an enhancement; selectable text remains importable.
        return []


def import_pdf(workspace: Path, name: str, data_url: str) -> dict:
    """Store the original PDF and a private text sidecar for profile extraction."""
    filename = pdf_filename(name)
    data = decode_pdf_data(data_url)
    text, pages = extract_pdf_text(data)
    links = extract_pdf_links(data)

    documents = Path(workspace) / "documents"
    documents.mkdir(parents=True, exist_ok=True)
    source = documents / filename
    source.write_bytes(data)
    source.with_suffix(".pdf.txt").write_text(text, encoding="utf-8")
    source.with_suffix(".pdf.links.json").write_text(
        json.dumps(links, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return {
        "name": filename,
        "path": f"documents/{filename}",
        "source": "pdf",
        "pages": pages,
        "characters": len(text),
        "links": links,
    }


def normalize_profile_import(payload: dict) -> dict:
    """Map known model aliases to Persona's profile schema without adding facts."""
    payload = payload if isinstance(payload, dict) else {}

    def text(value) -> str:
        return value if isinstance(value, str) else ""

    def text_list(value) -> list[str]:
        return [item for item in (value or []) if isinstance(item, str)]

    identity = payload.get("identity") or {}
    contact = payload.get("contact") or {}
    profile = {
        "identity": {key: text(identity.get(key)) for key in ("name", "headline", "summary", "location")},
        "contact": {
            "email": text(contact.get("email")),
            "phone": text(contact.get("phone")),
            "links": [],
        },
        "skill_buckets": [],
        "experience": [],
        "projects": [],
        "education": [],
        "certifications": [],
        "publications": [],
    }

    # The profile schema requires usable link objects. Label-only source text
    # (for example, "GitHub") is not a URL and is deliberately not promoted.
    for link in contact.get("links") or []:
        if isinstance(link, dict) and text(link.get("label")) and text(link.get("url")):
            profile["contact"]["links"].append({
                "label": text(link["label"]), "url": text(link["url"]),
            })

    for bucket in payload.get("skill_buckets") or []:
        if not isinstance(bucket, dict):
            continue
        category = text(bucket.get("category")) or text(bucket.get("name"))
        skills = text_list(bucket.get("skills"))
        if category and skills:
            profile["skill_buckets"].append({"category": category, "skills": skills})

    for item in payload.get("experience") or []:
        if not isinstance(item, dict):
            continue
        profile["experience"].append({
            "id": text(item.get("id")),
            "title": text(item.get("title")),
            "company": text(item.get("company")),
            "start": text(item.get("start")) or text(item.get("start_date")),
            "end": text(item.get("end")) or text(item.get("end_date")),
            "raw_description": text(item.get("raw_description")),
            "highlights": text_list(item.get("highlights")),
            "tags": text_list(item.get("tags")),
        })

    for item in payload.get("projects") or []:
        if not isinstance(item, dict):
            continue
        profile["projects"].append({
            "id": text(item.get("id")),
            "name": text(item.get("name")),
            "description": text(item.get("description")),
            "raw_description": text(item.get("raw_description")),
            "tech": text_list(item.get("tech")) or text_list(item.get("tech_stack")),
            "url": text(item.get("url")) or text(item.get("link")),
            "highlights": text_list(item.get("highlights")),
            "tags": text_list(item.get("tags")),
        })

    for item in payload.get("education") or []:
        if isinstance(item, dict):
            profile["education"].append({
                "degree": text(item.get("degree")),
                "institution": text(item.get("institution")),
                "year": text(item.get("year")) or text(item.get("end_date")),
            })
    for item in payload.get("certifications") or []:
        if isinstance(item, dict):
            profile["certifications"].append({
                "name": text(item.get("name")),
                "issuer": text(item.get("issuer")),
                "year": text(item.get("year")),
            })
    for item in payload.get("publications") or []:
        if isinstance(item, dict):
            profile["publications"].append({
                "title": text(item.get("title")),
                "venue": text(item.get("venue")),
                "year": text(item.get("year")),
                "url": text(item.get("url")),
            })
    return profile
