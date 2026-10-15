import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ComputerPreviewWindow } from './components/chat/ComputerPreviewWindow'
import { AppErrorBoundary } from './components/app-shell/AppErrorBoundary'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Computer preview root is missing')
createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <ComputerPreviewWindow />
    </AppErrorBoundary>
  </StrictMode>,
)
