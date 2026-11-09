import { Route, Routes } from 'react-router';
import { SDK_CONTRACT_VERSION, ShellProvider, type ModuleDefinition } from '@lamassu/mfe-sdk';
import './styles.css';
import { HomePage } from './routes/HomePage';
import { DetailPage } from './routes/DetailPage';

/**
 * What the shell loads (`./module` in vite.config.ts). The shell mounts `Root` under `basePath/*`
 * inside its own router, so routes here are relative and there is no BrowserRouter.
 */
const definition: ModuleDefinition = {
  contractVersion: SDK_CONTRACT_VERSION,
  Root: ({ shell }) => (
    <ShellProvider value={shell}>
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="detail" element={<DetailPage />} />
        <Route path="*" element={<p className="mfe:text-muted-foreground">Page not found.</p>} />
      </Routes>
    </ShellProvider>
  ),
};

export default definition;
