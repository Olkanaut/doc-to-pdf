## Context

Dots is a POC that turns La Suite Docs documents into PDFs from Typst
templates. It relies on:

- a Vite/React frontend application;
- a Node/Fastify backend;
- a local Docs stack embedded in the repository for development;
- a local Keycloak;
- the Docs external API, in particular documents and Typst templates;
- Typst to compile the PDF.

The POC was built to move fast during a hackathon. It brings together in a
single workspace the application, a local copy of Docs, a Keycloak
configuration and orchestration scripts. This is not the target shape of a La
Suite service.

## Recommended target architecture

There are two serious options.

### Option A: feature built into Docs

This is the most natural option if templated PDF export is considered a native
Docs feature.

In this model:

- Typst templates are a real Docs domain;
- the export UI lives in Docs;
- permissions follow Docs permissions directly;
- PDF rendering is done by a worker or an internal service;
- generated PDFs can be stored in the Docs S3 or streamed back;
- there is no new application to authenticate or operate.

Advantages:

- smaller integration surface;
- less duplicated authentication;
- better product consistency;
- easier to get security-approved if Docs is already the host product.

Drawbacks:

- requires contributing directly to the Docs repository;
- the validation cycle depends on the Docs team;
- the Typst domain becomes a responsibility of the Docs product.

### Option B: separate Dots service, connected to Docs

This is the option to choose if Dots must remain a standalone product or serve
several document sources.

In this model:

- Dots is deployed as a dedicated La Suite service;
- Dots uses OIDC to authenticate the user;
- Dots calls Docs via the `resource server` API;
- Docs remains the source of truth for documents, media, users and
  permissions;
- Dots only owns its own domain: rendering, jobs, export preferences, possibly
  a template library;
- Typst runs in an isolated, resource-limited component.

Advantages:

- product autonomy;
- clearer responsibilities;
- ability to evolve PDF rendering independently of Docs.

Drawbacks:

- more deployment, secrets, monitoring and security surface;
- Docs API contracts to stabilize;
- more complex handling of permissions and media.

## What should not be kept as is

The current POC deliberately contains hackathon trade-offs. For a
production-grade version, the following should be removed or redone:

- the embedded copy of Docs and `django-lasuite` as local demo dependencies;
- the scripts that start Keycloak, Docs, PostgreSQL, Redis and MinIO for local
  development as if they were the target environment;
- the demo secrets in `.env.example`, even if they are acceptable locally;
- the silent fallbacks to `localhost` in the application code;
- in-memory server sessions;
- local storage of ingestion jobs;
- long synchronous calls for expensive PDF renders;
- any Typst rendering not isolated from the main backend process;
- any dependency on a local Docs fork that is not upstream or properly
  versioned;
- Typst fixtures used as quasi product data.

## Product workstreams to take over

The two areas that carry the most product value are extracting templates from
existing documents and editing templates. They are also the two areas where the
POC made the most visible trade-offs: it gives a convincing experience on
simple cases, but it does not yet model the real richness of administrative
documents.

### PDF/DOCX extractor

The current extractor is not a gimmick: it already contains real analysis
logic.

What exists in the POC:

- PDF and DOCX files are accepted via `/api/ingest`;
- the type is checked on the file bytes, not only on the extension;
- PDF analysis uses PyMuPDF to read text, shapes, images and visible areas;
- elements hidden by a later opaque shape are ignored, which avoids picking up
  hidden content;
- the script proposes regions: header, footer, full page;
- margins, page size, orientation, a dominant font, line spacing and a heading
  color are inferred;
- fragments can be extracted as PNG, or as SVG when the area is vector-based;
- DOCX is rendered by LibreOffice, then analyzed like a PDF;
- for DOCX, a three-page probe copy is generated to observe the banners without
  the document body;
- the POC distinguishes some `first page` / `all but first page` cases;
- simple Word page numbering can be removed from the frozen render and rebuilt
  as dynamic Typst page numbering;
- predictable errors are reported cleanly: unsupported format, LibreOffice
  missing, timeout, file too large.

What this proves:

- the user can start from a real document and quickly get a template base;
- visual headers and footers can be recovered without asking the user to redo
  the whole visual identity by hand;
- the PDF/DOCX -> analysis -> cropping -> asset -> Typst template flow works.

But the extractor remains very partial.

Current limitations:

- the PDF is analyzed on the first page only;
- the DOCX only reads the first Word section;
- even / odd page variants are detected as a limitation, but not faithfully
  rebuilt;
- DOCX banners are mostly recovered as rasterized images, not as an editable
  structure;
- styles are not rebuilt as a complete system: only a few global signals are
  inferred;
- style differences across pages are not modeled;
- page numbering only handles simple forms;
- the analysis does not yet understand document semantics: logos, addresses,
  issuer, department, reference, date, legal notices;
- there is no OCR for scanned PDFs;
- there is no multi-page comparison to detect constant and variable areas;
- tables, frames, columns, watermarks, stamps, signatures or page backgrounds
  are not turned into reusable components;
- AI import from PDF exists in the assistant, but it is separate from the
  structured extraction pipeline.

