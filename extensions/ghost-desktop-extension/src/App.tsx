import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import RepoSelect from '@/pages/RepoSelect'
import ConsolePage from '@/pages/ConsolePage'
import SettingsPage from '@/pages/SettingsPage'
import ExtensionPlaygroundPage from '@/pages/ExtensionPlaygroundPage'
import { Toasts } from '@/components/Toasts'

export default function App() {
  return (
    <Router>
      <Toasts />
      <Routes>
        <Route path="/" element={<RepoSelect />} />
        <Route path="/console" element={<ConsolePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/playground" element={<ExtensionPlaygroundPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
