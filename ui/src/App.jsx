import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ProjectPage from './pages/ProjectPage'
import ProjectsListPage from './pages/ProjectsListPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/projects" element={<ProjectsListPage />} />
      <Route path="/projects/:id" element={<ProjectPage />} />
    </Routes>
  )
}
