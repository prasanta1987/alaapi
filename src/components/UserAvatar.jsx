import React, { useState, useEffect } from 'react';

export function UserAvatar({
  photoURL,
  name = 'User',
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  className = ''
}) {
  const [hasError, setHasError] = useState(false);

  // Reset error state if photoURL changes
  useEffect(() => {
    setHasError(false);
  }, [photoURL]);

  const sizeClasses = {
    xs: 'w-7 h-7 text-[11px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-14 h-14 text-xl font-bold'
  };

  const initial = (name?.[0] || 'U').toUpperCase();
  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  if (photoURL && !hasError) {
    return (
      <img
        src={photoURL}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className={`${currentSizeClass} rounded-2xl object-cover border border-purple-500/40 shadow-md shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${currentSizeClass} rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-800 text-white font-bold flex items-center justify-center border border-purple-400/30 shadow-md shrink-0 select-none ${className}`}
    >
      {initial}
    </div>
  );
}

