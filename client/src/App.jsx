import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Meeting from './pages/Meeting'
import Analysis from './pages/Analysis'
import Teams from './pages/Teams'
import PublicRecording from './pages/PublicRecording'
import OAuthCallback from './pages/OAuthCallback'
import useAuthStore from './store/authStore'

const queryClient = new QueryClient()

const ProtectedRoute = ({ children }) => {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login"  element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* OAuth2 callback */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/meeting/:id" element={<ProtectedRoute><Meeting /></ProtectedRoute>} />
          <Route path="/analysis"  element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
          <Route path="/teams"     element={<ProtectedRoute><Teams /></ProtectedRoute>} />

          {/* Public Sharing Routes */}
          <Route path="/share/recording/:id" element={<PublicRecording />} />

          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}