import React from 'react';

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md border-b border-gray-100" style={{ background: 'rgba(255,255,255,0.92)' }}>
      <div className="flex items-center justify-between px-5 py-4">

        <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5H17" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M3 10H17" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M3 15H17" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        <span className="font-playfair text-xl tracking-widest text-primary font-semibold">
          Yousef Shop
        </span>

        <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="9" r="6" stroke="#1a1a1a" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

      </div>
    </nav>
  );
}

export default Navbar;
