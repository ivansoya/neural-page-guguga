import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NeuralConfigApp } from './components/NeuralConfigApp';
import './styles/theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NeuralConfigApp />
  </StrictMode>,
);
