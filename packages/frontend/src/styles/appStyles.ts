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

// ---- Title Screen (Rich) ----

export const titleScreenContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  fontFamily: '"M PLUS 1p", "Hiragino Kaku Gothic ProN", monospace',
  color: '#e8e8e8',
};

export const backgroundCanvasStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 0,
};

export const contentOverlayStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
};

export const glassCardStyle: React.CSSProperties = {
  width: 'min(440px, 90vw)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  background: 'rgba(12, 12, 36, 0.55)',
  border: '1px solid rgba(122, 184, 255, 0.12)',
  borderRadius: 16,
  padding: '32px 28px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(122,184,255,0.06)',
};

export const glassInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(10, 10, 30, 0.6)',
  border: '1px solid rgba(122, 184, 255, 0.2)',
  borderRadius: 8,
  color: '#e8e8e8',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  marginBottom: 16,
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s',
};

export const glassTextareaStyle: React.CSSProperties = {
  ...glassInputStyle,
  resize: 'vertical',
  padding: '10px 12px',
  minHeight: 100,
};

export const primaryButtonGlassStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #4a6fa5 0%, #2a4a7a 100%)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(90, 143, 213, 0.5)',
  borderRadius: 10,
  padding: '12px 36px',
  color: '#fff',
  fontSize: 16,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
  boxShadow: '0 0 16px rgba(74, 111, 165, 0.3)',
};

export const secondaryButtonGlassStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(122, 184, 255, 0.15)',
  borderRadius: 10,
  padding: '12px 36px',
  color: '#7a9ec7',
  fontSize: 16,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
};

export const stepHeadingStyle: React.CSSProperties = {
  fontSize: 18,
  color: '#7ab8ff',
  marginBottom: 8,
  fontWeight: 'bold',
};

export const stepDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#7a9ec7',
  lineHeight: 1.6,
  marginBottom: 20,
};

export const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 8,
};

export const wizardBackButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a9ec7',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
  padding: '8px 0',
};

export const nextButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #4a6fa5 0%, #2a4a7a 100%)',
  border: '1px solid rgba(90, 143, 213, 0.4)',
  borderRadius: 8,
  padding: '10px 28px',
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 'bold',
  transition: 'all 0.2s',
};

export const confirmButtonStyle: React.CSSProperties = {
  ...nextButtonStyle,
  padding: '14px 36px',
  fontSize: 16,
  borderRadius: 10,
  boxShadow: '0 0 20px rgba(74, 111, 165, 0.35)',
  width: '100%',
};

export const previewFieldStyle: React.CSSProperties = {
  background: 'rgba(10, 10, 30, 0.5)',
  borderRadius: 8,
  padding: '12px 14px',
  marginBottom: 14,
};

export const previewLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#5a7a9a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
};

export const previewValueStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#c8d8e8',
};

export const previewSoulStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#a0b8d0',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
};

export const errorStyle: React.CSSProperties = {
  background: 'rgba(200, 50, 50, 0.12)',
  border: '1px solid rgba(200, 80, 80, 0.3)',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#f88',
  fontSize: 12,
  marginBottom: 12,
};
