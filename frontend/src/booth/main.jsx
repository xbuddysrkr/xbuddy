import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import BoothApp from './BoothApp'

createRoot(document.getElementById('booth-root')).render(
  <StrictMode>
    <BoothApp />
  </StrictMode>
)
