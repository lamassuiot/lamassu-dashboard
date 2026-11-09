import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
// Dev only: in the dashboard these CSS variables come from the shell.
import '@lamassu/mfe-sdk/tokens.css';
import definition from '../module';
import manifest from '../../module.json';
import { createMockShell } from './mock-shell';

const { Root } = definition;
const shell = createMockShell(manifest.basePath);

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path={`${manifest.basePath}/*`} element={<Root shell={shell} />} />
      <Route path="*" element={<Navigate to={manifest.basePath} replace />} />
    </Routes>
  </BrowserRouter>,
);
