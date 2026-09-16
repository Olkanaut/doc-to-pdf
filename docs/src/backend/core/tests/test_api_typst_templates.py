"""Tests for the Typst templates API."""

import pytest
from rest_framework.test import APIClient

from core import factories, models

pytestmark = pytest.mark.django_db

BASE_URL = "/api/v1.0/typst-templates/"


def test_api_typst_templates_anonymous_access_is_denied():
    """Anonymous users cannot access Typst templates."""
    template = factories.TypstTemplateFactory()
    client = APIClient()

    assert client.get(BASE_URL).status_code == 401
    assert client.get(f"{BASE_URL}{template.id!s}/").status_code == 401
    assert client.post(BASE_URL, {}, format="json").status_code == 401


def test_api_typst_templates_create_assigns_authenticated_user():
    """Creating a template assigns the authenticated user as its owner."""
    user = factories.UserFactory()
    other_user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        BASE_URL,
        {
            "name": "Invoice",
            "description": "Standard invoice",
            "source": "#set page(width: 210mm)\nHello",
            "creator": str(other_user.id),
        },
        format="json",
    )

    assert response.status_code == 201
    template = models.TypstTemplate.objects.get()
    assert template.creator == user
    assert template.name == "Invoice"
    assert template.description == "Standard invoice"
    assert template.source == "#set page(width: 210mm)\nHello"
    assert response.json()["creator"] == str(user.id)


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"name": "", "source": "Hello"}, "name"),
        ({"name": "Invoice", "source": "   \n"}, "source"),
    ],
)
def test_api_typst_templates_create_rejects_blank_required_fields(payload, field):
    """Template names and Typst sources cannot be blank."""
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(BASE_URL, payload, format="json")

    assert response.status_code == 400
    assert field in response.json()
    assert not models.TypstTemplate.objects.exists()


@pytest.mark.parametrize(
    ("source", "expected_status"),
    [
        ("éé", 201),
        ("ééa", 400),
    ],
)
def test_api_typst_templates_create_enforces_source_size_in_bytes(
    settings, source, expected_status
):
    """The dedicated source limit is enforced using its UTF-8 byte size."""
    settings.TYPST_TEMPLATE_SOURCE_MAX_SIZE = 4
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.post(
        BASE_URL,
        {"name": "Invoice", "source": source},
        format="json",
    )

    assert response.status_code == expected_status
    if expected_status == 400:
        assert response.json() == {
            "source": ["Typst source exceeds the maximum size of 4 bytes."]
        }


def test_api_typst_templates_list_only_returns_current_user_templates():
    """A user only lists their own templates, most recently updated first."""
    user = factories.UserFactory()
    first = factories.TypstTemplateFactory(creator=user, name="First")
    second = factories.TypstTemplateFactory(creator=user, name="Second")
    factories.TypstTemplateFactory(name="Another user's template")
    first.save()

    client = APIClient()
    client.force_login(user)
    response = client.get(BASE_URL)

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 2
    assert [item["id"] for item in content["results"]] == [
        str(first.id),
        str(second.id),
    ]


def test_api_typst_templates_retrieve_own_template():
    """A user can retrieve one of their templates by ID."""
    template = factories.TypstTemplateFactory()
    client = APIClient()
    client.force_login(template.creator)

    response = client.get(f"{BASE_URL}{template.id!s}/")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(template.id),
        "name": template.name,
        "description": template.description,
        "source": template.source,
        "creator": str(template.creator_id),
        "created_at": template.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": template.updated_at.isoformat().replace("+00:00", "Z"),
    }


@pytest.mark.parametrize("method", ["get", "put", "patch", "delete"])
def test_api_typst_templates_cannot_access_another_user_template(method):
    """Another user's template is hidden for all detail operations."""
    user = factories.UserFactory()
    template = factories.TypstTemplateFactory()
    client = APIClient()
    client.force_login(user)
    payload = {"name": "Changed", "source": "Changed"}

    response = getattr(client, method)(
        f"{BASE_URL}{template.id!s}/", payload, format="json"
    )

    assert response.status_code == 404
    assert models.TypstTemplate.objects.filter(id=template.id).exists()


def test_api_typst_templates_update_own_template():
    """A user can update their own template without changing its owner."""
    template = factories.TypstTemplateFactory()
    other_user = factories.UserFactory()
    client = APIClient()
    client.force_login(template.creator)

    response = client.patch(
        f"{BASE_URL}{template.id!s}/",
        {
            "name": "Updated",
            "source": '#text("Updated")',
            "creator": str(other_user.id),
        },
        format="json",
    )

    assert response.status_code == 200
    template.refresh_from_db()
    assert template.name == "Updated"
    assert template.source == '#text("Updated")'
    assert template.creator != other_user


def test_api_typst_templates_delete_own_template():
    """A user can delete their own template."""
    template = factories.TypstTemplateFactory()
    client = APIClient()
    client.force_login(template.creator)

    response = client.delete(f"{BASE_URL}{template.id!s}/")

    assert response.status_code == 204
    assert not models.TypstTemplate.objects.exists()
