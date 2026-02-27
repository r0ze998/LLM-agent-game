import type React from 'react';

export const titleContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  background: '#0d0d24',
  color: '#e8e8e8',
  fontFamily: '"M PLUS 1p", "Hiragino Kaku Gothic ProN", monospace',
};

export const titleStyle: React.CSSProperties = {
  fontSize: 48,
  marginBottom: 8,
  color: '#7ab8ff',
  textShadow: '0 0 20px rgba(122,184,255,0.3)',
};

export const subtitleStyle: React.CSSProperties = {
  color: '#7a9ec7',
  marginBottom: 32,
  fontSize: 14,
};

export const primaryButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #4a6fa5 0%, #2a4a7a 100%)',
  border: '2px solid #5a8fd5',
  borderRadius: 8,
  padding: '12px 48px',
  color: '#fff',
  fontSize: 18,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
};

export const secondaryButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '2px solid #4a6fa5',
  borderRadius: 8,
  padding: '12px 48px',
  color: '#7a9ec7',
  fontSize: 18,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#a88fc4',
  fontSize: 12,
  marginBottom: 4,
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#111',
  border: '1px solid #555',
  borderRadius: 4,
  color: '#eee',
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: 'inherit',
  marginBottom: 12,
  boxSizing: 'border-box',
};

export const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#111',
  border: '1px solid #555',
  borderRadius: 4,
  color: '#eee',
  padding: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  marginBottom: 12,
  boxSizing: 'border-box',
};

export const backLinkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9ec7',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
  padding: 0,
};
