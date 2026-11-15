// src/lib/leafletMarkerIcon.js
//
// إصلاح مشكلة شائعة في Leaflet+bundlers: أيقونة الماركر الافتراضية
// بتتكسر لأن الـ build tool مش بيلاقي مسارات الصور. بنجيبها من CDN بدل كده.
//
// ده نفس الكود اللي كان متكرر حرفيًا في RepAddDoctor.js وRepSetDoctorLocation.js —
// اتنقل هنا كمصدر واحد عشان أي صفحة تانية تستخدم خريطة Leaflet تستورده
// بدل ما تكرره.

import L from 'leaflet';

export const leafletMarkerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
