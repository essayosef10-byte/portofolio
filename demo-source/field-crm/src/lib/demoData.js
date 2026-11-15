export const DEMO_USER = { id: 'demo-admin', email: 'demo@portfolio.local', user_metadata: { full_name: 'Yousef Eissa' } };
const rep = { id: 'demo-rep', user_id: 'demo-rep', username: 'demo.rep', full_name: 'محمود سامي', role: 'rep', phone: '01000000000', territory: 'الدقي والمهندسين' };
const doctorRows = [
  { id: 'doc-1', name: 'د. طارق مصطفى', specialty: 'قلب وأوعية دموية', address: 'برج الأطباء، المهندسين', area: 'المهندسين', lat: 30.0524, lng: 31.205, class: 'A', rep_id: rep.id, is_active: true, rep_notes: 'متابعة عينة المنتج الجديد' },
  { id: 'doc-2', name: 'د. سارة السيد', specialty: 'أطفال وحديثي الولادة', address: 'شارع مصدق، الدقي', area: 'الدقي', lat: 30.041, lng: 31.218, class: 'A', rep_id: rep.id, is_active: true },
  { id: 'doc-3', name: 'د. محمد كامل الشناوي', specialty: 'جراحة العظام', address: 'ميدان لبنان، العجوزة', area: 'العجوزة', lat: 30.06, lng: 31.21, class: 'B', rep_id: rep.id, is_active: true },
  { id: 'doc-4', name: 'د. أحمد حسن', specialty: 'باطنة وسكر', address: 'ميدان الجيزة', area: 'الجيزة', lat: 30.028, lng: 31.212, class: 'A', rep_id: rep.id, is_active: true },
];
export const DEMO_DATA = {
  profiles: [{ id: DEMO_USER.id, user_id: DEMO_USER.id, username: 'demo.admin', full_name: 'Yousef Eissa', role: 'admin', is_active: true }, rep],
  doctors: doctorRows,
  assignments: doctorRows.map((doctor, index) => ({ id: `assignment-${index + 1}`, doctor_id: doctor.id, rep_id: rep.id, week_number: 1, day_of_week: index + 1, status: index < 2 ? 'completed' : 'pending', created_at: new Date().toISOString() })),
  visits: [
    { id: 'visit-1', doctor_id: 'doc-1', rep_id: rep.id, visit_date: new Date().toISOString().slice(0, 10), status: 'completed', check_in_time: '09:30', lat: 30.0524, lng: 31.205, notes: 'زيارة متابعة ناجحة' },
    { id: 'visit-2', doctor_id: 'doc-2', rep_id: rep.id, visit_date: new Date().toISOString().slice(0, 10), status: 'completed', check_in_time: '11:15', lat: 30.041, lng: 31.218, notes: 'مراجعة الطلب السابق' },
  ],
  medicines: [{ id: 'med-1', name: 'FonteCare Plus' }, { id: 'med-2', name: 'FonteCalm' }],
  visit_medicines: [], day_start_times: [{ id: 'start-1', rep_id: rep.id, day_of_week: new Date().getDay(), start_time: '09:00' }],
  week_approval_history: [], doctor_submissions: [{ id: 'submission-1', name: 'د. منى إبراهيم', specialty: 'جلدية', address: 'شارع النيل، الدقي', status: 'pending', created_at: new Date().toISOString(), rep_id: rep.id }],
  doctor_location_change_requests: [], doctor_deletion_requests: [], week_cycle_settings: [],
};
