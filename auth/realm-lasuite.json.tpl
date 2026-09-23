{
  "realm": "{{KEYCLOAK_REALM}}",
  "enabled": true,
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "rememberMe": true,
  "requiredCredentials": ["password"],
  "roles": {
    "realm": [
      {
        "name": "user",
        "description": "Default local demo user role"
      }
    ]
  },
  "users": [
    {
      "username": "{{DEMO_USER_1_USERNAME}}",
      "email": "{{DEMO_USER_1_EMAIL}}",
      "firstName": "{{DEMO_USER_1_FIRST_NAME}}",
      "lastName": "{{DEMO_USER_1_LAST_NAME}}",
      "enabled": true,
      "emailVerified": true,
      "credentials": [
        {
          "type": "password",
          "value": "{{DEMO_USER_1_PASSWORD}}",
          "temporary": false
        }
      ],
      "realmRoles": ["user"]
    },
    {
      "username": "{{DEMO_USER_2_USERNAME}}",
      "email": "{{DEMO_USER_2_EMAIL}}",
      "firstName": "{{DEMO_USER_2_FIRST_NAME}}",
      "lastName": "{{DEMO_USER_2_LAST_NAME}}",
      "enabled": true,
      "emailVerified": true,
      "credentials": [
        {
          "type": "password",
          "value": "{{DEMO_USER_2_PASSWORD}}",
          "temporary": false
        }
      ],
      "realmRoles": ["user"]
    }
  ],
  "clients": [
    {
      "clientId": "{{DOCS_OIDC_CLIENT_ID}}",
      "name": "La Suite Docs local demo",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "secret": "{{DOCS_OIDC_CLIENT_SECRET}}",
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": true,
      "redirectUris": [
        "{{DOCS_FRONTEND_URL}}/*",
        "https://localhost:{{DOCS_FRONTEND_PORT}}/*",
        "{{DOCS_BACKEND_URL}}/*"
      ],
      "webOrigins": [
        "{{DOCS_FRONTEND_URL}}",
        "https://localhost:{{DOCS_FRONTEND_PORT}}",
        "{{DOCS_BACKEND_URL}}"
      ]
    },
    {
      "clientId": "{{OIDC_CLIENT_ID}}",
      "name": "Interop local demo app",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "secret": "{{OIDC_CLIENT_SECRET}}",
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": true,
      "redirectUris": [
        "{{APP_ORIGIN}}/*"
      ],
      "webOrigins": [
        "{{APP_ORIGIN}}"
      ],
      "attributes": {
        "post.logout.redirect.uris": "{{APP_ORIGIN}}/*"
      }
    }
  ]
}
