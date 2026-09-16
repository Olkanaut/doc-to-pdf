"""Tests for the Resource Server API for Typst templates."""

from django.test import override_settings

import pytest
from rest_framework.test import APIClient

from core import factories, models
from core.tests.utils.urls import reload_urls

pytestmark = pytest.mark.django_db

BASE_URL = "/external_api/v1.0/typst-templates/"

# pylint: disable=unused-argument


def authenticated_client(user_token):
    """Create an API client authenticated with a resource server bearer token."""
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {user_token}")
    return client


@override_settings(OIDC_RESOURCE_SERVER_ENABLED=False)
def test_external_api_typst_templates_connected_not_resource_server():
    """
    Connected users SHOULD NOT be allowed to list Typst templates if resource server
    is not enabled.
    """
    reload_urls()
    user = factories.UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.get(BASE_URL)

    assert response.status_code == 404


@override_settings(
    EXTERNAL_API={
        "typst_templates": {
            "enabled": True,
            "actions": [],
        },
    }
)
def test_external_api_typst_templates_list_not_allowed(
    user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD NOT list templates when the action is disabled."""
    client = authenticated_client(user_token)

    response = client.get(BASE_URL)

    assert response.status_code == 403


def test_external_api_typst_templates_list_only_returns_current_user_templates(
    user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD only list their own Typst templates."""
    first = factories.TypstTemplateFactory(creator=user_specific_sub, name="First")
    second = factories.TypstTemplateFactory(creator=user_specific_sub, name="Second")
    factories.TypstTemplateFactory(name="Another user's template")
    first.save()
    client = authenticated_client(user_token)

    response = client.get(BASE_URL)

    assert response.status_code == 200
    content = response.json()
    assert content["count"] == 2
    assert [item["id"] for item in content["results"]] == [
        str(first.id),
        str(second.id),
    ]
    assert "source" not in content["results"][0]


def test_external_api_typst_templates_create_assigns_authenticated_user(
    user_token, resource_server_backend, user_specific_sub
):
    """Creating a Typst template through the resource server assigns token ownership."""
    client = authenticated_client(user_token)
    other_user = factories.UserFactory()

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
    assert template.creator == user_specific_sub
    assert template.name == "Invoice"
    assert template.description == "Standard invoice"
    assert template.source == "#set page(width: 210mm)\nHello"
    assert response.json()["creator"] == str(user_specific_sub.id)


def test_external_api_typst_templates_retrieve_own_template(
    user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD retrieve their own Typst template with source."""
    template = factories.TypstTemplateFactory(creator=user_specific_sub)
    client = authenticated_client(user_token)

    response = client.get(f"{BASE_URL}{template.id!s}/")

    assert response.status_code == 200
    assert response.json()["id"] == str(template.id)
    assert response.json()["source"] == template.source


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_external_api_typst_templates_cannot_access_another_user_template(
    method, user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD NOT access another user's Typst template."""
    template = factories.TypstTemplateFactory()
    client = authenticated_client(user_token)
    payload = {"name": "Changed", "source": "Changed"}

    response = getattr(client, method)(
        f"{BASE_URL}{template.id!s}/",
        payload,
        format="json",
    )

    assert response.status_code == 404
    assert models.TypstTemplate.objects.filter(id=template.id).exists()


def test_external_api_typst_templates_partial_update_own_template(
    user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD patch their own Typst template."""
    template = factories.TypstTemplateFactory(creator=user_specific_sub)
    client = authenticated_client(user_token)

    response = client.patch(
        f"{BASE_URL}{template.id!s}/",
        {
            "name": "Updated",
            "source": '#text("Updated")',
        },
        format="json",
    )

    assert response.status_code == 200
    template.refresh_from_db()
    assert template.name == "Updated"
    assert template.source == '#text("Updated")'


def test_external_api_typst_templates_update_not_allowed(
    user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD NOT replace templates because only PATCH is exposed."""
    template = factories.TypstTemplateFactory(creator=user_specific_sub)
    client = authenticated_client(user_token)

    response = client.put(
        f"{BASE_URL}{template.id!s}/",
        {
            "name": "Updated",
            "source": '#text("Updated")',
        },
        format="json",
    )

    assert response.status_code == 403


def test_external_api_typst_templates_delete_own_template(
    user_token, resource_server_backend, user_specific_sub
):
    """Connected users SHOULD delete their own Typst template."""
    template = factories.TypstTemplateFactory(creator=user_specific_sub)
    client = authenticated_client(user_token)

    response = client.delete(f"{BASE_URL}{template.id!s}/")

    assert response.status_code == 204
    assert not models.TypstTemplate.objects.exists()
