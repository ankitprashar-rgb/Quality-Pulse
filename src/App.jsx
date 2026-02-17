import { useState, useEffect } from 'react';
import './App.css';
import MetricsCards from './components/MetricsCards';
import TodayOverview from './components/TodayOverview';
import PendingProduction from './components/PendingProduction';
import ProductionEntry from './components/ProductionEntry';
import ClientExplorer from './components/ClientExplorer';
import Loader from './components/Loader';
import Toast from './components/Toast';
import { calculateMetrics, migrateHistoricalData } from './services/supabase';
import { fetchClients, fetchMediaOptions } from './services/googleSheets';

function App() {
  const [metrics, setMetrics] = useState(null);
  const [clients, setClients] = useState([]);
  const [mediaOptions, setMediaOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '' });

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      // Load essential dashboard data first
      const [metricsData, clientsData, mediaData] = await Promise.all([
        calculateMetrics('today'),
        fetchClients(),
        fetchMediaOptions()
      ]);

      setMetrics(metricsData);
      setClients(clientsData);
      setMediaOptions(mediaData);

      // Trigger migration in background if needed (one-time)
      const migrated = localStorage.getItem('quality_pulse_v1_migrated');
      if (!migrated) {
        console.log('Detected unmigrated data. Starting background recalculation...');
        migrateHistoricalData().then(success => {
          if (success) {
            localStorage.setItem('quality_pulse_v1_migrated', 'true');
            console.log('Dynamic record migration complete.');
          }
        }).catch(err => {
          console.error('Background migration failed:', err);
        });
      }

    } catch (error) {
      console.error('Error loading initial data:', error);
      showToast('Error connecting to backend services.');
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, duration = 3000) {
    setToast({ visible: true, message });
    setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, duration);
  }

  const [selectedProject, setSelectedProject] = useState(null);

  function handleSelectProject(proj) {
    setSelectedProject(proj);
    // Scroll to Production Entry after a short delay to ensure UI updates
    setTimeout(() => {
      document.getElementById('production-entry-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  function handleEntrySaved() {
    // Reload today's metrics
    calculateMetrics('today').then(setMetrics).catch(console.error);
    showToast('Entry saved successfully!');
    setSelectedProject(null); // Clear selection after saving
  }

  return (
    <div className="page">
      <header>
        <div>
          <h1>Quality Pulse</h1>
          <div className="subtitle">
            Live rejection visibility so the team can drive towards zero defects.
          </div>
        </div>
        <img
          src="https://res.cloudinary.com/du5vwtwvr/image/upload/v1762093742/IDE_Black_igvryv.png"
          alt="IDE logo"
          className="brand-logo"
        />
      </header>

      <MetricsCards metrics={metrics || {
        overallRate: 0,
        targetRate: 3.0,
        autoRate: 0,
        commRate: 0,
        subumiRate: 0,
        designRate: 0,
        printingRate: 0,
        laminationRate: 0,
        cutRate: 0,
        packagingRate: 0,
        mediaRate: 0
      }} />

      <TodayOverview />

      <PendingProduction onSelectProject={handleSelectProject} />

      <div id="production-entry-form">
        <ProductionEntry
          clients={clients}
          mediaOptions={mediaOptions}
          onSaved={handleEntrySaved}
          showToast={showToast}
          prefillData={selectedProject}
        />
      </div>

      <ClientExplorer clients={clients} />

      <Loader visible={loading} />
      <Toast visible={toast.visible} message={toast.message} />
    </div>
  );
}

export default App;
