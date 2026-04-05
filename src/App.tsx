import React, { useState, useEffect, useRef, useCallback, FormEvent } from 'react';

type ProductStatus = 'processing' | 'pending_approval' | 'published' | 'rejected';

interface Product {
  id: string;
  name: string;
  features: string;
  price: number;
  category: string;
  status: ProductStatus;
  ai_description: string | null;
  seo_keywords: string | null;
  created_at: string;
}

interface LogEntry {
  timestamp: string;
  product_id: string;
  product_name: string;
  category: string;
  variant_1: string;
  variant_2: string;
  variant_3: string;
  final_description: string;
  seo_keywords: string;
  tags: string;
  status: string;
}

type ViewType = 'add' | 'products' | 'logs';
type FilterType = 'all' | 'published' | 'pending_approval' | 'rejected';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbz17ybGSGEZNwb1IGKz0dfpZqhbUwiCNq7rjE04TjiUQPczl6wZeyk9kP0Vhzr-rcI7/exec";

const CATEGORIES = [
  "Electronics", "Fashion", "Home & Living", "Sports & Fitness",
  "Beauty & Health", "Books & Stationery", "Food & Beverages",
  "Toys & Kids", "Automotive", "Other"
];

export default function App() {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [view, setView] = useState<ViewType>('add');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    features: '',
    price: '',
    category: CATEGORIES[0]
  });
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Refs
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const toastIdCounter = useRef(0);

  const isLocalMode = SHEETS_API_URL === "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

  // Helpers
  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastIdCounter.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // API Functions
  const pingSheets = useCallback(async () => {
    if (isLocalMode) {
      setIsConnected(false);
      return;
    }
    try {
      const res = await fetch(`${SHEETS_API_URL}?action=ping`);
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  }, [isLocalMode]);

  const loadProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (isLocalMode) {
        const localData = localStorage.getItem('nx_products');
        setProducts(localData ? JSON.parse(localData) : []);
      } else {
        const res = await fetch(`${SHEETS_API_URL}?t=${Date.now()}`);
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      addToast('error', 'Failed to load products');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isLocalMode, addToast]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      if (isLocalMode) {
        setLogs([]);
      } else {
        const res = await fetch(`${SHEETS_API_URL}?action=getLogs&t=${Date.now()}`);
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      addToast('error', 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [isLocalMode, addToast]);

  const updateStatus = async (id: string, status: ProductStatus) => {
    try {
      if (isLocalMode) {
        const updated = products.map(p => p.id === id ? { ...p, status } : p);
        setProducts(updated);
        localStorage.setItem('nx_products', JSON.stringify(updated));
      } else {
        await fetch(SHEETS_API_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'update_status', id, status })
        });
      }
      addToast('success', `Product ${status.replace('_', ' ')}`);
      loadProducts(true);
    } catch {
      addToast('error', 'Failed to update status');
    }
  };

  const submitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.features) {
      addToast('error', 'Please fill all required fields');
      return;
    }

    setSubmitting(true);
    const newId = Math.random().toString(36).substr(2, 9);
    const newProduct: Product = {
      id: newId,
      name: formData.name,
      features: formData.features,
      price: parseFloat(formData.price),
      category: formData.category,
      status: 'processing',
      ai_description: null,
      seo_keywords: null,
      created_at: new Date().toISOString()
    };

    try {
      if (isLocalMode) {
        const updated = [newProduct, ...products];
        setProducts(updated);
        localStorage.setItem('nx_products', JSON.stringify(updated));
        
        addToast('info', 'Webhook fired — n8n triggered');
        addToast('success', 'Product submitted to pipeline');

        // Simulate AI Generation
        setTimeout(() => {
          const processingData = JSON.parse(localStorage.getItem('nx_products') || '[]');
          const finalData = processingData.map((p: Product) => {
            if (p.id === newId) {
              return {
                ...p,
                status: 'pending_approval',
                ai_description: `This premium ${p.name} from our ${p.category} collection features state-of-the-art design and ${p.features.split(',')[0] || 'high-quality materials'}. Perfect for those who value both performance and aesthetics.\n\nKey Highlights:\n- Professional grade quality\n- Optimized for daily use\n- Sustainable manufacturing`,
                seo_keywords: `${p.name.toLowerCase()}, ${p.category.toLowerCase()}, premium, quality, ${p.features.split(',')[0].trim()}`
              };
            }
            return p;
          });
          setProducts(finalData);
          localStorage.setItem('nx_products', JSON.stringify(finalData));
          addToast('success', 'AI Content Generated!');
        }, 4500);

      } else {
        await fetch(SHEETS_API_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ ...formData, id: newId })
        });
        addToast('info', 'Webhook fired — n8n triggered');
        addToast('success', 'Product submitted to pipeline');
        
        // Start Polling
        let attempts = 0;
        pollingInterval.current = setInterval(async () => {
          attempts++;
          const res = await fetch(`${SHEETS_API_URL}?t=${Date.now()}`);
          const data: Product[] = await res.json();
          const current = data.find(p => p.id === newId);
          
          if (current && current.status !== 'processing') {
            setProducts(data);
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            addToast('success', 'AI Content Ready for Review');
          }
          
          if (attempts >= 12) {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
          }
        }, 5000);
      }

      setFormData({ name: '', features: '', price: '', category: CATEGORIES[0] });
    } catch {
      addToast('error', 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Effects
  useEffect(() => {
    pingSheets();
    loadProducts();
    return () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, [pingSheets, loadProducts]);

  useEffect(() => {
    if (view === 'logs') loadLogs();
    if (view === 'products') loadProducts();
  }, [view, loadLogs, loadProducts]);

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesFilter = filter === 'all' || p.status === filter;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: products.length,
    published: products.filter(p => p.status === 'published').length,
    pending: products.filter(p => p.status === 'pending_approval').length,
    aiGenerated: products.filter(p => p.ai_description).length
  };

  return (
    <div style={{
      backgroundColor: '#0a0a0f',
      color: '#f0f0f5',
      minHeight: '100vh',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Fonts & Global Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700&family=Syne:wght@700;800&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body { overflow-y: scroll; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #16161f; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #1c1c28; }

        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(52, 211, 153, 0); }
          100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes shl {
          0% { background-position: -468px 0; }
          100% { background-position: 468px 0; }
        }

        .shimmer-text {
          background: linear-gradient(120deg, #a78bfa, #e879f9, #a78bfa);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }

        .skeleton-line {
          height: 12px;
          background: #16161f;
          background-image: linear-gradient(to right, #16161f 0%, #1c1c28 20%, #16161f 40%, #16161f 100%);
          background-repeat: no-repeat;
          background-size: 800px 104px;
          display: inline-block;
          position: relative;
          animation: shl 1.5s infinite linear;
          border-radius: 4px;
          width: 100%;
          margin-bottom: 8px;
        }

        .nav-tab {
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          background: transparent;
          color: #7a7a8c;
        }
        .nav-tab.active {
          background: #7c6af7;
          color: white;
          box-shadow: 0 4px 15px rgba(124, 106, 247, 0.3);
        }
        
        .input-field {
          background: #16161f;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          padding: 12px 16px;
          color: white;
          width: 100%;
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: #7c6af7;
          box-shadow: 0 0 0 2px rgba(124, 106, 247, 0.1);
        }

        .btn-primary {
          background: linear-gradient(135deg, #7c6af7, #a78bfa);
          border: none;
          border-radius: 8px;
          padding: 14px;
          color: white;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(124, 106, 247, 0.3);
        }
        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 900px) {
          .form-grid { grid-template-columns: 1fr !important; }
          .aside-panel { display: none !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .nav-tabs-container { overflow-x: auto; padding-bottom: 4px; }
          .nav-tab span { display: none; }
          .product-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />

      {/* Overlays */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        zIndex: 9999, pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundImage: `linear-gradient(rgba(124,106,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,247,0.03) 1px, transparent 1px)`,
        backgroundSize: '40px 40px', zIndex: 0, pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', top: '-200px', left: '50%', transform: 'translateX(-50%)',
        width: '800px', height: '500px',
        background: 'radial-gradient(ellipse, rgba(124,106,247,0.12) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none'
      }} />

      {/* Navigation */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        backgroundColor: 'rgba(10, 10, 15, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '0 24px'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#7c6af7' }}>✦</span> Nexus
            </div>
            <div className="nav-tabs-container" style={{ display: 'flex', gap: '8px' }}>
              <button className={`nav-tab ${view === 'add' ? 'active' : ''}`} onClick={() => setView('add')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                <span>Add Product</span>
              </button>
              <button className={`nav-tab ${view === 'products' ? 'active' : ''}`} onClick={() => setView('products')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span>Products</span>
              </button>
              <button className={`nav-tab ${view === 'logs' ? 'active' : ''}`} onClick={() => setView('logs')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>Logs</span>
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 12px', borderRadius: '20px',
              backgroundColor: '#111118', border: '1px solid rgba(255,255,255,0.07)',
              fontSize: '13px', fontWeight: 500
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                backgroundColor: isConnected ? '#34d399' : isLocalMode ? '#fbbf24' : '#f87171',
                animation: isConnected ? 'pulse 2s infinite' : 'none'
              }} />
              <span style={{ color: '#7a7a8c' }}>{isConnected ? 'Sheets connected' : isLocalMode ? 'Local mode' : 'Disconnected'}</span>
            </div>
            <div style={{
              padding: '6px 12px', borderRadius: '20px',
              backgroundColor: 'rgba(124, 106, 247, 0.1)', color: '#a78bfa',
              fontSize: '13px', fontWeight: 700, border: '1px solid rgba(124, 106, 247, 0.2)'
            }}>
              {products.length} Products
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', position: 'relative', zIndex: 1 }}>
        
        {/* VIEW: ADD PRODUCT */}
        {view === 'add' && (
          <div key="add" style={{ animation: 'fadeUp 0.5s ease-out' }}>
            {/* Hero */}
            <div style={{ textAlign: 'center', marginBottom: '60px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '6px 16px', borderRadius: '20px',
                backgroundColor: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.1)',
                color: '#34d399', fontSize: '13px', fontWeight: 600, marginBottom: '24px'
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#34d399', animation: 'pulse 2s infinite' }} />
                AI Content Pipeline · Google Sheets + n8n
              </div>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, marginBottom: '20px' }}>
                Generate product content with<br />
                <span className="shimmer-text">AI precision</span>
              </h1>
              <p style={{ color: '#7a7a8c', maxWidth: '600px', margin: '0 auto', fontSize: '18px' }}>
                Transform raw features into high-converting descriptions and SEO metadata automatically using our multi-model pipeline.
              </p>
            </div>

            {isLocalMode && (
              <div style={{
                backgroundColor: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.2)',
                borderRadius: '12px', padding: '16px', marginBottom: '32px', color: '#fbbf24',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span><strong>Demo Mode:</strong> API URL not configured. Data will be saved to local storage and AI generation will be simulated.</span>
              </div>
            )}

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '32px' }}>
              {/* Form Card */}
              <div style={{
                backgroundColor: '#111118', borderRadius: '14px', padding: '32px',
                border: '1px solid rgba(255,255,255,0.07)', position: 'relative', overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: 'linear-gradient(90deg, #7c6af7, #a78bfa)' }} />
                <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>New Product</h2>
                <p style={{ color: '#7a7a8c', marginBottom: '32px' }}>Fill in details — AI handles the rest</p>
                
                <form onSubmit={submitProduct} style={{ display: 'grid', gap: '24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#7a7a8c', marginBottom: '8px' }}>Product Name</label>
                      <input 
                        className="input-field" 
                        placeholder="e.g. Sonic Pro Headphones"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#7a7a8c', marginBottom: '8px' }}>Category</label>
                      <select 
                        className="input-field"
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value})}
                        style={{ appearance: 'none' }}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#7a7a8c', marginBottom: '8px' }}>Key Features</label>
                    <textarea 
                      className="input-field" 
                      placeholder="e.g. 40h battery, Noise cancelling, Bluetooth 5.2, USB-C charging"
                      style={{ minHeight: '100px', resize: 'vertical' }}
                      value={formData.features}
                      onChange={e => setFormData({...formData, features: e.target.value})}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#7a7a8c', marginBottom: '8px' }}>Price (INR)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#7c6af7', fontWeight: 700 }}>₹</span>
                      <input 
                        type="number" 
                        className="input-field" 
                        placeholder="0.00"
                        style={{ paddingLeft: '32px' }}
                        value={formData.price}
                        onChange={e => setFormData({...formData, price: e.target.value})}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? (
                      <>
                        <div style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        Submitting…
                      </>
                    ) : (
                      <>✦ Generate AI Content</>
                    )}
                  </button>
                </form>
              </div>

              {/* Aside Panel */}
              <div className="aside-panel" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {/* Live Preview */}
                <div style={{ backgroundColor: '#111118', borderRadius: '14px', padding: '24px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Preview</span>
                    {(formData.name || formData.features) && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ animation: 'pulse 2s infinite' }}>✦</span> AI incoming
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#0a0a0f', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(124, 106, 247, 0.1)', color: '#a78bfa', fontSize: '11px', fontWeight: 700, marginBottom: '12px' }}>
                      {formData.category}
                    </div>
                    <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '20px', marginBottom: '8px' }}>{formData.name || 'Product Name'}</h3>
                    <div style={{ color: '#7c6af7', fontWeight: 700, fontSize: '18px', marginBottom: '16px' }}>₹ {formData.price || '0.00'}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {formData.features ? formData.features.split(',').map((f, i) => (
                        <span key={i} style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#16161f', color: '#7a7a8c', fontSize: '11px' }}>{f.trim()}</span>
                      )) : <span style={{ color: '#333', fontSize: '12px' }}>No features listed</span>}
                    </div>
                  </div>
                </div>

                {/* Pipeline Steps */}
                <div style={{ backgroundColor: '#111118', borderRadius: '14px', padding: '24px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Pipeline Steps</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[
                      "Webhook fires — n8n triggered",
                      "Validate & clean — fields checked",
                      "3 AI variants — Claude writes",
                      "Best selected — algorithm picks",
                      "Approval email — approve/reject",
                      "Auto-published — Sheets updated"
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          backgroundColor: 'rgba(124, 106, 247, 0.1)', color: '#7c6af7',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700
                        }}>{i + 1}</div>
                        <span style={{ fontSize: '14px', color: '#7a7a8c' }}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: PRODUCTS */}
        {view === 'products' && (
          <div key="products" style={{ animation: 'fadeUp 0.5s ease-out' }}>
            {/* Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
              {[
                { label: 'Total', value: stats.total, color: 'white' },
                { label: 'Published', value: stats.published, color: '#34d399' },
                { label: 'Pending', value: stats.pending, color: '#fbbf24' },
                { label: 'AI Generated', value: stats.aiGenerated, color: '#a78bfa' }
              ].map((s, i) => (
                <div key={i} style={{ backgroundColor: '#111118', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ color: '#7a7a8c', fontSize: '14px', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontSize: '32px', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Header */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '32px' }}>
              <div>
                <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>Product Catalog</h2>
                <p style={{ color: '#7a7a8c' }}>{filteredProducts.length} products found</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', backgroundColor: '#111118', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {['all', 'published', 'pending_approval', 'rejected'].map(f => (
                    <button 
                      key={f}
                      onClick={() => setFilter(f as FilterType)}
                      style={{
                        padding: '6px 14px', borderRadius: '7px', border: 'none',
                        backgroundColor: filter === f ? '#16161f' : 'transparent',
                        color: filter === f ? 'white' : '#7a7a8c',
                        fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#7a7a8c' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input 
                    className="input-field" 
                    placeholder="Search products..." 
                    style={{ width: '240px', paddingLeft: '36px' }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => loadProducts()}
                  style={{
                    backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '8px', width: '42px', height: '42px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7a7a8c'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
              </div>
            </div>

            {/* Grid */}
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} style={{ height: '320px', backgroundColor: '#111118', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.07)', padding: '24px' }}>
                    <div className="skeleton-line" style={{ width: '40%', marginBottom: '20px' }} />
                    <div className="skeleton-line" style={{ width: '80%', height: '24px', marginBottom: '12px' }} />
                    <div className="skeleton-line" style={{ width: '30%', marginBottom: '32px' }} />
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line" style={{ width: '60%' }} />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', backgroundColor: '#111118', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>No products found</h3>
                <p style={{ color: '#7a7a8c' }}>Try adjusting your filters or search query</p>
              </div>
            ) : (
              <div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {filteredProducts.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    style={{
                      backgroundColor: '#111118', borderRadius: '14px', padding: '24px',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderTop: p.status === 'published' ? '2px solid #34d399' : '1px solid rgba(255,255,255,0.07)',
                      cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative', overflow: 'hidden'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = '0 10px 30px rgba(124, 106, 247, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(124, 106, 247, 0.3)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = p.status === 'published' ? '#34d399' : 'rgba(255,255,255,0.07)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '6px',
                        backgroundColor: '#16161f', fontSize: '11px', fontWeight: 700, color: '#7a7a8c'
                      }}>
                        <div style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          backgroundColor: p.status === 'published' ? '#34d399' : p.status === 'pending_approval' ? '#fbbf24' : p.status === 'rejected' ? '#f87171' : '#7c6af7',
                          boxShadow: p.status === 'published' ? '0 0 8px #34d399' : 'none',
                          animation: p.status === 'processing' ? 'pulse 2s infinite' : 'none'
                        }} />
                        {p.category}
                      </div>
                      <div style={{ fontFamily: "'DM Mono', monospace", color: '#7c6af7', fontWeight: 700 }}>₹{p.price}</div>
                    </div>
                    
                    <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '19px', fontWeight: 700, marginBottom: '16px', lineHeight: 1.2 }}>{p.name}</h3>
                    
                    <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: '16px' }} />
                    
                    <div style={{ minHeight: '100px', marginBottom: '16px' }}>
                      {p.status === 'processing' ? (
                        <div>
                          <div className="skeleton-line" />
                          <div className="skeleton-line" />
                          <div className="skeleton-line" style={{ width: '60%' }} />
                        </div>
                      ) : p.ai_description ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a78bfa', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                            <span>✦</span> AI Description
                          </div>
                          <p style={{ fontSize: '15px', color: '#7a7a8c', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {p.ai_description}
                          </p>
                          {p.seo_keywords && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '12px', flexWrap: 'wrap' }}>
                              {p.seo_keywords.split(',').slice(0, 2).map((k, i) => (
                                <span key={i} style={{ fontSize: '10px', color: '#555', backgroundColor: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px' }}>#{k.trim()}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p style={{ fontSize: '13px', color: '#444', fontStyle: 'italic' }}>{p.features}</p>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                      <div style={{
                        fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                        color: p.status === 'published' ? '#34d399' : p.status === 'pending_approval' ? '#fbbf24' : p.status === 'rejected' ? '#f87171' : '#7c6af7'
                      }}>
                        {p.status.replace('_', ' ')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#333' }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: LOGS */}
        {view === 'logs' && (
          <div key="logs" style={{ animation: 'fadeUp 0.5s ease-out' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '32px' }}>System Logs</h2>
            
            <div style={{ backgroundColor: '#111118', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#16161f', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase' }}>Timestamp</th>
                      <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase' }}>Product</th>
                      <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase' }}>Category</th>
                      <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase' }}>Keywords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      [1,2,3,4,5].map(i => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td colSpan={5} style={{ padding: '20px 24px' }}>
                            <div className="skeleton-line" style={{ height: '16px' }} />
                          </td>
                        </tr>
                      ))
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '60px 24px', textAlign: 'center', color: '#7a7a8c' }}>
                          No logs available yet
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}>
                          <td style={{ padding: '16px 24px', fontSize: '13px', color: '#7a7a8c', fontFamily: "'DM Mono', monospace" }}>{log.timestamp}</td>
                          <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 600 }}>{log.product_name}</td>
                          <td style={{ padding: '16px 24px', fontSize: '13px', color: '#7a7a8c' }}>{log.category}</td>
                          <td style={{ padding: '16px 24px' }}>
                            <span style={{
                              padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                              backgroundColor: log.status === 'published' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                              color: log.status === 'published' ? '#34d399' : '#fbbf24'
                            }}>
                              {log.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px', fontSize: '13px', color: '#7a7a8c' }}>{log.seo_keywords || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Modal */}
      {selectedProduct && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px'
        }} onClick={() => setSelectedProduct(null)}>
          <div style={{
            backgroundColor: '#111118', borderRadius: '14px', width: '100%', maxWidth: '620px',
            maxHeight: '85vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.12)',
            position: 'relative', animation: 'fadeUp 0.3s ease-out'
          }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedProduct(null)}
              style={{
                position: 'absolute', top: '20px', right: '20px',
                backgroundColor: '#16161f', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', color: '#7a7a8c', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <div style={{ padding: '40px' }}>
              <div style={{
                fontFamily: "'DM Mono', monospace", color: '#7c6af7', fontSize: '14px',
                fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px'
              }}>
                {selectedProduct.category}
              </div>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '32px', fontWeight: 800, marginBottom: '8px', lineHeight: 1.1 }}>
                {selectedProduct.name}
              </h2>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '24px', color: '#f0f0f5', marginBottom: '32px' }}>
                ₹{selectedProduct.price}
              </div>

              {selectedProduct.ai_description ? (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase', marginBottom: '16px' }}>AI Generated Description</h3>
                  <div style={{
                    backgroundColor: 'rgba(124, 106, 247, 0.05)', border: '1px solid rgba(124, 106, 247, 0.1)',
                    borderRadius: '10px', padding: '24px', position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute', top: '-10px', left: '20px',
                      backgroundColor: '#7c6af7', color: 'white', fontSize: '10px',
                      fontWeight: 700, padding: '2px 8px', borderRadius: '4px'
                    }}>✦ AI · BEST VARIANT</div>
                    <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#f0f0f5', whiteSpace: 'pre-line' }}>
                      {selectedProduct.ai_description}
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '32px', padding: '24px', backgroundColor: '#16161f', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <p style={{ color: '#7a7a8c', fontStyle: 'italic' }}>AI content is still processing for this item...</p>
                </div>
              )}

              {selectedProduct.seo_keywords && (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#7a7a8c', textTransform: 'uppercase', marginBottom: '16px' }}>SEO Keywords</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedProduct.seo_keywords.split(',').map((k, i) => (
                      <span key={i} style={{
                        padding: '6px 12px', borderRadius: '6px', backgroundColor: '#16161f',
                        border: '1px solid rgba(255,255,255,0.07)', fontSize: '13px', color: '#7a7a8c'
                      }}>
                        {k.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 0', borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '32px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: selectedProduct.status === 'published' ? '#34d399' : selectedProduct.status === 'pending_approval' ? '#fbbf24' : '#f87171'
                  }} />
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '12px' }}>{selectedProduct.status.replace('_', ' ')}</span>
                </div>
                <div style={{ color: '#7a7a8c', fontSize: '13px' }}>Created on {new Date(selectedProduct.created_at).toLocaleString()}</div>
              </div>

              {selectedProduct.status === 'pending_approval' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
                  <button 
                    onClick={() => { updateStatus(selectedProduct.id, 'published'); setSelectedProduct(null); }}
                    style={{
                      padding: '14px', borderRadius: '8px', border: 'none',
                      backgroundColor: 'rgba(52, 211, 153, 0.1)', color: '#34d399',
                      fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Approve & Publish
                  </button>
                  <button 
                    onClick={() => { updateStatus(selectedProduct.id, 'rejected'); setSelectedProduct(null); }}
                    style={{
                      padding: '14px', borderRadius: '8px', border: 'none',
                      backgroundColor: 'rgba(248, 113, 113, 0.1)', color: '#f87171',
                      fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Reject
                  </button>
                </div>
              )}

              <div style={{ backgroundColor: '#0a0a0f', borderRadius: '10px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#444', textTransform: 'uppercase', marginBottom: '12px' }}>Original Input Features</h4>
                <p style={{ fontSize: '14px', color: '#7a7a8c', lineHeight: 1.5 }}>{selectedProduct.features}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 10000
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            backgroundColor: '#111118', color: 'white', padding: '16px 24px',
            borderRadius: '10px', border: `1px solid ${t.type === 'success' ? '#34d399' : t.type === 'error' ? '#f87171' : '#7c6af7'}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)', minWidth: '280px',
            animation: 'toastIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%',
              backgroundColor: t.type === 'success' ? 'rgba(52, 211, 153, 0.1)' : t.type === 'error' ? 'rgba(248, 113, 113, 0.1)' : 'rgba(124, 106, 247, 0.1)',
              color: t.type === 'success' ? '#34d399' : t.type === 'error' ? '#f87171' : '#7c6af7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'
            }}>
              {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : '✦'}
            </div>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{t.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
