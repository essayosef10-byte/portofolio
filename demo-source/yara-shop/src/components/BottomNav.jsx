import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const activeColor = '#E8B455';
  const inactiveColor = '#9ca3af';

  return (
    <nav className="sticky bottom-0 z-50 bg-white border-t border-gray-100">
      <div className="flex items-center justify-around px-2 py-2">

        {/* Home */}
        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3 9.5L11 3L19 9.5V19C19 19.5523 18.5523 20 18 20H14V15H8V20H4C3.44772 20 3 19.5523 3 19V9.5Z"
              stroke={isActive('/') ? activeColor : inactiveColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={isActive('/') ? activeColor + '22' : 'none'}
            />
          </svg>
          <span
            className="text-xs font-inter font-medium"
            style={{ color: isActive('/') ? activeColor : inactiveColor }}
          >
            Home
          </span>
        </button>

        {/* Search */}
        <button
          onClick={() => navigate('/products')}
          className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle
              cx="10"
              cy="10"
              r="7"
              stroke={isActive('/products') ? activeColor : inactiveColor}
              strokeWidth="1.5"
            />
            <path
              d="M15.5 15.5L19 19"
              stroke={isActive('/products') ? activeColor : inactiveColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span
            className="text-xs font-inter font-medium"
            style={{ color: isActive('/products') ? activeColor : inactiveColor }}
          >
            Search
          </span>
        </button>

        {/* Wishlist */}
        <button
          className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M11 19C11 19 3 13.5 3 7.5C3 5.01472 5.01472 3 7.5 3C8.9587 3 10.2629 3.6658 11 4.73539C11.7371 3.6658 13.0413 3 14.5 3C16.9853 3 19 5.01472 19 7.5C19 13.5 11 19 11 19Z"
              stroke={inactiveColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span
            className="text-xs font-inter font-medium"
            style={{ color: inactiveColor }}
          >
            Wishlist
          </span>
        </button>

        {/* Profile */}
        <button
          className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle
              cx="11"
              cy="8"
              r="3.5"
              stroke={inactiveColor}
              strokeWidth="1.5"
            />
            <path
              d="M4 19C4 15.134 7.13401 12 11 12C14.866 12 18 15.134 18 19"
              stroke={inactiveColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span
            className="text-xs font-inter font-medium"
            style={{ color: inactiveColor }}
          >
            Profile
          </span>
        </button>

      </div>
    </nav>
  );
}

export default BottomNav;
