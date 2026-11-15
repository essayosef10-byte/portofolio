export const DEMO_USER = { id: 'demo-academy-admin', email: 'demo@portfolio.local', user_metadata: { full_name: 'Yousef Eissa' } };
export const DEMO_DATA = {
  profiles: [
    { id: DEMO_USER.id, user_id: DEMO_USER.id, full_name: 'Yousef Eissa', email: DEMO_USER.email, role: 'admin', is_super_admin: true, department: 'Computer Science', academic_year: 3, university: 'Vortex Academy' },
    { id: 'demo-student', user_id: 'demo-student', full_name: 'مريم أحمد', email: 'student@demo.local', role: 'student', department: 'Computer Science', academic_year: 3, university: 'Vortex Academy' },
  ],
  courses: [
    { id: 'course-1', code: 'CS301', title: 'الذكاء الاصطناعي', name: 'الذكاء الاصطناعي', department: 'Computer Science', academic_year: 3, description: 'مقدمة في تعلم الآلة والشبكات العصبية.' },
    { id: 'course-2', code: 'CS302', title: 'قواعد البيانات المتقدمة', name: 'قواعد البيانات المتقدمة', department: 'Computer Science', academic_year: 3, description: 'تصميم قواعد البيانات والاستعلامات المتقدمة.' },
    { id: 'course-3', code: 'CS303', title: 'هندسة البرمجيات', name: 'هندسة البرمجيات', department: 'Computer Science', academic_year: 3, description: 'مبادئ تحليل وتصميم الأنظمة البرمجية.' },
  ],
  course_offerings: [
    { id: 'offering-1', course_id: 'course-1', department: 'Computer Science', academic_year: 3 },
    { id: 'offering-2', course_id: 'course-2', department: 'Computer Science', academic_year: 3 },
    { id: 'offering-3', course_id: 'course-3', department: 'Computer Science', academic_year: 3 },
  ],
  materials: [
    { id: 'material-1', course_id: 'course-1', title: 'مقدمة في تعلم الآلة', type: 'pdf', status: 'approved', file_url: '#', created_at: new Date().toISOString() },
    { id: 'material-2', course_id: 'course-1', title: 'الشبكات العصبية', type: 'pdf', status: 'approved', file_url: '#', created_at: new Date().toISOString() },
    { id: 'material-3', course_id: 'course-2', title: 'Normalization and Indexing', type: 'pdf', status: 'approved', file_url: '#', created_at: new Date().toISOString() },
  ],
  schedules: [{ id: 'schedule-1', title: 'محاضرة الذكاء الاصطناعي', course_id: 'course-1', department: 'Computer Science', academic_year: 3, starts_at: new Date().toISOString(), location: 'قاعة 204' }],
  notifications: [{ id: 'notification-1', title: 'أهلًا بك في العرض التجريبي', body: 'تصفح المنصة والمواد التجريبية بحرية.', created_at: new Date().toISOString(), is_read: false }],
  assignments: [], quizzes: [], grades: [], admin_scopes: [], support_threads: [], support_messages: [],
};
