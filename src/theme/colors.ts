/**
 * Plexida Mockup Theme — Colors
 * 
 * Based directly on Plexida_full_mockup.html styling
 */

export const palette = {
  // Deep Navy Backgrounds
  navy: '#07111F',    // --navy
  navy2: '#0D1B2E',   // --navy2
  navy3: '#132338',   // --navy3
  background: '#050D18', // Base stage background

  // Brand / Accents
  violet: '#7B5CF5',  // --violet
  violet2: '#9B7FF8', // --violet2
  cyan: '#00D4FF',    // --cyan
  cyan2: '#4DE8FF',   // --cyan2
  
  // Status Accents
  green: '#4DEBA0',
  amber: '#FFD060',
  red: '#FF7070',

  // Text Colors
  silver: '#C8D0E0',  // --silver
  silver2: '#E8EDF5', // --silver2
  muted: 'rgba(200, 208, 224, 0.55)', // --muted
  white: '#FFFFFF',

  // Glassmorphic / Borders
  glass: 'rgba(255, 255, 255, 0.06)',   // --glass
  glass2: 'rgba(255, 255, 255, 0.10)',  // --glass2
  glass3: 'rgba(255, 255, 255, 0.04)',  // --glass3
  border: 'rgba(255, 255, 255, 0.10)',  // --border
  border2: 'rgba(255, 255, 255, 0.18)', // --border2

  // Gradients
  gradient: {
    hero: ['#7B5CF5', '#00D4FF'] as [string, string], // --grad
    heroLight: ['#9B7FF8', '#4DE8FF'] as [string, string], // --grad2
  }
};
