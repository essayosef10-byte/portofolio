import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import Footer from '../components/Footer';
import LogoSVG from '../components/LogoSVG';

const Home = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [loadingProgress, setLoadingProgress] = useState(0);

  const categories = ['الكل', 'حجاب فوري', 'شيفون', 'جيرسي', 'كريب', 'تركي', 'عباية', 'فستان', 'بلوزة', 'تنورة'];

  const products = [
    {
      id: 1,
      name: 'حجاب شيفون وردي',
      category: 'شيفون',
      price: 285,
      originalPrice: 350,
      isSale: true,
      rating: 5,
    },
    {
      id: 2,
      name: 'حجاب جيرسي أسود',
      category: 'جيرسي',
      price: 220,
      originalPrice: null,
      isSale: false,
      rating: 4,
    },
    {
      id: 3,
      name: 'حجاب كريب بيج',
      category: 'كريب',
      price: 310,
      originalPrice: 380,
      isSale: true,
      rating: 5,
    },
    {
      id: 4,
      name: 'حجاب تركي أزرق',
      category: 'تركي',
      price: 340,
      originalPrice: null,
      isSale: false,
      rating: 5,
    },
    {
      id: 5,
      name: 'عباية سوداء فاخرة',
      category: 'عباية',
      price: 850,
      originalPrice: 1200,
      isSale: true,
      rating: 5,
    },
    {
      id: 6,
      name: 'فستان محتشم زيتوني',
      category: 'فستان',
      price: 650,
      originalPrice: null,
      isSale: false,
      rating: 4,
    },
    {
      id: 7,
      name: 'حجاب شيفون ذهبي',
      category: 'شيفون',
      price: 295,
      originalPrice: null,
      isSale: false,
      rating: 5,
    },
    {
      id: 8,
      name: 'عباية كحلي أنيقة',
      category: 'عباية',
      price: 920,
      originalPrice: 1100,
      isSale: true,
      rating: 5,
    },
  ];

  const reviews = [
    {
      id: 1,
      name: 'سارة أحمد',
      initial: 'س',
      rating: 5,
      date: 'منذ يومين',
      comment: 'الجودة رائعة! القماش ناعم وأنيق. سأطلب مرة أخرى بالتأكيد.',
    },
    {
      id: 2,
      name: 'نور فؤاد',
      initial: 'ن',
      rating: 5,
      date: 'منذ أسبوع',
      comment: 'التغليف جميل والتوصيل سريع. الحجاب مطابق تماماً للصور.',
    },
    {
      id: 3,
      name: 'ياسمين محمد',
      initial: 'ي',
      rating: 5,
      date: 'منذ 3 أيام',
      comment: 'أحببته كثيراً! جودة القماش ممتازة واللون مطابق تماماً.',
    },
    {
      id: 4,
      name: 'ليلى كريم',
      initial: 'ل',
      rating: 4,
      date: 'منذ 5 أيام',
      comment: 'أنيق ومريح جداً. مثالي للاستخدام اليومي.',
    },
  ];

  const filteredProducts = activeCategory === 'الكل'
    ? products
    : products.filter(p => p.category === activeCategory);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 40);

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, []);

  const renderStars = (rating) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-3.5 h-3.5 ${star <= rating ? 'text-[#C49830]' : 'text-gray-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  if (showSplash) {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500"
        style={{ backgroundColor: '#FDFAF3' }}
      >
        <style>{`
          @keyframes slowBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
          }
        `}</style>
        <div className="flex flex-col items-center gap-6">
          <div style={{ animation: 'slowBounce 2s ease-in-out 1' }}>
            <LogoSVG size={150} />
          </div>

          <h1
            className="text-3xl font-bold tracking-wide"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: '#0A7A9A',
            }}
          >
            Yousef Shop
          </h1>

          <p
            className="text-lg"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: '#C49830',
            }}
          >
            أناقة تعبّر عنك
          </p>

          <div className="w-48 h-1.5 rounded-full bg-gray-200 mt-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100 ease-linear"
              style={{
                width: `${loadingProgress}%`,
                backgroundColor: '#C49830',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen pb-20" style={{ backgroundColor: '#FDFAF3' }}>
      <Navbar />

      {/* Hero Banner */}
      <section className="px-4 pt-4">
        <div
          className="relative rounded-3xl overflow-hidden p-6 min-h-[380px] flex flex-col justify-end"
          style={{ backgroundColor: '#0A7A9A' }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            <span className="text-8xl text-white font-bold">Yousef Shop</span>
          </div>

          <div className="relative z-10 text-right">
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-3"
              style={{
                backgroundColor: 'rgba(255,255,255,0.25)',
                color: '#fff',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              تشكيلة جديدة 2025
            </span>

            <h2
              className="text-4xl font-bold text-white mb-2 leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              أناقة بلا حدود
            </h2>

            <p
              className="text-white/90 text-sm mb-5 max-w-[280px] leading-relaxed"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              اكتشفي أحدث تشكيلاتنا من الحجاب الفاخر المصمم للمرأة المسلمة العصرية
            </p>

            <button
              className="px-8 py-3.5 rounded-2xl text-white font-semibold text-base"
              style={{
                backgroundColor: '#C49830',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              تسوقي الآن
            </button>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="px-4 mt-6">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200"
              style={{
                fontFamily: "'Inter', sans-serif",
                backgroundColor: activeCategory === cat ? '#C49830' : 'transparent',
                color: activeCategory === cat ? '#fff' : '#666',
                border: activeCategory === cat ? 'none' : '1px solid #E5E5E5',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Featured Section */}
      <section className="px-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-xl font-bold"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: '#1a1a1a',
            }}
          >
            المميز
          </h3>
          <button
            className="text-sm font-medium"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: '#C49830',
            }}
          >
            عرض الكل
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#FAF8F5' }}
            >
              <div className="relative aspect-square bg-[#F0EDE8] flex items-center justify-center">
                {product.isSale && (
                  <span
                    className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    SALE
                  </span>
                )}

                <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>

                <span
                  className="text-3xl font-bold"
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    color: '#C49830',
                    opacity: 0.4,
                  }}
                >
                  Hijab
                </span>
              </div>

              <div className="p-3">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    color: '#C49830',
                  }}
                >
                  {product.category}
                </span>

                <h4
                  className="text-sm font-semibold mt-1 mb-1"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    color: '#1a1a1a',
                  }}
                >
                  {product.name}
                </h4>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-sm font-bold"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        color: '#C49830',
                      }}
                    >
                      {product.price} ج.م
                    </span>
                    {product.originalPrice && (
                      <span
                        className="text-xs line-through"
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          color: '#999',
                        }}
                      >
                        {product.originalPrice} ج.م
                      </span>
                    )}
                  </div>

                  <button
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#0A7A9A' }}
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Summer Sale Banner */}
      <section className="px-4 mt-6">
        <div
          className="relative rounded-3xl overflow-hidden p-6 min-h-[180px] flex flex-col justify-center"
          style={{ backgroundColor: '#0A7A9A' }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: '#C49830',
              }}
            >
              لفترة محدودة
            </span>

            <h3
              className="text-3xl font-bold text-white mt-1 mb-1"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              تخفيضات الصيف
            </h3>

            <p
              className="text-white/80 text-sm mb-4"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              خصم يصل إلى 30% على منتجات مختارة
            </p>

            <button
              className="px-6 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                backgroundColor: '#fff',
                color: '#0A7A9A',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              استكشفي الآن
            </button>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section className="px-4 mt-8">
        <h3
          className="text-xl font-bold mb-4"
          style={{
            fontFamily: "'Playfair Display', serif",
            color: '#1a1a1a',
          }}
        >
          آراء العملاء
        </h3>

        <div className="space-y-3">
          {reviews.slice(0, 2).map((review) => (
            <div
              key={review.id}
              className="rounded-2xl p-4"
              style={{ backgroundColor: '#FAF8F5' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#C49830' }}
                >
                  <span className="text-white text-sm font-bold">{review.initial}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4
                      className="text-sm font-semibold"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        color: '#1a1a1a',
                      }}
                    >
                      {review.name}
                    </h4>
                    <span
                      className="text-xs"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        color: '#999',
                      }}
                    >
                      {review.date}
                    </span>
                  </div>

                  {renderStars(review.rating)}

                  <p
                    className="text-sm mt-2 leading-relaxed"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      color: '#666',
                    }}
                  >
                    {review.comment}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Community Section */}
      <section className="px-4 mt-8">
        <div
          className="rounded-3xl p-8 text-center"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#FDFAF3' }}>
            <svg className="w-7 h-7" style={{ color: '#C49830' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>

          <h3
            className="text-xl font-bold mb-2"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: '#1a1a1a',
            }}
          >
            انضمي لمجتمعنا
          </h3>

          <p
            className="text-sm mb-5 max-w-[260px] mx-auto"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: '#666',
            }}
          >
            كني جزءاً من آلاف النساء اللواتي يخترن الاحتشام بأناقة
          </p>

          <button
            className="px-8 py-3 rounded-2xl text-white font-semibold text-sm"
            style={{
              backgroundColor: '#0A7A9A',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            تابعينا
          </button>
        </div>
      </section>

      <Footer />
      <BottomNav />
    </div>
  );
};

export default Home;