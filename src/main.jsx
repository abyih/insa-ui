import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DataPipelineProvider } from './pipeline/DataPipelineContext.jsx'

createRoot(document.getElementById('root')).render(
  <DataPipelineProvider>
    <App />
  </DataPipelineProvider>,
)
