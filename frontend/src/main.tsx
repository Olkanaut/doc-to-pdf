import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CunninghamProvider, frFR } from '@gouvfr-lasuite/ui-components'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'

// Thème « default » et locale fr-FR, comme la Docs locale (core/config/ThemeProvider.tsx).
// Pas de QueryClientProvider : dans le kit, seul PdfPreview dépend de react-query, et il
// n'est pas utilisé ici.
//
// Le Header du kit nomme son bouton de menu mobile t("Open the menu") / t("Close the menu")
// (dist/components/layout/header/Header.js l.19) : ces clés n'existent dans aucune locale
// du kit, le libellé anglais serait annoncé tel quel. `customLocales` remplace la locale
// entière (Provider.js : { "fr-FR": T, ...customLocales }) : on repart du fr-FR du kit
// et on ajoute les deux clés.
const customLocales = {
  'fr-FR': { ...frFR, 'Open the menu': 'Ouvrir le menu', 'Close the menu': 'Fermer le menu' },
}

// Pas de <StrictMode> : le Modal du kit repose sur react-modal 3.16.3, dont le double
// montage simulé par StrictMode (dev) laisse `aria-hidden="true"` sur .c__app et
// `c__modals--opened` sur <body> après la fermeture d'une modale — toute la page devient
// invisible pour les technologies d'assistance. Docs (Pages Router, sans reactStrictMode)
// utilise le kit dans les mêmes conditions. Décision à confirmer (voir docs/sessions).
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <CunninghamProvider theme="default" currentLocale="fr-FR" customLocales={customLocales}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </CunninghamProvider>
  </BrowserRouter>,
)
