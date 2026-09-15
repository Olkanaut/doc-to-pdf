# Typst Templates External API

> This is the target contract. These external routes are not implemented yet.

```js
const baseUrl = "http://localhost:8071/external_api/v1.0/typst-templates";
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};
```

Users can only access their own templates. `source` is limited to 1 MiB.

## GET `/`

Fetch:

```js
const response = await fetch(`${baseUrl}/`, { headers });
const body = await response.json();
```

Body: none.

Response: `200 OK`

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "cfa3f6aa-f024-47b3-94bf-407c850debf1",
      "name": "Standard invoice",
      "description": "A4 invoice template",
      "creator": "5042c3bc-f814-4312-8a68-f909f2db6309",
      "created_at": "2026-09-15T14:30:00Z",
      "updated_at": "2026-09-15T14:45:00Z"
    }
  ]
}
```

## POST `/`

Body:

```json
{
  "name": "Standard invoice",
  "description": "A4 invoice template",
  "source": "#set page(paper: \"a4\")\n\n= Invoice\n"
}
```

Fetch:

```js
const template = {
  name: "Standard invoice",
  description: "A4 invoice template",
  source: '#set page(paper: "a4")\n\n= Invoice\n',
};

const response = await fetch(`${baseUrl}/`, {
  method: "POST",
  headers,
  body: JSON.stringify(template),
});
const body = await response.json();
```

Response: `201 Created`

```json
{
  "id": "cfa3f6aa-f024-47b3-94bf-407c850debf1",
  "name": "Standard invoice",
  "description": "A4 invoice template",
  "source": "#set page(paper: \"a4\")\n\n= Invoice\n",
  "creator": "5042c3bc-f814-4312-8a68-f909f2db6309",
  "created_at": "2026-09-15T14:30:00Z",
  "updated_at": "2026-09-15T14:30:00Z"
}
```

`name` and `source` are required. `creator` comes from the access token.

## GET `/{id}/`

```js
const response = await fetch(`${baseUrl}/${templateId}/`, { headers });
const body = await response.json();
```

Body: none. Response: `200 OK` with the complete template, including `source`.

## PATCH `/{id}/`

Body:

```json
{
  "name": "Standard invoice 2026"
}
```

Fetch:

```js
const response = await fetch(`${baseUrl}/${templateId}/`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ name: "Standard invoice 2026" }),
});
const body = await response.json();
```

Response: `200 OK` with the updated template.

## DELETE `/{id}/`

```js
const response = await fetch(`${baseUrl}/${templateId}/`, {
  method: "DELETE",
  headers,
});
```

Body: none. Response: `204 No Content`.

## Errors

```text
400  Invalid body or source larger than 1 MiB
401  Missing or invalid access token
403  Client is not allowed
404  Template not found or owned by another user
```
