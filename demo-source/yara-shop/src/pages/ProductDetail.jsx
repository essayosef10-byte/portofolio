import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabase';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Comment form state
  const [authorName, setAuthorName] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState(false);

  useEffect(() => {
    fetchProductData();
  }, [id]);

  const fetchProductData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch product
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (productError) throw productError;
      if (!productData) throw new Error('المنتج غير موجود');

      setProduct(productData);

      // Fetch variants
      const { data: variantsData, error: variantsError } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', id);

      if (variantsError) throw variantsError;
      setVariants(variantsData || []);

      // Select first in-stock variant by default
      const firstInStock = (variantsData || []).find((v) => v.in_stock);
      if (firstInStock) setSelectedColor(firstInStock.color);

      // Fetch approved comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .eq('product_id', id)
        .eq('approved', true)
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;
      setComments(commentsData || []);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء جلب بيانات المنتج');
      console.error('Error fetching product:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-EG').format(price) + ' ج.م';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleWhatsAppClick = () => {};

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!authorName.trim() || !commentBody.trim()) return;

    try {
      setSubmitting(true);
      const { error: insertError } = await supabase.from('comments').insert({
        product_id: id,
        author_name: authorName.trim(),
        body: commentBody.trim(),
        approved: false,
      });

      if (insertError) throw insertError;

      setAuthorName('');
      setCommentBody('');
      setCommentSuccess(true);
      setTimeout(() => setCommentSuccess(false), 4000);
    } catch (err) {
      console.error('Error submitting comment:', err);
      alert('حدث خطأ أثناء إرسال التعليق. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#FDFAF3] font-['Inter'] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-[#0A7A9A] border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-gray-500 text-sm">جاري تحميل المنتج...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#FDFAF3] font-['Inter'] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium mb-2">{error || 'المنتج غير موجود'}</p>
          <button
            onClick={() => (error ? fetchProductData() : navigate('/products'))}
            className="mt-2 px-6 py-2 bg-[#0A7A9A] text-white rounded-full text-sm font-medium hover:bg-[#086a87] transition-colors"
          >
            {error ? 'إعادة المحاولة' : 'العودة للمنتجات'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#FDFAF3] font-['Inter']">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <Navbar />

      <main className="pb-36">
        {/* Image Gallery */}
        <div className="bg-[#FAF8F5]">
          {/* Main Image */}
          <div className="relative aspect-square w-full overflow-hidden">
            {product.images && product.images.length > 0 ? (
              <img
                src={product.images[selectedImage]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#FAF8F5]">
                <div className="w-24 h-24 rounded-full bg-[#C49830]/10 flex items-center justify-center">
                  <svg className="w-12 h-12 text-[#C49830]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {product.images && product.images.length > 1 && (
            <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedImage === idx ? 'border-[#C49830]' : 'border-transparent'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="px-4 pt-5 pb-2">
          {/* Category Badge */}
          <span className="inline-block px-3 py-1 bg-[#FAF8F5] text-[#0A7A9A] text-xs font-medium rounded-full mb-3">
            {product.category}
          </span>

          {/* Name & Price Row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <h1 className="font-['Playfair_Display'] text-2xl font-bold text-gray-900 leading-tight flex-1">
              {product.name}
            </h1>
            <span className="text-[#C49830] font-bold text-xl whitespace-nowrap pt-1">
              {formatPrice(product.price)}
            </span>
          </div>

          {/* Out of Stock Badge */}
          {product.is_available === false && (
            <div className="inline-flex items-center gap-1.5 bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg mb-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              نفذت الكمية
            </div>
          )}

          {/* Description */}
          {product.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-5">
              {product.description}
            </p>
          )}
        </div>

        {/* Color Variants */}
        {variants.length > 0 && (
          <div className="px-4 mb-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">الألوان المتاحة</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => variant.in_stock && setSelectedColor(variant.color)}
                  disabled={!variant.in_stock}
                  className={`flex flex-col items-center gap-1.5 flex-shrink-0 transition-all ${
                    !variant.in_stock ? 'opacity-60' : 'active:scale-95'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center relative ${
                      selectedColor === variant.color
                        ? 'border-[#C49830] shadow-md'
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: variant.color.toLowerCase() }}
                    title={variant.color}
                  >
                    {!variant.in_stock && (
                      <>
                        <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-600 font-medium">
                    {variant.in_stock ? variant.color : 'نفذ'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-gray-200 mx-4 mb-5" />

        {/* Comments Section */}
        <div className="px-4 mb-6">
          <h2 className="font-['Playfair_Display'] text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#C49830]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            تعليقات العملاء
          </h2>

          {/* Comments List */}
          {comments.length > 0 ? (
            <div className="space-y-3 mb-6">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-[#FAF8F5] rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#0A7A9A]/10 flex items-center justify-center">
                        <span className="text-[#0A7A9A] text-xs font-bold">
                          {comment.author_name.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">{comment.author_name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">{comment.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#FAF8F5] rounded-2xl p-6 text-center mb-6">
              <p className="text-gray-400 text-sm">لا توجد تعليقات بعد. كن أول من يعلق!</p>
            </div>
          )}

          {/* Add Comment Form */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-3">أضف تعليقك</h3>

            {commentSuccess && (
              <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                شكراً! سيظهر تعليقك بعد المراجعة
              </div>
            )}

            <form onSubmit={handleCommentSubmit} className="space-y-3">
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="اسمك"
                required
                className="w-full px-4 py-3 bg-[#FAF8F5] rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0A7A9A]/20"
              />
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="اكتب تعليقك هنا..."
                required
                rows={3}
                className="w-full px-4 py-3 bg-[#FAF8F5] rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0A7A9A]/20 resize-none"
              />
              <button
                type="submit"
                disabled={submitting || !authorName.trim() || !commentBody.trim()}
                className="w-full py-3 bg-[#0A7A9A] text-white rounded-xl text-sm font-bold hover:bg-[#086a87] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'جاري الإرسال...' : 'إرسال التعليق'}
              </button>
            </form>
          </div>
        </div>

        <Footer />
      </main>

      {/* Fixed WhatsApp Button */}
      <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pointer-events-none">
        <button
          disabled
          className="w-full py-3.5 bg-gray-300 text-gray-500 rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          تواصل معنا
        </button>
      </div>

      <BottomNav />
    </div>
  );
};

export default ProductDetail;