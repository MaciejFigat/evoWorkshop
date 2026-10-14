import { connect } from '@evo/game-sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createConnection } from './net';
import './styles.css';

const root = document.getElementById('root');

if (root) {
  connect((session) => {
    const net = createConnection(session.emit);
    createRoot(root).render(
      <StrictMode>
        <App net={net} />
      </StrictMode>,
    );
  });
}
