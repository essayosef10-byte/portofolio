export const DEMO_USER = { id: 'demo-ceo-user', email: 'demo@portfolio.local', user_metadata: { full_name: 'Demo Visitor' } };
const courses = [
  { id: 101, type: 'courses', title_en: 'Leadership Essentials', title_ar: 'أساسيات القيادة', description_en: 'Build practical leadership habits for growing teams.', description_ar: 'مهارات عملية لقيادة الفرق وبناء بيئة عمل قوية.', price: 450, is_published: true, sort_order: 1, image_url: '/images/course-leadership.jpg', start_date: '2026-12-01' },
  { id: 102, type: 'courses', title_en: 'Business Strategy', title_ar: 'استراتيجية الأعمال', description_en: 'Turn market insight into a focused company strategy.', description_ar: 'حوّل فهم السوق إلى استراتيجية واضحة للشركة.', price: 650, is_published: true, sort_order: 2, image_url: '/images/course-strategy.jpg', start_date: '2026-12-10' },
];
const diplomas = [
  { id: 201, type: 'diplomas', title_en: 'Executive Management Diploma', title_ar: 'دبلومة الإدارة التنفيذية', description_en: 'A guided path through finance, people, operations, and growth.', description_ar: 'مسار متكامل في الإدارة والتمويل والتشغيل والنمو.', price: 1800, is_published: true, sort_order: 1, start_date: '2027-01-10', capacity: 30, booking_open: true },
];
const camps = [
  { id: 301, type: 'camps', title_en: 'Founder Growth Camp', title_ar: 'معسكر نمو المؤسسين', description_en: 'A hands-on sprint for founders building their next stage.', description_ar: 'تجربة عملية للمؤسسين لبناء المرحلة التالية من شركاتهم.', price: 950, is_published: true, sort_order: 1, start_date: '2027-02-05', capacity: 24, booking_open: true },
];
export const DEMO_DATA = {
  profiles: [{ user_id: DEMO_USER.id, student_code: 'DEMO-2026', full_name: 'Demo Visitor', email: DEMO_USER.email, university: 'Vortex Academy', faculty: 'Business', year: 3 }],
  admins: [{ user_id: DEMO_USER.id }],
  items: [...courses, ...diplomas, ...camps],
  lectures: [
    { id: 1001, item_id: 101, position: 1, title_en: 'Leadership Foundations', title_ar: 'مقدمة في القيادة', description_en: 'Core concepts and a practical leadership checklist.', description_ar: 'المفاهيم الأساسية وأداة عملية للقيادة.', duration_minutes: 18, is_free_preview: true, is_published: true },
    { id: 1002, item_id: 101, position: 2, title_en: 'Building Strong Teams', title_ar: 'بناء فرق قوية', description_en: 'Create clarity, ownership, and trust.', description_ar: 'وضوح المسؤوليات والثقة داخل الفريق.', duration_minutes: 24, is_free_preview: false, is_published: true },
  ],
  lecture_media: [{ lecture_id: 1001, video_url: 'https://www.youtube-nocookie.com/embed/ysz5S6PUM-U' }],
  bookings: [{ id: 'demo-booking-existing', user_id: DEMO_USER.id, item_id: 201, status: 'confirmed', phone: '+20 100 000 0000', created_at: new Date().toISOString() }],
  item_private: [],
};
