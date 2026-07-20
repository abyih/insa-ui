import React, { useEffect, useState, useCallback, useMemo } from 'react';
import NetworkTopologySvc from './TopologyService';

const TopologyController = () => {
  const [topologyData, setTopologyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Memoize the fetch function to prevent unnecessary re-creations
  const fetchTopologyData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Optional: Add a delay to show loading state (remove in production)
      // await new Promise(resolve => setTimeout(resolve, 300));
      
      const data = await NetworkTopologySvc.getNode("flow:1");
      
      // Validate data structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid topology data received');
      }
      
      setTopologyData(data);
      
      // Optional: Cache in sessionStorage for better UX
      try {
        sessionStorage.setItem('topology_cache', JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (storageError) {
        console.warn('Unable to cache topology data:', storageError);
      }
      
    } catch (err) {
      console.error("Error fetching topology data:", err);
      setError(err.message || 'Failed to load topology data');
      
      // Try to load from cache if available
      try {
        const cached = sessionStorage.getItem('topology_cache');
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          // Use cache if less than 5 minutes old
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setTopologyData(data);
            setError('Using cached data (offline)');
          }
        }
      } catch (cacheError) {
        console.warn('Cache read failed:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchTopologyData();
    
    // Optional: Set up refresh interval (e.g., every 30 seconds)
    const refreshInterval = setInterval(() => {
      // Only refresh if tab is visible (performance optimization)
      if (!document.hidden) {
        fetchTopologyData();
      }
    }, 30000);
    
    // Cleanup interval on unmount
    return () => clearInterval(refreshInterval);
  }, [fetchTopologyData]);
  
  // Memoize expensive rendering logic
  const renderContent = useMemo(() => {
    if (loading) {
      return (
        <div className="topology-loading" role="status" aria-live="polite">
          <div className="loading-spinner">
            Loading topology...
          </div>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="topology-error" role="alert">
          <div>
            <h3>Error Loading Topology</h3>
            <p>{error}</p>
            <button 
              onClick={fetchTopologyData}
              className="retry-button"
              aria-label="Retry loading topology"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    
    if (!topologyData) {
      return (
        <div className="topology-error">
          <p>No topology data available</p>
        </div>
      );
    }
    
    return (
      <div className="topology-content" role="region" aria-label="Network Topology">
        <h1>Topology</h1>
        <div className="topology-visualization">
          {/* Consider using a virtualized JSON viewer for large datasets */}
          <div className="data-preview">
            <details>
              <summary>View Raw Data (Click to expand)</summary>
              <pre 
                style={{
                  maxHeight: '400px',
                  overflow: 'auto',
                  fontSize: '12px',
                  padding: '10px',
                  background: '#f5f5f5',
                  borderRadius: '4px'
                }}
              >
                {JSON.stringify(topologyData, null, 2)}
              </pre>
            </details>
          </div>
          
          {/* Add visualization components here if needed */}
          <div className="topology-metrics">
            <h3>Data Metrics</h3>
            <p>Nodes: {Object.keys(topologyData).length}</p>
            <p>Data size: {(JSON.stringify(topologyData).length / 1024).toFixed(2)} KB</p>
          </div>
        </div>
      </div>
    );
  }, [loading, error, topologyData, fetchTopologyData]);
  
  return (
    <div className="topology-container">
      {renderContent}
    </div>
  );
};

// Optional: Add React.memo for performance if props are stable
export default React.memo(TopologyController);

