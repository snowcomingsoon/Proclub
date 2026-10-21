import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { escalate, safetyLevel } from './lib/dataMode.js';
import './styles.css';
import './pages.css';
import './mobile.css';

/** Se la pagina va in errore, riparte con più prudenza: prima senza il percorso nuovo dei dati, poi anche senza lo stato di salute. */
class SafeData extends Component {
  state = { attempt: 0 };

  static getDerivedStateFromError() {
    return null;
  }

  componentDidCatch(error) {
    if (safetyLevel() < 2) {
      escalate(error?.stack || String(error));
      this.setState(({ attempt }) => ({ attempt: attempt + 1 }));
    } else {
      throw error;
    }
  }

  render() {
    return <App key={this.state.attempt} />;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SafeData />
  </StrictMode>,
);
