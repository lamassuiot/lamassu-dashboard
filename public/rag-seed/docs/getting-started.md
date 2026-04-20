# Local RAG Seed Corpus

This folder is the bundled starter corpus for the dashboard's SPA-only local RAG flow.

## What is included

- `getting-started.md`: this overview document and ingestion notes.
- `rfc5280.txt`: the baseline PKIX reference for certificates, CRLs, and path validation.
- `draft-ietf-lamps-pq-composite-sigs-v18.txt`: an active IETF draft for composite ML-DSA in X.509.
- `NIST.CSWP.pdf`: a PDF sample so the local pipeline can exercise PDF parsing too.

## Why this mix

The seed is intentionally small but varied:

- Markdown gives us a simple human-written document.
- Plain text RFC and draft files give us long-form standards content with strong section headings.
- A PDF gives us a realistic format that many teams will upload later.

That mix is useful for validating chunking, metadata, retrieval quality, and IndexedDB persistence before users add their own corpus.

## Expected client flow

1. Load `/rag-seed/index.json`.
2. Fetch each document listed in the manifest.
3. Parse content by type: `md`, `txt`, or `pdf`.
4. Split content into chunks with source metadata.
5. Build embeddings locally in the browser.
6. Store chunks and vectors in IndexedDB for later sessions.

## Suggested retrieval use cases

- Explain the role of `basicConstraints` and `keyUsage` in RFC 5280.
- Summarize the operational impact of composite ML-DSA adoption in X.509.
- Compare mature PKIX guidance with emerging post-quantum draft guidance.
- Verify that PDF ingestion works before enabling user-uploaded documents.

## Maintenance notes

- Keep `public/rag-seed/index.json` in sync with the real files in `public/rag-seed/docs/`.
- Prefer documents with stable headings so chunks retain good semantic context.
- Avoid adding too many large files at first; the goal is a fast first-run seed corpus.
