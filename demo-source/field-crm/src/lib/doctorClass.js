// src/lib/doctorClass.js
//
// فئة الدكتور/المستشفى (A / B / C / AM) بقت عمود structured اسمه "class"
// في جدول doctors بدل ما تكون مدفونة كنص جوّه notes. الملف ده بيوفّر
// دالة عرض واحدة تُستخدم في كل مكان بيعرض بيانات دكتور، عشان لو العمود
// class موجود نعرضه كبادج واضح، ولو مش موجود (صف قديم) نرجع نعرض notes
// زي ما هو من غير ما نكسر حاجة.

export const DOCTOR_CLASSES = ['A', 'B', 'C', 'AM'];

export const DOCTOR_CLASS_LABELS = {
  A: 'A',
  B: 'B',
  C: 'C',
  AM: 'AM — مستشفى',
};

/** بيرجع فئة الدكتور (A/B/C/AM) لو موجودة في عمود class، وإلا null. */
export function getDoctorClass(doctor) {
  if (!doctor) return null;
  return doctor.class || null;
}
