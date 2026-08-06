import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import { UpdatePrompt } from './components/UpdatePrompt'
// Chrome offers the "install this app" event once, early, and never
// again — often before React has mounted. Importing here means it is
// caught whatever the person happens to be looking at.
import './lib/install'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <UpdatePrompt />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
