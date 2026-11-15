import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const Admin = () => {
  // ─── Password Gate ───
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ─── Tabs ───
  const [activeTab, setActiveTab] = useState('products');

  // ─── Products ───
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // ─── Comments ───
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // ─── Product Form ───
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    image_urls: '',
    is_available: true,
  });

  // ─── Toast / Messages ───
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');

  // ─── Categories ───
  const categories = [
    'حجاب فوري',
    'شيفون',
    'جيرسي',
    'كريب',
    'تركي',
    'عباية',
    'فستان',
    'بلوزة',
    'تنورة',
  ];

  // ─── Show Toast ───
  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(null), 3000);
  };

  // ─── Password Check ───
  const handlePasswordCheck = () => {
    if (passwordInput === 'admin123') {
      setIsAuthenticated(true);
      setPasswordError('');
    } else {
      setPasswordError('كلمة المرور غير صحيحة');
    }
  };

  // ─── Fetch Products ───
  const fetchProducts = async () => {
    setProductsLoading(true);
    const { data, error } = await supabase
      .from('products')
.select('id, name, description, price, category, image_urls, is_available')      .order('created_at', { ascending: false });

    if (error) {
      showMessage('خطأ في جلب المنتجات', 'error');
    } else {
      setProducts(data || []);
    }
    setProductsLoading(false);
  };

  // ─── Fetch Comments ───
  const fetchComments = async () => {
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select('id, author_name, body, product_id, approved, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      showMessage('خطأ في جلب التعليقات', 'error');
    } else {
      setComments(data || []);
    }
    setCommentsLoading(false);
  };

  // ─── Toggle Product Availability ───
  const toggleAvailability = async (id, current) => {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !current })
      .eq('id', id);

    if (error) {
      showMessage('خطأ في تحديث الحالة', 'error');
    } else {
      showMessage('تم تحديث الحالة');
      fetchProducts();
    }
  };

  // ─── Delete Product ───
  const deleteProduct = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    const { error } = await supabase.from('products').delete().eq('id', id);

    if (error) {
      showMessage('خطأ في حذف المنتج', 'error');
    } else {
      showMessage('تم حذف المنتج');
      fetchProducts();
    }
  };

  // ─── Submit Product (Insert / Update) ───
  const submitProduct = async () => {
    const payload = {
      name: productForm.name,
      description: productForm.description,
      price: parseFloat(productForm.price),
      category: productForm.category,
      image_urls: productForm.image_urls
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url.length > 0),
      is_available: productForm.is_available,
    };

    if (!payload.name || !payload.price || !payload.category) {
      showMessage('يرجى ملء جميع الحقول المطلوبة', 'error');
      return;
    }

    let error;
    if (editingProduct) {
      const { error: updateError } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProduct.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('products').insert(payload);
      error = insertError;
    }

    if (error) {
      showMessage('خطأ في حفظ المنتج', 'error');
    } else {
      showMessage(editingProduct ? 'تم تحديث المنتج' : 'تم إضافة المنتج');
      closeProductForm();
      fetchProducts();
    }
  };

  // ─── Open Add Product Form ───
  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      description: '',
      price: '',
      category: '',
      image_urls: '',
      is_available: true,
    });
    setShowProductForm(true);
  };

  // ─── Open Edit Product Form ───
  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      category: product.category,
      image_urls: Array.isArray(product.image_urls)
        ? product.image_urls.join(', ')
        : product.image_urls || '',
      is_available: product.is_available,
    });
    setShowProductForm(true);
  };

  // ─── Close Product Form ───
  const closeProductForm = () => {
    setShowProductForm(false);
    setEditingProduct(null);
  };

  // ─── Approve Comment ───
  const approveComment = async (id) => {
    const { error } = await supabase
      .from('comments')
      .update({ approved: true })
      .eq('id', id);

    if (error) {
      showMessage('خطأ في الموافقة على التعليق', 'error');
    } else {
      showMessage('تمت الموافقة على التعليق');
      fetchComments();
    }
  };

  // ─── Reject / Unapprove Comment ───
  const rejectComment = async (id) => {
    const { error } = await supabase
      .from('comments')
      .update({ approved: false })
      .eq('id', id);

    if (error) {
      showMessage('خطأ في رفض التعليق', 'error');
    } else {
      showMessage('تم رفض التعليق');
      fetchComments();
    }
  };

  // ─── Delete Comment ───
  const deleteComment = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التعليق؟')) return;

    const { error } = await supabase.from('comments').delete().eq('id', id);

    if (error) {
      showMessage('خطأ في حذف التعليق', 'error');
    } else {
      showMessage('تم حذف التعليق');
      fetchComments();
    }
  };

  // ─── Effects ───
  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
      fetchComments();
    }
  }, [isAuthenticated]);

  // ─── Render: Password Screen ───
  if (!isAuthenticated) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center px-6"
        style={{ backgroundColor: '#FDFAF3', fontFamily: 'Inter, sans-serif' }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-8 shadow-lg"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          <h1
            className="text-2xl font-bold text-center mb-6"
            style={{ fontFamily: 'Playfair Display, serif', color: '#0A7A9A' }}
          >
            لوحة التحكم
          </h1>

          <div className="mb-4">
            <label className="block text-sm mb-2 font-medium text-gray-700">
              كلمة المرور
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasswordCheck();
              }}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#0A7A9A] focus:border-transparent transition"
              placeholder="أدخل كلمة المرور"
              style={{ backgroundColor: '#FDFAF3' }}
            />
            {passwordError && (
              <p className="text-sm mt-2 text-red-600">{passwordError}</p>
            )}
          </div>

          <div
            onClick={handlePasswordCheck}
            className="w-full rounded-lg py-3 text-center text-white font-semibold cursor-pointer transition active:scale-95"
            style={{ backgroundColor: '#0A7A9A' }}
          >
            دخول
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Dashboard ───
  return (
    <div
      dir="rtl"
      className="min-h-screen pb-24"
      style={{ backgroundColor: '#FDFAF3', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ─── Toast Message ─── */}
      {message && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all duration-300 ${
            messageType === 'error' ? 'bg-red-600' : 'bg-[#0A7A9A]'
          }`}
        >
          {message}
        </div>
      )}

      {/* ─── Header ─── */}
      <div
        className="sticky top-0 z-40 px-4 py-4 shadow-sm"
        style={{ backgroundColor: '#0A7A9A' }}
      >
        <h1
          className="text-xl font-bold text-center text-white"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          يوسف شوب — لوحة التحكم
        </h1>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex border-b border-gray-200" style={{ backgroundColor: '#FAF8F5' }}>
        <div
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-3 text-center text-sm font-semibold cursor-pointer transition border-b-2 ${
            activeTab === 'products'
              ? 'border-[#C49830] text-[#C49830]'
              : 'border-transparent text-gray-500'
          }`}
        >
          المنتجات
        </div>
        <div
          onClick={() => setActiveTab('comments')}
          className={`flex-1 py-3 text-center text-sm font-semibold cursor-pointer transition border-b-2 ${
            activeTab === 'comments'
              ? 'border-[#C49830] text-[#C49830]'
              : 'border-transparent text-gray-500'
          }`}
        >
          التعليقات
        </div>
      </div>

      {/* ─── Products Tab ─── */}
      {activeTab === 'products' && (
        <div className="px-4 pt-4">
          <div
            onClick={openAddProduct}
            className="w-full rounded-xl py-3 text-center text-white font-semibold mb-4 cursor-pointer transition active:scale-95 shadow-sm"
            style={{ backgroundColor: '#0A7A9A' }}
          >
            + إضافة منتج
          </div>

          {productsLoading ? (
            <div className="text-center py-12 text-gray-500 text-sm">جاري التحميل...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              لا توجد منتجات
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="rounded-xl p-4 shadow-sm border border-gray-100"
                  style={{ backgroundColor: '#FAF8F5' }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3
                        className="font-bold text-base"
                        style={{ fontFamily: 'Playfair Display, serif', color: '#0A7A9A' }}
                      >
                        {product.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {product.category} — {product.price} ر.س
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          product.is_available
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {product.is_available ? 'متاح' : 'غير متاح'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <div
                      onClick={() => toggleAvailability(product.id, product.is_available)}
                      className="flex-1 rounded-lg py-2 text-center text-xs font-medium cursor-pointer transition active:scale-95 border"
                      style={{
                        borderColor: product.is_available ? '#e5e7eb' : '#0A7A9A',
                        color: product.is_available ? '#6b7280' : '#0A7A9A',
                        backgroundColor: '#FDFAF3',
                      }}
                    >
                      {product.is_available ? 'إخفاء' : 'إظهار'}
                    </div>
                    <div
                      onClick={() => openEditProduct(product)}
                      className="flex-1 rounded-lg py-2 text-center text-xs font-medium cursor-pointer transition active:scale-95 border"
                      style={{
                        borderColor: '#C49830',
                        color: '#C49830',
                        backgroundColor: '#FDFAF3',
                      }}
                    >
                      تعديل
                    </div>
                    <div
                      onClick={() => deleteProduct(product.id)}
                      className="flex-1 rounded-lg py-2 text-center text-xs font-medium cursor-pointer transition active:scale-95 border border-red-200 text-red-600"
                      style={{ backgroundColor: '#FDFAF3' }}
                    >
                      حذف
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Comments Tab ─── */}
      {activeTab === 'comments' && (
        <div className="px-4 pt-4">
          {commentsLoading ? (
            <div className="text-center py-12 text-gray-500 text-sm">جاري التحميل...</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              لا توجد تعليقات
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl p-4 shadow-sm border border-gray-100"
                  style={{ backgroundColor: '#FAF8F5' }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-gray-800">
                        {comment.author_name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        منتج رقم: {comment.product_id}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        comment.approved
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {comment.approved ? 'مُعتمد' : 'بانتظار الموافقة'}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700 leading-relaxed mb-3 border-r-2 border-[#C49830] pr-3">
                    {comment.body}
                  </p>

                  <div className="flex gap-2">
                    {!comment.approved && (
                      <div
                        onClick={() => approveComment(comment.id)}
                        className="flex-1 rounded-lg py-2 text-center text-xs font-medium cursor-pointer transition active:scale-95 text-white"
                        style={{ backgroundColor: '#0A7A9A' }}
                      >
                        موافقة
                      </div>
                    )}
                    {comment.approved && (
                      <div
                        onClick={() => rejectComment(comment.id)}
                        className="flex-1 rounded-lg py-2 text-center text-xs font-medium cursor-pointer transition active:scale-95 border"
                        style={{
                          borderColor: '#C49830',
                          color: '#C49830',
                          backgroundColor: '#FDFAF3',
                        }}
                      >
                        رفض
                      </div>
                    )}
                    <div
                      onClick={() => deleteComment(comment.id)}
                      className="flex-1 rounded-lg py-2 text-center text-xs font-medium cursor-pointer transition active:scale-95 border border-red-200 text-red-600"
                      style={{ backgroundColor: '#FDFAF3' }}
                    >
                      حذف
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Product Form Modal ─── */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div
            className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl"
            style={{ backgroundColor: '#FDFAF3' }}
          >
            <h2
              className="text-lg font-bold mb-5 text-center"
              style={{ fontFamily: 'Playfair Display, serif', color: '#0A7A9A' }}
            >
              {editingProduct ? 'تعديل منتج' : 'إضافة منتج جديد'}
            </h2>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  اسم المنتج *
                </label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm({ ...productForm, name: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A7A9A] focus:border-transparent transition"
                  style={{ backgroundColor: '#FAF8F5' }}
                  placeholder="مثال: حجاب شيفون أزرق"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  الوصف
                </label>
                <textarea
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm({ ...productForm, description: e.target.value })
                  }
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A7A9A] focus:border-transparent transition resize-none"
                  style={{ backgroundColor: '#FAF8F5' }}
                  placeholder="و مختصر للمنتج..."
                />
              </div>

              {/* Price & Category */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    السعر *
                  </label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={(e) =>
                      setProductForm({ ...productForm, price: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A7A9A] focus:border-transparent transition"
                    style={{ backgroundColor: '#FAF8F5' }}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    الفئة *
                  </label>
                  <select
                    value={productForm.category}
                    onChange={(e) =>
                      setProductForm({ ...productForm, category: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A7A9A] focus:border-transparent transition appearance-none"
                    style={{ backgroundColor: '#FAF8F5' }}
                  >
                    <option value="">اختر الفئة</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Image URLs */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  روابط الصور (مفصولة بفاصلة)
                </label>
                <input
                  type="text"
                  value={productForm.image_urls}
                  onChange={(e) =>
                    setProductForm({ ...productForm, image_urls: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A7A9A] focus:border-transparent transition"
                  style={{ backgroundColor: '#FAF8F5' }}
                  placeholder="https://..., https://..."
                />
              </div>

              {/* Available Checkbox */}
              <div className="flex items-center gap-2">
                <div
                  onClick={() =>
                    setProductForm({
                      ...productForm,
                      is_available: !productForm.is_available,
                    })
                  }
                  className={`w-5 h-5 rounded border cursor-pointer flex items-center justify-center transition ${
                    productForm.is_available
                      ? 'bg-[#0A7A9A] border-[#0A7A9A]'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {productForm.is_available && (
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700">المنتج متاح للبيع</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <div
                onClick={submitProduct}
                className="flex-1 rounded-lg py-3 text-center text-sm font-semibold text-white cursor-pointer transition active:scale-95"
                style={{ backgroundColor: '#0A7A9A' }}
              >
                {editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </div>
              <div
                onClick={closeProductForm}
                className="flex-1 rounded-lg py-3 text-center text-sm font-semibold cursor-pointer transition active:scale-95 border"
                style={{
                  borderColor: '#C49830',
                  color: '#C49830',
                  backgroundColor: '#FDFAF3',
                }}
              >
                إلغاء
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;