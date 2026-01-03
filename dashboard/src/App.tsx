import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Toast from './components/ui/Toast';
import Overview from './pages/Overview';
import MultiChainOverview from './pages/MultiChainOverview';
import Prices from './pages/Prices';
import Wallets from './pages/Wallets';
import Competitors from './pages/Competitors';
import Opportunities from './pages/Opportunities';
import Strategy from './pages/Strategy';
import AIInsights from './pages/AIInsights';
import History from './pages/History';
import Contracts from './pages/Contracts';

function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/multi-chain" element={<MultiChainOverview />} />
          <Route path="/prices" element={<Prices />} />
          <Route path="/wallets" element={<Wallets />} />
          <Route path="/competitors" element={<Competitors />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/strategy" element={<Strategy />} />
          <Route path="/ai-insights" element={<AIInsights />} />
          <Route path="/history" element={<History />} />
          <Route path="/contracts" element={<Contracts />} />
        </Routes>
      </Layout>
      <Toast />
    </>
  );
}

export default App;
