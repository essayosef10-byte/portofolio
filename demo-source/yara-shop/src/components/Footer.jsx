import React from 'react';

function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-8 px-4">
      <div className="flex flex-col items-center gap-3">

        <span className="font-playfair text-xl tracking-widest text-primary font-semibold">
          YARA SHOP
        </span>

        <p className="text-sm text-gray-400 tracking-wide">
          Modest &amp; Proud
        </p>

        <div className="flex items-center gap-6 mt-1">
          <a href="/about" className="text-sm text-gray-500 hover:text-primary transition-colors">
            About
          </a>
          <span className="text-gray-200">—</span>
          <a href="/contact" className="text-sm text-gray-500 hover:text-primary transition-colors">
            Contact
          </a>
          <span className="text-gray-200">—</span>
          <a href="/faq" className="text-sm text-gray-500 hover:text-primary transition-colors">
            FAQ
          </a>
        </div>

        <p className="text-xs text-gray-300 mt-2">
          © 2025 Yara Shop. All rights reserved.
        </p>

        <p className="text-xs text-gray-400 mt-1">
          Designed &amp; Developed by{' '}
          <a
            href="https://wa.me/201096382297"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Yousef
          </a>
        </p>

      </div>
    </footer>
  );
}

export default Footer;
