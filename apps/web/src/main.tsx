import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './components/auth/session-provider'
import { createAuthApi } from './lib/auth-api'
import { createApiClient } from './lib/api-client'
import { createSessionController } from './lib/session-controller'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'
const controller = createSessionController(createAuthApi(createApiClient(apiUrl)))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider controller={controller}><App /></SessionProvider>
  </StrictMode>,
)
