import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { forceLegacy, getDataMode } from './lib/dataMode.js';
import './styles.css';
import './pages.css';
import './mobile.css';

/** Se la pagina va in errore con il percorso nuovo dei dati, riparte sul percorso collaudato. */
class SafeData extends Component {
  state = { attempt: 0 };

  static getDerivedStateFromError() {
    return null;
  }

  componentDidCatch(error) {
    if (getDataMode() === 'new') {
      forceLegacy(error?.stack || String(error));
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
