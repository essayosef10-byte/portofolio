const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
export const DEMO_USER = { id: 'demo-shop-guest', email: 'guest@portfolio.local', user_metadata: { full_name: 'Demo Guest' } };
export const DEMO_DATA = {
  products: [
    { id: 1, name: 'حجاب شيفون وردي', category: 'شيفون', price: 285, description: 'حجاب شيفون خفيف بملمس ناعم وانسياب أنيق.', images: [img('photo-1539109136881-3be0616acf4b')], is_available: true, created_at: '2026-11-10T12:00:00Z' },
    { id: 2, name: 'حجاب جيرسي أسود', category: 'جيرسي', price: 220, description: 'قماش جيرسي مرن ومريح للاستخدام اليومي.', images: [img('photo-1529139574466-a303027c1d8b')], is_available: true, created_at: '2026-11-09T12:00:00Z' },
    { id: 3, name: 'حجاب كريب بيج', category: 'كريب', price: 310, description: 'كريب ناعم بلون محايد سهل التنسيق.', images: [img('photo-1483985988355-763728e1935b')], is_available: true, created_at: '2026-11-08T12:00:00Z' },
    { id: 4, name: 'عباية سوداء فاخرة', category: 'عباية', price: 850, description: 'قصة واسعة وتفاصيل هادئة لمظهر يومي راقٍ.', images: [img('photo-1539008835657-9e8e9680c956')], is_available: true, created_at: '2026-11-07T12:00:00Z' },
    { id: 5, name: 'حجاب تركي أزرق', category: 'تركي', price: 340, description: 'حجاب تركي بلون أزرق هادئ وتنسيق سهل.', images: [img('photo-1485230895905-ec40ba36b9bc')], is_available: true, created_at: '2026-11-06T12:00:00Z' },
    { id: 6, name: 'فستان محتشم زيتوني', category: 'فستان', price: 650, description: 'إطلالة مريحة بقصة محتشمة ولون زيتوني مميز.', images: [img('photo-1496747611176-843222e1e57c')], is_available: true, created_at: '2026-11-05T12:00:00Z' },
    { id: 7, name: 'حجاب شيفون ذهبي', category: 'شيفون', price: 295, description: 'شيفون بلون ذهبي خفيف للمناسبات والإطلالات اليومية.', images: [img('photo-1485968579580-b6d095142e6e')], is_available: true, created_at: '2026-11-04T12:00:00Z' },
    { id: 8, name: 'عباية كحلي أنيقة', category: 'عباية', price: 920, description: 'عباية كحلي بتفاصيل بسيطة وقماش مريح.', images: [img('photo-1490481651871-ab68de25d43d')], is_available: true, created_at: '2026-11-03T12:00:00Z' },
  ],
  product_variants: [
    { id: 11, product_id: 1, color: 'وردي', in_stock: true }, { id: 12, product_id: 1, color: 'أوف وايت', in_stock: true },
    { id: 21, product_id: 2, color: 'أسود', in_stock: true }, { id: 31, product_id: 3, color: 'بيج', in_stock: true },
    { id: 51, product_id: 5, color: 'أزرق', in_stock: true }, { id: 61, product_id: 6, color: 'زيتوني', in_stock: true },
    { id: 71, product_id: 7, color: 'ذهبي', in_stock: true }, { id: 81, product_id: 8, color: 'كحلي', in_stock: true },
  ],
  comments: [
    { id: 41, product_id: 1, author_name: 'سارة أحمد', body: 'الخامة جميلة والتغليف أنيق جدًا.', approved: true, created_at: '2026-11-11T10:00:00Z' },
    { id: 42, product_id: 2, author_name: 'نور فؤاد', body: 'مريح وثابت طول اليوم.', approved: true, created_at: '2026-11-10T10:00:00Z' },
  ],
};
