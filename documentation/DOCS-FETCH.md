# Fetch a Docs Document from Dots

Dots fetches documents through its backend. The Keycloak access token is never exposed to the frontend.

## Frontend to Dots

Fetch:

```js
const response = await fetch(`/api/documents/${documentId}/content`, {
  credentials: "include",
});
const document = await response.json();
```

Body: none.

Response: `200 OK`

```json
{
  "id": "a372f33f-25a1-4595-b6b6-d8de64c5ac00",
  "title": "Hello world",
  "blocks": [
    {
      "id": "f4c1d5d8-8548-4210-9490-260d08cf412c",
      "type": "paragraph",
      "props": {},
      "content": [
        {
          "type": "text",
          "text": "Document content",
          "styles": {}
        }
      ],
      "children": []
    }
  ],
  "createdAt": "2026-09-15T00:21:08.979814Z",
  "updatedAt": "2026-09-15T15:42:10.115420Z"
}
```

The browser sends the HttpOnly Dots session cookie. It does not send an access token.

## Dots to Docs

Fetch:

```js
const baseUrl = "http://localhost:8071/external_api/v1.0";

const response = await fetch(
  `${baseUrl}/documents/${documentId}/formatted-content/?content_format=json`,
  {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  },
);
const body = await response.json();
```

Body: none.

Response from Docs: `200 OK`

```json
{
  "id": "a372f33f-25a1-4595-b6b6-d8de64c5ac00",
  "title": "Hello world",
  "content": [],
  "created_at": "2026-09-15T00:21:08.979814Z",
  "updated_at": "2026-09-15T15:42:10.115420Z"
}
```

Docs identifies the user from the token and checks access to the document. Dots renames `content` to `blocks` before returning the response to the frontend.

## Render the Document with a Template

The frontend asks Dots to merge the Docs content with one of the user's templates:

```js
const response = await fetch(`/api/documents/${documentId}/render`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ templateId }),
});
const pdf = await response.blob();
```

Dots uses the access token stored in the server-side session for both upstream requests:

1. fetch the document's formatted content from Docs;
2. fetch the selected template source from `typst-templates`;
3. convert the document blocks to Typst and compile the resulting PDF.

The response is `application/pdf`. `X-Dots-Block-Count` contains the number of blocks and `X-Dots-Unsupported-Blocks` lists block types omitted from the PDF.

Documents containing images currently return `422`: remote Docs images are not downloaded by Dots yet.

## Configuration

```bash
DOCS_API_BASE_URL=http://localhost:8071/external_api/v1.0/
DOCS_API_TIMEOUT_MS=10000
DOCS_API_MAX_RESPONSE_BYTES=5242880
```

Docs must allow the `formatted_content` external API action and run the Y Provider converter.

## Errors

```text
400  Invalid document ID
401  Missing or expired Dots session
403  User cannot access the document
404  Document not found
502  Docs is unavailable or returned an invalid response
504  Docs request timed out
```
