import './index.css'
import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'

import { createRoot } from 'react-dom/client'

import App from './app/App'
import { initWeftPerfHarness } from './app/runtime/perfHarness'

initWeftPerfHarness()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
