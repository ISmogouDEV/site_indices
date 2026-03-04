'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(false);

    // Load saved preference
    useEffect(() => {
        const saved = localStorage.getItem('pe-theme');
        if (saved === 'dark') setIsDark(true);
    }, []);

    // Apply to HTML element and persist
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('pe-theme', isDark ? 'dark' : 'light');
    }, [isDark]);

    return (
        <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(p => !p) }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
