import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabase';

const categories = ['الكل', 'حجاب فوري', 'شيفون', 'جيرسي', 'كريب', 'تركي', 'عباية', 'فستان', 'بلوزة', 'تنورة'];

const Products = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (activeCategory === 'الكل') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter((p) => p.category === activeCategory));
    }
  }, [activeCategory, products]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: supaError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (supaError) throw supaError;
      setProducts(data || []);
      setFilteredProducts(data || []);
    } catch (err) {
      setError('حدث خطأ أثناء جلب المنتجات. يرجى المحاولة مرة أخرى.');
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-EG').format(price) + ' ج.م';
  };

  const handleProductClick = (id) => {
    navigate(`/product/${id}`);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#FDFAF3] font-['Inter']">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <Navbar />

      {/* Sticky Category Scroll */}
      <div className="sticky top-0 z-30 bg-[#FDFAF3] border-b border-gray-100 py-3">
        <div className="flex overflow-x-auto no-scrollbar px-4 gap-2 pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex-shrink-0 ${
                activeCategory === cat
                  ? 'bg-[#0A7A9A] text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-[#0A7A9A] hover:text-[#0A7A9A]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="px-4 py-6 pb-28">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-[#0A7A9A] border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-500 text-sm">جاري تحميل المنتجات...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-2">{error}</p>
            <button
              onClick={fetchProducts}
              className="mt-2 px-6 py-2 bg-[#0A7A9A] text-white rounded-full text-sm font-medium hover:bg-[#086a87] transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-[#FAF8F5] rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-[#C49830]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg font-medium">لا توجد منتجات في هذا القسم</p>
            <p className="text-gray-400 text-sm mt-1">تفقد أقسام أخرى أو عد لاحقاً</p>
          </div>
        )}

        {/* Products Grid */}
        {!loading && !error && filteredProducts.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => handleProductClick(product.id)}
                className="bg-[#FAF8F5] rounded-2xl shadow-sm overflow-hidden cursor-pointer active:scale-95 transition-transform duration-200"
              >
                {/* Image Container */}
                <div className="relative aspect-square bg-[#FAF8F5] overflow-hidden">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-[#C49830]/10 flex items-center justify-center">
                        <svg className="w-8 h-8 text-[#C49830]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Out of Stock Badge */}
                  {product.is_available === false && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
                      نفذت الكمية
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-3">
                  <h3 className="font-['Playfair_Display'] text-sm font-semibold text-gray-800 leading-tight mb-2 line-clamp-2 min-h-[2.5rem]">
                    {product.name}
                  </h3>

                  <div className="flex items-center justify-between">
                    <span className="text-[#0A7A9A] font-bold text-sm">
                      {formatPrice(product.price)}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProductClick(product.id);
                      }}
                      className="w-8 h-8 bg-[#0A7A9A] text-white rounded-full flex items-center justify-center shadow-md hover:bg-[#086a87] active:scale-90 transition-all"
                      aria-label="عرض التفاصيل"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
};

export default Products;