import React from 'react';
import { createRoot } from 'react-dom/client';
import CalendarBoard from './app.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CalendarBoard />
  </React.StrictMode>,
);
