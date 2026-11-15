import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DEMO_MODE } from './lib/supabase';

const Home = lazy(() => import('./pages/Home'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Admin = lazy(() => import('./pages/Admin'));

function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-page-bg">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      {DEMO_MODE && <div role="status" style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 1000, border: '1px solid #f0d18b', borderRadius: 999, padding: '8px 14px', background: '#fff4d6', color: '#694b10', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 24px #17203322' }}>DEMO PREVIEW · عيّنة منتجات</div>}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Suspense>
  );
}

export default App;