For a production-grade version, this workstream should be redone as a real
document analysis engine.

Target product goal:

- import an existing administrative PDF or DOCX;
- automatically detect the page structure;
- understand recurring styles;
- distinguish first page, following pages, even pages, odd pages and sections;
- recover the important visual elements;
- propose an editable template, not just a banner image;
- explain to the user what was recognized, what was not, and what must be
  validated manually.

Areas to take over:

- multi-page analysis: compare pages to isolate constant elements, page
  numbering variations and first-page-specific elements;
- in-depth DOCX analysis: sections, Word styles, headers/footers per variant,
  dynamic fields, anchored images, tables, margins, columns;
- advanced PDF analysis: repetition detection, text blocks, shapes, images,
  layers, backgrounds, orientation per page;
- optional OCR for scanned PDFs;
- AI-assisted semantic extraction: classify detected elements as logo,
  administration name, directorate, address, reference, date, page number,
  notices, signature;
- editable Typst reconstruction: turn whatever can be into text, blocks, styles
  and variables, and keep as images only what is truly graphical;
- variant handling: different first page, following pages, even/odd pages,
  multiple sections;
- UX feedback: show the assumptions, confidence scores, recognized areas,
  ignored areas and warnings;
- learning from corrections: when the user corrects an area or a style, reuse
  that correction to regenerate the template.

Specific definition of done:

- a multi-page document is no longer reduced to its first page;
- a DOCX with several sections is at least reported precisely, ideally rebuilt
  section by section;
- a different first page is handled without needlessly rasterizing the whole
  banner;
- simple, common Word page numbering is converted to Typst page numbering;
- textual visual-identity elements remain editable when they can be;
- the user clearly sees what is automatic and what remains to be validated.

### Template editor

The current editor is a good UX foundation, but its model is deliberately
constrained.

What exists in the POC:

- a unified editing page built around three areas: settings, PDF preview, AI
  assistant;
- synchronization between visual controls, Typst source and PDF render;
- a `Mise en page` (layout) mode for non-technical users;
- a `Code` mode to edit the Typst directly;
- a preview compiled on a dedicated fixture;
- page settings: size, orientation, margins;
- simple text styles: font, size, color, line spacing;
- table settings;
- a header and footer builder;
- stackable blocks in a single Typst `header:` or `footer:`;
- per-block scopes: all pages, first page, all but first page;
- predefined layouts: image + text, text + image, centered, custom;
- importing images or extracting a visual from PDF/DOCX;
- configurable page numbering in the footer;
- an AI assistant able to propose a source or a layout patch.

What this proves:

- a user can quickly produce an administrative template without writing Typst;
- the visual feedback loop is short enough to iterate;
- code mode makes it possible to occasionally go beyond the panel's limits.

But the editor is not yet a complete template editor.

Current limitations:

- the user chooses among a few block sub-templates;
- placement is essentially linear and stacked, not free-form;
- there is no canvas to position elements precisely on the page;
- blocks are limited in number and structure;
- page variants are reduced to three scopes;
- conditional styles by page, section or document type are not modeled;
- business variables are not explicit: issuer, department, reference, date,
  signatory, address, logo, seal;
- components are not reusable as a library of template pieces;
- code mode gives full control, but only to users able to write Typst;
- AI helps get past some limits, but it does not replace an understandable,
  stable product model.

For a production-grade version, a decision is needed on whether the editor
targets:

- a simple editor for standardized visual identities;
- or a real, complete administrative template editor.

If the goal is a simple editor, the current model can be hardened:

- keep predefined blocks;
- raise the quality of presets;
- add a library of official components;
- better handle first page / following pages variants;
- make styles more explicit;
- clearly document the limits.

If the goal is a complete editor, the level of abstraction has to change.

Target product goal for a complete editor:

- give full control over the page without forcing the user to write Typst;
- allow creating areas freely;
- handle page variants;
- manipulate business variables;
- reuse components;
- produce maintainable, readable and stable Typst.

Areas to take over:

- WYSIWYG or semi-WYSIWYG canvas: free placement, guides, alignment, grids,
  locking, layers;
- template components: logo, address block, issuer identity, reference, date,
  subject, signature, page number, notices, watermark;
- variable system: user fields, document fields, organization fields, default
  values;
- global styles: color tokens, typography, spacing, heading styles, table
  styles;
- variants: first page, following pages, even/odd pages, last page, specific
  section;
- sub-template library: official headers, footers, covers, title pages,
  appendices;
- hybrid editor: visual panel for the common cases, advanced mode for Typst,
  with explicit, non-magical synchronization;
- validation: warn when an element goes off the page, overlaps, becomes
  unreadable or breaks compilation;
- history and comparison: see what changes in the PDF and in the Typst;
- permissions: personal, shared, organizational and official templates.

Specific definition of done:

- a non-technical user can reproduce a real administrative visual identity
  without touching code;
- an advanced user can take over the Typst without losing compatibility with
  the visual editor;
- page variants are visible and testable;
- components are reusable across templates;
- the preview reports rendering errors, overflows and inconsistencies;
- the resulting templates remain maintainable after several iterations.
