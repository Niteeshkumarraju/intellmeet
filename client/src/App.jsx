import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
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
  const location = useLocation()
  return token ? children : <Navigate to="/login" replace state={{ from: location }} />
}

const PublicRoute = ({ children }) => {
  const { token } = useAuthStore()
  return !token ? children : <Navigate to="/dashboard" replace />
}

const HistoryRescuer = () => {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const isSubpage = 
      location.pathname !== '/' &&
      location.pathname !== '/login' &&
      location.pathname !== '/signup' &&
      location.pathname !== '/dashboard' &&
      !location.pathname.startsWith('/oauth');

    const isInitialLoad = !sessionStorage.getItem('session_initialized');
    sessionStorage.setItem('session_initialized', 'true');

    if (isSubpage && isInitialLoad) {
      const originalPath = location.pathname + location.search + location.hash;
      window.history.replaceState(null, '', '/dashboard');
      window.history.pushState(null, '', originalPath);
      navigate(originalPath, { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HistoryRescuer />
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login"  element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />

          {/* OAuth2 callback */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/meeting/:id" element={<ProtectedRoute><Meeting /></ProtectedRoute>} />
          <Route path="/analysis"  element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
          <Route path="/teams"     element={<ProtectedRoute><Teams /></ProtectedRoute>} />

          {/* Public Sharing Routes */}
          <Route path="/share/recording/:id" element={<PublicRecording />} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}